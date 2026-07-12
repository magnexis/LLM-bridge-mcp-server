/** Persistent, append-only records for approval-gated development operations. */
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export interface ChangeOperation {
  type: "write" | "delete";
  path: string;
  content?: string;
}

export type ProposalStatus = "pending_approval" | "approved" | "applied" | "rolled_back" | "expired" | "revoked";
export type ApprovalStatus = "pending" | "approved" | "consumed" | "expired" | "revoked";

export interface ChangeProposal {
  id: string;
  workingDirectory: string;
  summary: string;
  operations: ChangeOperation[];
  commands: string[];
  createdAt: string;
  status: ProposalStatus;
  currentApprovalId: string;
  approvalIssuedAt: string;
  approvedAt?: string;
  approvalExpiresAt?: string;
  approvalConsumedAt?: string;
  checkpointId?: string;
}

export interface ApprovalRecord {
  id: string;
  proposalId: string;
  schemaVersion: 1;
  issuedAt: string;
  status: ApprovalStatus;
  revisionSummary: string;
  workingDirectory: string;
  operationCount: number;
  commandCount: number;
  approvedAt?: string;
  approvedBy?: string;
  approvalExpiresAt?: string;
  consumedAt?: string;
  revokedAt?: string;
  replacedByApprovalId?: string;
  revocationReason?: string;
  metadata: Record<string, unknown>;
  reissuedFromApprovalId?: string;
}

export interface AuditEntry {
  id: string;
  proposalId: string;
  action: "proposed" | "approved" | "applied" | "rolled_back" | "failed" | "reissued" | "revoked";
  timestamp: string;
  detail: string;
}

export interface PendingApprovalSummary {
  proposalId: string;
  approvalId: string;
  status: ProposalStatus;
  approvalStatus: ApprovalStatus;
  workingDirectory: string;
  summary: string;
  operationCount: number;
  commandCount: number;
  createdAt: string;
  approvalIssuedAt: string;
  approvedAt: string | null;
  approvalExpiresAt: string | null;
  approvalConsumedAt: string | null;
  approvalInstruction: string;
}

export class DevelopmentStore {
  constructor(private readonly dir: string) {}

  private file(name: string) {
    return path.join(this.dir, name);
  }

  async init() {
    await mkdir(this.dir, { recursive: true });
  }

  private async read<T>(name: string): Promise<T[]> {
    try {
      return JSON.parse(await readFile(this.file(name), "utf8")) as T[];
    } catch {
      return [];
    }
  }

  private async write<T>(name: string, data: T[]) {
    await this.init();
    const target = this.file(name);
    const temp = `${target}.${randomUUID()}.tmp`;
    await writeFile(temp, JSON.stringify(data, null, 2), "utf8");
    await rename(temp, target);
  }

  private normalizeProposal(item: ChangeProposal): ChangeProposal {
    if (
      item.status === "approved" &&
      item.approvalExpiresAt &&
      Date.parse(item.approvalExpiresAt) <= Date.now() &&
      !item.approvalConsumedAt
    ) {
      return { ...item, status: "expired" };
    }
    return item;
  }

  private createApprovalRecord(item: ChangeProposal, approvalId = item.currentApprovalId): ApprovalRecord {
    return {
      id: approvalId,
      proposalId: item.id,
      schemaVersion: 1,
      issuedAt: item.approvalIssuedAt,
      status: item.status === "approved" ? "approved" : item.status === "expired" ? "expired" : "pending",
      revisionSummary: item.summary,
      workingDirectory: item.workingDirectory,
      operationCount: item.operations.length,
      commandCount: item.commands.length,
      ...(item.approvedAt ? { approvedAt: item.approvedAt } : {}),
      ...(item.approvalExpiresAt ? { approvalExpiresAt: item.approvalExpiresAt } : {}),
      ...(item.approvalConsumedAt ? { consumedAt: item.approvalConsumedAt } : {}),
      metadata: {
        commands: [...item.commands],
        operationPaths: item.operations.map((operation) => operation.path),
        proposalStatus: item.status,
      },
    };
  }

