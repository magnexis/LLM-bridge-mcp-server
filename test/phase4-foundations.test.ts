import { afterEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PolicyStore } from "../src/policies/store.js";
import { RepositoryMemoryStore } from "../src/memory/repository-memory.js";
import { WorkflowRegistry } from "../src/workflows/registry.js";
import { DevelopmentStore } from "../src/development/store.js";
import { fetchReference, inspectWorkspace, runWorkflow } from "../src/tools/phase4.js";
import { DevelopmentExecutor } from "../src/development/executor.js";
import { JobStore } from "../src/jobs/store.js";
import { EvidenceStore } from "../src/evidence/store.js";
import { runQualityGates } from "../src/evaluation/quality-gates.js";

let root = "";

afterEach(async () => {
  if (root) {
    await rm(root, { recursive: true, force: true });
    root = "";
  }
});

describe("phase4 foundations", () => {
  it("seeds built-in policy profiles", async () => {
    root = await mkdtemp(path.join(tmpdir(), "glm-phase4-policy-"));
    const store = new PolicyStore(path.join(root, "policies"));
    const profiles = await store.list();
    expect(profiles.map((item) => item.id)).toEqual(
      expect.arrayContaining(["read_only", "safe_development", "strict_enterprise"]),
    );
  });

  it("persists repository memory provenance and status", async () => {
    root = await mkdtemp(path.join(tmpdir(), "glm-phase4-memory-"));
    const store = new RepositoryMemoryStore(path.join(root, "memory"));
    const entry = await store.upsert({
      category: "architecture",
      title: "Service startup flow",
      content: "The server starts from index.ts and registers tools in createServer.",
      provenance: "repository_file:src/index.ts",
      confidence: 0.9,
      status: "confirmed",
      evidenceIds: ["file:index"],
    });
    const fetched = await store.get(entry.id);
    expect(fetched.provenance).toBe("repository_file:src/index.ts");
    expect(fetched.status).toBe("confirmed");
  });

  it("rejects workflow definitions with missing dependencies", async () => {
    root = await mkdtemp(path.join(tmpdir(), "glm-phase4-workflow-"));
    const registry = new WorkflowRegistry(path.join(root, "workflows"));
    await expect(
      registry.create({
        id: "broken_flow",
        title: "Broken Flow",
        description: "Should fail validation.",
        steps: [
          {
            id: "propose",
            type: "propose_changes",
            title: "Propose patch",
            dependsOn: ["missing_step"],
          },
        ],
      }),
    ).rejects.toThrow("missing_step");
  });

  it("lists pending approvals from development proposals", async () => {
    root = await mkdtemp(path.join(tmpdir(), "glm-phase4-approvals-"));
    const store = new DevelopmentStore(path.join(root, "development"));
    const proposal = await store.propose({
      workingDirectory: root,
      summary: "Propose a safe README update",
      operations: [{ type: "write", path: "README.md", content: "updated" }],
      commands: ["npm run typecheck"],
    });
    const pending = await store.listPendingApprovals();
    expect(pending).toHaveLength(1);
    expect(pending[0]?.proposalId).toBe(proposal.id);
    expect(pending[0]?.approvalId).toBe(proposal.currentApprovalId);
    expect(pending[0]?.approvalStatus).toBe("pending");
  });

  it("expires approvals after the configured ttl window", async () => {
    root = await mkdtemp(path.join(tmpdir(), "glm-phase4-approval-expiry-"));
    const store = new DevelopmentStore(path.join(root, "development"));
    const proposal = await store.propose({
      workingDirectory: root,
      summary: "Propose a safe package update",
      operations: [{ type: "write", path: "package.json", content: "{}" }],
      commands: [],
    });
    const executor = new DevelopmentExecutor(store, -1);
    await executor.approve(proposal.id, proposal.currentApprovalId);
    const refreshed = await store.get(proposal.id);
    expect(refreshed.status).toBe("expired");
    expect((await store.getApprovalRecord(proposal.currentApprovalId)).status).toBe("expired");
  });

  it("rotates approval ids when a proposal materially changes", async () => {
    root = await mkdtemp(path.join(tmpdir(), "glm-phase4-approval-rotate-"));
    const store = new DevelopmentStore(path.join(root, "development"));
    const proposal = await store.propose({
      workingDirectory: root,
      summary: "Initial change summary",
      operations: [{ type: "write", path: "README.md", content: "first" }],
      commands: [],
    });
    const originalApprovalId = proposal.currentApprovalId;
    const updated = await store.update(proposal.id, { summary: "Changed summary" });
    expect(updated.currentApprovalId).not.toBe(originalApprovalId);
    expect(updated.status).toBe("pending_approval");
    const revoked = await store.getApprovalRecord(originalApprovalId);
    expect(revoked.status).toBe("revoked");
    expect(revoked.replacedByApprovalId).toBe(updated.currentApprovalId);
  });

  it("inspects workspace manifests and workspace signals", async () => {
    root = await mkdtemp(path.join(tmpdir(), "glm-phase4-workspace-"));
    await writeFile(
      path.join(root, "package.json"),
      JSON.stringify({ name: "root", workspaces: ["packages/*"] }, null, 2),
      "utf8",
    );
    await writeFile(path.join(root, "pnpm-workspace.yaml"), "packages:\n  - packages/*\n", "utf8");
    const packagesDir = path.join(root, "packages", "app");
    await mkdir(packagesDir, { recursive: true });
    await writeFile(path.join(packagesDir, "package.json"), JSON.stringify({ name: "app" }, null, 2), "utf8");
    const handler = inspectWorkspace();
    const result = await handler({ workingDirectory: root });
    const parsed = JSON.parse(result.content[0]!.text) as { packageCount: number; workspaceSignals: { npm: boolean; pnpm: boolean } };
    expect(parsed.packageCount).toBe(2);
    expect(parsed.workspaceSignals.npm).toBe(true);
    expect(parsed.workspaceSignals.pnpm).toBe(true);
  });

  it("keeps network retrieval disabled by default", async () => {
    const handler = fetchReference({
      apiKey: "test",
      provider: "zai",
      baseUrl: "https://example.com",
      textModel: "glm-5-turbo",
      visionModel: "glm-5v-turbo",
      timeoutMs: 1000,
      maxOutputTokens: 1000,
      dataDir: root || tmpdir(),
      ephemeralDataDir: false,
      privacyMode: "standard",
      logLevel: "info",
      cacheEnabled: true,
      cacheTtlSeconds: 60,
      cacheMaxEntries: 10,
      maxContextChars: 1000,
      maxFileChars: 1000,
      maxDirectoryEntries: 10,
      maxToolOutputChars: 1000,
      maxConcurrentRequests: 1,
      maxConcurrentAgentLoops: 1,
      maxRetries: 0,
      retryBaseDelayMs: 1,
      networkEnabled: false,
      networkTimeoutMs: 1000,
      networkMaxResponseChars: 1000,
      allowedDomains: [],
    });
    const result = await handler({ url: "https://example.com/docs" });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("disabled");
  });

  it("creates workflow jobs with events and quality-gate summaries", async () => {
    root = await mkdtemp(path.join(tmpdir(), "glm-phase4-workflow-job-"));
    const workflows = new WorkflowRegistry(path.join(root, "workflows"));
    const jobs = new JobStore(path.join(root, "jobs"));
    const handler = runWorkflow(workflows, jobs);
    const result = await handler({
      workflowId: "safe_refactor",
      objective: "Refactor one utility safely",
      workingDirectory: root,
      createJob: true,
      runQualityGates: ["typecheck", "scope_review"],
    });
    const parsed = JSON.parse(result.content[0]!.text) as { createdJobId: string; qualityGates: Array<{ gate: string; status: string }> };
    const job = await jobs.get(parsed.createdJobId);
    expect(job.sourceWorkflowId).toBe("safe_refactor");
    expect(job.events.some((event) => event.type === "workflow_started")).toBe(true);
    expect(parsed.qualityGates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ gate: "typecheck", status: "ready_for_command" }),
        expect.objectContaining({ gate: "scope_review", status: "pending_manual_review" }),
      ]),
    );
  });

  it("records evidence for executed quality gates", async () => {
    const workspaceRoot = process.cwd();
    root = await mkdtemp(path.join(tmpdir(), "glm-phase4-evidence-"));
    const development = new DevelopmentStore(path.join(root, "development"));
    const evidence = new EvidenceStore(path.join(root, "evidence"));
    const executor = new DevelopmentExecutor(development, 900);
    const proposal = await development.propose({
      workingDirectory: workspaceRoot,
      summary: "Run typecheck with evidence capture",
      operations: [{ type: "write", path: "README.md", content: "ok" }],
      commands: ["npm run typecheck"],
    });
    await executor.approve(proposal.id, proposal.currentApprovalId);
    const results = await runQualityGates({
      gates: ["typecheck"],
      workingDirectory: workspaceRoot,
      proposalId: proposal.id,
      approvalId: proposal.currentApprovalId,
      executor,
      evidenceStore: evidence,
    });
    const stored = await evidence.list();
    expect(results[0]?.status).toBe("passed");
    expect(stored).toHaveLength(1);
    expect(stored[0]?.type).toBe("command_output");
  });

  it("resolves approved commands against the nearest package root inside a workspace", async () => {
    root = await mkdtemp(path.join(tmpdir(), "glm-phase4-command-scope-"));
    await writeFile(path.join(root, "package.json"), JSON.stringify({ name: "root" }, null, 2), "utf8");
    const packageRoot = path.join(root, "packages", "app");
    await mkdir(packageRoot, { recursive: true });
    await mkdir(path.join(packageRoot, "src"), { recursive: true });
    await writeFile(
      path.join(packageRoot, "package.json"),
      JSON.stringify({ name: "app", scripts: { build: "node -e \"process.stdout.write(process.cwd())\"" } }, null, 2),
      "utf8",
    );
    const development = new DevelopmentStore(path.join(root, "development"));
    const executor = new DevelopmentExecutor(development, 900);
    const proposal = await development.propose({
      workingDirectory: root,
      summary: "Run build inside package root",
      operations: [{ type: "write", path: "README.md", content: "ok" }],
      commands: ["npm run build"],
    });
    await executor.approve(proposal.id, proposal.currentApprovalId);
    const output = await executor.runApprovedCommand({
      workingDirectory: path.join(packageRoot, "src"),
      command: "npm run build",
      approvalId: proposal.currentApprovalId,
      proposalId: proposal.id,
    });
    expect(output.commandWorkingDirectory).toBe(packageRoot);
  });

  it("captures evidence for repository memory writes", async () => {
    root = await mkdtemp(path.join(tmpdir(), "glm-phase4-memory-evidence-"));
    const store = new RepositoryMemoryStore(path.join(root, "memory"));
    const evidence = new EvidenceStore(path.join(root, "evidence"));
    const handler = (await import("../src/tools/phase4.js")).updateRepositoryMemory(store, evidence);
    await handler({
      category: "architecture",
      title: "Entry point",
      content: "The server entry point initializes createServer and stdio transport.",
      provenance: "repository_file:src/index.ts",
      confidence: 0.95,
      status: "confirmed",
      evidenceIds: ["file:index"],
    });
    const records = await evidence.list();
    expect(records.some((record) => record.type === "repository_memory")).toBe(true);
  });

  it("executes command-backed workflow quality gates when approval is provided", async () => {
    const workspaceRoot = process.cwd();
    root = await mkdtemp(path.join(tmpdir(), "glm-phase4-workflow-gates-"));
    const workflows = new WorkflowRegistry(path.join(root, "workflows"));
    const jobs = new JobStore(path.join(root, "jobs"));
    const development = new DevelopmentStore(path.join(root, "development"));
    const executor = new DevelopmentExecutor(development, 900);
    const proposal = await development.propose({
      workingDirectory: workspaceRoot,
      summary: "Run typecheck as a reviewed workflow gate",
      operations: [{ type: "write", path: "README.md", content: "ok" }],
      commands: ["npm run typecheck"],
    });
    await executor.approve(proposal.id, proposal.currentApprovalId);
    const handler = runWorkflow(workflows, jobs, executor);
    const result = await handler({
      workflowId: "safe_refactor",
      objective: "Run a gate-backed workflow",
      workingDirectory: workspaceRoot,
      createJob: true,
      runQualityGates: ["typecheck"],
      executeQualityGates: true,
      proposalId: proposal.id,
      approvalId: proposal.currentApprovalId,
    });
    const parsed = JSON.parse(result.content[0]!.text) as { createdJobId: string; workflowStatus: string; qualityGates: Array<{ gate: string; status: string }> };
    const job = await jobs.get(parsed.createdJobId);
    expect(parsed.workflowStatus).toBe("completed");
    expect(parsed.qualityGates).toEqual([expect.objectContaining({ gate: "typecheck", status: "passed" })]);
    expect(job.state).toBe("completed");
  });
});
