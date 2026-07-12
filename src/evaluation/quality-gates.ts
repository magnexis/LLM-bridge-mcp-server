import type { DevelopmentExecutor } from "../development/executor.js";
import type { EvidenceStore } from "../evidence/store.js";
import { getCommandDefinitionById } from "../commands/registry.js";

export type QualityGateName =
  | "typecheck"
  | "tests"
  | "build"
  | "lint"
  | "scope_review"
  | "plan_compliance"
  | "tool_registration_check"
  | "documentation_check";

export type QualityGateStatus = "ready_for_command" | "passed" | "failed" | "pending_manual_review" | "blocked";

export interface QualityGateResult {
  gate: QualityGateName;
  status: QualityGateStatus;
  blocking: boolean;
  recordedAt: string;
  summary?: string;
  evidenceId?: string;
  evidence?: Record<string, unknown>;
}

export function buildQualityGatePlan(gates: QualityGateName[]): QualityGateResult[] {
  const recordedAt = new Date().toISOString();
  return gates.map((gate) => ({
    gate,
    status: gate === "scope_review" || gate === "plan_compliance" || gate === "tool_registration_check" || gate === "documentation_check"
      ? "pending_manual_review"
      : "ready_for_command",
    blocking: true,
    recordedAt,
  }));
}

function mapGateToCommandId(gate: QualityGateName): "npm_typecheck" | "npm_test" | "npm_build" | "npm_lint" | null {
  switch (gate) {
    case "typecheck":
      return "npm_typecheck";
    case "tests":
      return "npm_test";
    case "build":
      return "npm_build";
    case "lint":
      return "npm_lint";
    default:
      return null;
  }
}

export async function runQualityGates(input: {
  gates: QualityGateName[];
  workingDirectory: string;
  proposalId: string;
  approvalId: string;
  executor: DevelopmentExecutor;
  evidenceStore?: EvidenceStore;
}): Promise<QualityGateResult[]> {
  const plan = buildQualityGatePlan(input.gates);
  const results: QualityGateResult[] = [];

  for (const gate of plan) {
    const commandId = mapGateToCommandId(gate.gate);
    if (!commandId) {
      const evidence = input.evidenceStore
        ? await input.evidenceStore.add({
            type: "quality_gate",
            title: `${gate.gate} requires manual review`,
            summary: "This quality gate currently requires explicit human review.",
            metadata: { gate: gate.gate, status: "pending_manual_review" },
          })
        : undefined;
      results.push({
        ...gate,
        status: "pending_manual_review",
        summary: "This gate currently requires explicit human review.",
        ...(evidence ? { evidenceId: evidence.id } : {}),
      });
      continue;
    }

    try {
      const command = getCommandDefinitionById(commandId);
      const output = await input.executor.runApprovedCommand({
        workingDirectory: input.workingDirectory,
        proposalId: input.proposalId,
        approvalId: input.approvalId,
        command: command.commandText,
      });
      const evidence = input.evidenceStore
        ? await input.evidenceStore.add({
            type: "command_output",
            title: `${command.label} output`,
            summary: `${command.label} completed successfully for workflow quality gating.`,
            sourceId: input.proposalId,
            metadata: output,
          })
        : undefined;
      results.push({
        ...gate,
        status: "passed",
        summary: `${gate.gate} completed successfully.`,
        evidence: output,
        ...(evidence ? { evidenceId: evidence.id } : {}),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Quality gate failed.";
      const evidence = input.evidenceStore
        ? await input.evidenceStore.add({
            type: "quality_gate",
            title: `${gate.gate} failed`,
            summary: message,
            sourceId: input.proposalId,
            metadata: { gate: gate.gate, status: "failed", message },
          })
        : undefined;
      results.push({
        ...gate,
        status: "failed",
        summary: message,
        ...(evidence ? { evidenceId: evidence.id } : {}),
      });
      break;
    }
  }

  const seen = new Set(results.map((result) => result.gate));
  for (const gate of plan) {
    if (!seen.has(gate.gate)) {
      results.push({
        ...gate,
        status: "blocked",
        summary: "Blocked because a previous quality gate failed.",
      });
    }
  }

  return results;
}