  private async listApprovalRecordsRaw(): Promise<ApprovalRecord[]> {
    return this.read<ApprovalRecord>("approvals.json");
  }

  private async writeApprovalRecords(records: ApprovalRecord[]): Promise<void> {
    await this.write("approvals.json", records);
  }

  private async syncApprovalRecordFromProposal(
    proposal: ChangeProposal,
    options?: {
      approvedBy?: string;
      replacedByApprovalId?: string;
      revocationReason?: string;
    },
  ): Promise<void> {
    const records = await this.listApprovalRecordsRaw();
    const index = records.findIndex((record) => record.id === proposal.currentApprovalId);
    const existing = index >= 0 ? records[index] : undefined;
    const next = this.createApprovalRecord(proposal);
    if (existing?.approvedBy) {
      next.approvedBy = existing.approvedBy;
    }
    if (options?.approvedBy) {
      next.approvedBy = options.approvedBy;
    }
    if (options?.replacedByApprovalId) {
      next.replacedByApprovalId = options.replacedByApprovalId;
    }
    if (options?.revocationReason) {
      next.revocationReason = options.revocationReason;
    }
    if (index >= 0) {
      records[index] = { ...existing, ...next };
    } else {
      records.push(next);
    }
    await this.writeApprovalRecords(records);
  }

  private async revokeApprovalRecord(approvalId: string, reason: string, replacedByApprovalId?: string): Promise<void> {
    const records = await this.listApprovalRecordsRaw();
    const index = records.findIndex((record) => record.id === approvalId);
    if (index < 0) {
      return;
    }
    records[index] = {
      ...records[index]!,
      status: records[index]!.status === "consumed" ? "consumed" : "revoked",
      revokedAt: records[index]!.revokedAt ?? new Date().toISOString(),
      revocationReason: reason,
      ...(replacedByApprovalId ? { replacedByApprovalId } : {}),
    };
    await this.writeApprovalRecords(records);
  }

  private withNewApproval(item: ChangeProposal): ChangeProposal {
    const { approvedAt, approvalExpiresAt, approvalConsumedAt, ...rest } = item;
    void approvedAt;
    void approvalExpiresAt;
    void approvalConsumedAt;
    return {
      ...rest,
      currentApprovalId: randomUUID(),
      approvalIssuedAt: new Date().toISOString(),
      status: "pending_approval",
    };
  }

  private async replaceApproval(
    proposal: ChangeProposal,
    reason: string,
    approvedBy = "host",
  ): Promise<ChangeProposal> {
    const previousApprovalId = proposal.currentApprovalId;
    const { approvedAt, approvalExpiresAt, approvalConsumedAt, ...rest } = proposal;
    void approvedAt;
    void approvalExpiresAt;
    void approvalConsumedAt;
    const next = this.withNewApproval({ ...rest, status: "pending_approval" });
    const all = await this.read<ChangeProposal>("proposals.json");
    const at = all.findIndex((entry) => entry.id === proposal.id);
    if (at < 0) throw new Error("Change proposal was not found.");
    all[at] = next;
    await this.write("proposals.json", all);
    await this.revokeApprovalRecord(previousApprovalId, reason, next.currentApprovalId);
    await this.syncApprovalRecordFromProposal(next, { approvedBy });
    const records = await this.listApprovalRecordsRaw();
    const index = records.findIndex((record) => record.id === next.currentApprovalId);
    if (index >= 0) {
      records[index] = { ...records[index]!, reissuedFromApprovalId: previousApprovalId };
      await this.writeApprovalRecords(records);
    }
    return next;
  }

  async propose(value: Omit<ChangeProposal, "id" | "createdAt" | "status" | "currentApprovalId" | "approvalIssuedAt">) {
    const now = new Date().toISOString();
    const item: ChangeProposal = {
      ...value,
      id: randomUUID(),
      createdAt: now,
      status: "pending_approval",
      currentApprovalId: randomUUID(),
      approvalIssuedAt: now,
    };
    const all = await this.read<ChangeProposal>("proposals.json");
    all.push(item);
    await this.write("proposals.json", all);
    await this.syncApprovalRecordFromProposal(item);
    await this.audit(item.id, "proposed", item.summary);
    return item;
  }

  async get(id: string): Promise<ChangeProposal> {
    const item = (await this.read<ChangeProposal>("proposals.json")).find((entry) => entry.id === id);
    if (!item) {
      throw new Error("Change proposal was not found.");
    }
    const normalized = this.normalizeProposal(item);
    if (normalized.status !== item.status) {
      await this.update(id, { status: normalized.status });
      return this.get(id);
    }
    await this.syncApprovalRecordFromProposal(normalized);
    return normalized;
  }

  async getByApprovalId(approvalId: string): Promise<{ proposal: ChangeProposal; approval: ApprovalRecord }> {
    const approval = await this.getApprovalRecord(approvalId);
    const proposal = await this.get(approval.proposalId);
    return {
      proposal,
      approval: await this.getApprovalRecord(approvalId),
    };
  }

  async listProposals() {
    const proposals = await this.read<ChangeProposal>("proposals.json");
    return Promise.all(proposals.map((proposal) => this.get(proposal.id)));
  }

  async listApprovalRecords(proposalId?: string): Promise<ApprovalRecord[]> {
    const records = (await this.listApprovalRecordsRaw()).map((record) =>
      record.status === "approved" && record.approvalExpiresAt && Date.parse(record.approvalExpiresAt) <= Date.now() && !record.consumedAt
        ? { ...record, status: "expired" as const }
        : record,
    );
    return proposalId ? records.filter((record) => record.proposalId === proposalId) : records;
  }

  async getApprovalRecord(approvalId: string): Promise<ApprovalRecord> {
    const record = (await this.listApprovalRecords()).find((entry) => entry.id === approvalId);
    if (!record) {
      throw new Error("Approval record was not found.");
    }
    return record;
  }

  async listPendingApprovals(): Promise<PendingApprovalSummary[]> {
    const proposals = await this.listProposals();
    const approvals = await this.listApprovalRecords();
    return proposals
      .filter((proposal) => proposal.status === "pending_approval" || proposal.status === "approved")
      .map((proposal) => {
        const approval = approvals.find((record) => record.id === proposal.currentApprovalId);
        return {
          proposalId: proposal.id,
          approvalId: proposal.currentApprovalId,
          status: proposal.status,
          approvalStatus: approval?.status ?? "pending",
          workingDirectory: proposal.workingDirectory,
          summary: proposal.summary,
          operationCount: proposal.operations.length,
          commandCount: proposal.commands.length,
          createdAt: proposal.createdAt,
          approvalIssuedAt: proposal.approvalIssuedAt,
          approvedAt: proposal.approvedAt ?? null,
          approvalExpiresAt: proposal.approvalExpiresAt ?? null,
          approvalConsumedAt: proposal.approvalConsumedAt ?? null,
          approvalInstruction:
            "Use the listed approvalId for the exact proposal revision. Approval IDs rotate when the proposal materially changes and cannot be reused once consumed.",
        };
      });
  }

  async update(id: string, changes: Partial<ChangeProposal>) {
    const all = await this.read<ChangeProposal>("proposals.json");
    const at = all.findIndex((entry) => entry.id === id);
    if (at < 0) {
      throw new Error("Change proposal was not found.");
    }
    const old = all[at]!;
    let next: ChangeProposal = { ...old, ...changes, id };
    const materialChange = ["workingDirectory", "summary", "operations", "commands"].some((key) => key in changes);
    const previousApprovalId = old.currentApprovalId;
    if (materialChange && old.status !== "applied" && old.status !== "rolled_back") {
      next = this.withNewApproval(next);
    }
    all[at] = next;
    await this.write("proposals.json", all);
    if (materialChange && previousApprovalId !== next.currentApprovalId) {
      await this.revokeApprovalRecord(
        previousApprovalId,
        "Proposal materially changed; previous approval was invalidated.",
        next.currentApprovalId,
      );
    }
    await this.syncApprovalRecordFromProposal(next);
    if (materialChange) {
      await this.audit(id, "proposed", "Proposal materially changed; previous approval invalidated and a new approval ID was issued.");
    }
    return next;
  }

  async markApprovalApproved(proposalId: string, approvalId: string, expiresAt: string, approvedBy = "host") {
    const proposal = await this.get(proposalId);
    if (proposal.currentApprovalId !== approvalId) {
      throw new Error("approvalId must match the current approval ID for this exact proposal revision.");
    }
    const updated = await this.update(proposalId, {
      approvedAt: new Date().toISOString(),
      approvalExpiresAt: expiresAt,
      status: "approved",
    });
    await this.syncApprovalRecordFromProposal(updated, { approvedBy });
    return updated;
  }

  async reissueApproval(proposalId: string, approvalId: string, reason = "Approval was reissued for the current proposal revision.", approvedBy = "host") {
    const proposal = await this.get(proposalId);
    if (proposal.currentApprovalId !== approvalId) {
      throw new Error("approvalId must match the current approval ID for this exact proposal revision.");
    }
    const updated = await this.replaceApproval(proposal, reason, approvedBy);
    await this.audit(proposalId, "reissued", `${reason} New approval ID issued.`);
    return updated;
  }

  async revokeApproval(proposalId: string, approvalId: string, reason = "Approval was revoked.") {
    const proposal = await this.get(proposalId);
    if (proposal.currentApprovalId !== approvalId) {
      throw new Error("approvalId must match the current approval ID for this exact proposal revision.");
    }
    const proposals = await this.read<ChangeProposal>("proposals.json");
    const index = proposals.findIndex((entry) => entry.id === proposalId);
    if (index < 0) {
      throw new Error("Change proposal was not found.");
    }
    const { approvedAt, approvalExpiresAt, approvalConsumedAt, ...rest } = proposal;
    void approvedAt;
    void approvalExpiresAt;
    void approvalConsumedAt;
    const updated: ChangeProposal = { ...rest, status: "revoked" };
    proposals[index] = updated;
    await this.write("proposals.json", proposals);
    await this.revokeApprovalRecord(approvalId, reason);
    await this.syncApprovalRecordFromProposal(updated);
    await this.audit(proposalId, "revoked", reason);
    return updated;
  }

  async markApprovalConsumed(proposalId: string, approvalId: string) {
    const proposal = await this.get(proposalId);
    if (proposal.currentApprovalId !== approvalId) {
      throw new Error("approvalId must match the current approval ID for this exact proposal revision.");
    }
    const updated = await this.update(proposalId, {
      approvalConsumedAt: new Date().toISOString(),
      status: "applied",
    });
    const records = await this.listApprovalRecordsRaw();
    const index = records.findIndex((record) => record.id === approvalId);
    if (index >= 0) {
      records[index] = {
        ...records[index]!,
        status: "consumed",
        ...(updated.approvalConsumedAt ? { consumedAt: updated.approvalConsumedAt } : {}),
        metadata: { ...records[index]!.metadata, proposalStatus: updated.status },
      };
      await this.writeApprovalRecords(records);
    }
    return updated;
  }

  async expireApproval(proposalId: string, approvalId: string) {
    const proposal = await this.get(proposalId);
    if (proposal.currentApprovalId !== approvalId) {
      return proposal;
    }
    const updated = await this.update(proposalId, { status: "expired" });
    const records = await this.listApprovalRecordsRaw();
    const index = records.findIndex((record) => record.id === approvalId);
    if (index >= 0) {
      records[index] = { ...records[index]!, status: "expired" };
      await this.writeApprovalRecords(records);
    }
    return updated;
  }

  async audit(proposalId: string, action: AuditEntry["action"], detail: string) {
    const all = await this.read<AuditEntry>("audit.json");
    all.push({ id: randomUUID(), proposalId, action, timestamp: new Date().toISOString(), detail });
    await this.write("audit.json", all);
  }

  async listAudit(proposalId?: string) {
    const all = await this.read<AuditEntry>("audit.json");
    return proposalId ? all.filter((entry) => entry.proposalId === proposalId) : all;
  }
}
