import { readdir, readFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { z } from "zod";
import type { ApiClient } from "../api/client.js";
import type { Config } from "../config.js";
import type { DevelopmentExecutor } from "../development/executor.js";
import type { DevelopmentStore } from "../development/store.js";
import type { EvidenceStore } from "../evidence/store.js";
import type { JobStore } from "../jobs/store.js";
import type { RepositoryMemoryStore } from "../memory/repository-memory.js";
import type { PolicyStore } from "../policies/store.js";
import type { WorkflowRegistry } from "../workflows/registry.js";
import { buildQualityGatePlan, runQualityGates, type QualityGateResult } from "../evaluation/quality-gates.js";
import { applyMigrationPlan, planMigration, readSchemaVersion } from "../persistence/migrations.js";
import { toolError } from "../utils/responses.js";
import { textWithUntrusted } from "../utils/prompt-security.js";

export const managePolicyProfileObject = z
  .object({
    action: z.enum(["get", "list", "upsert"]),
    profileId: z.string().trim().min(1).max(100).optional(),
    description: z.string().trim().min(5).max(1_000).optional(),
    allowWrites: z.boolean().optional(),
    requireApprovalForWrites: z.boolean().optional(),
    allowCommands: z.boolean().optional(),
    requireApprovalForCommands: z.boolean().optional(),
    allowNetwork: z.boolean().optional(),
    allowFileDeletion: z.boolean().optional(),
    allowDependencyChanges: z.boolean().optional(),
    maximumChangedFiles: z.number().int().min(0).max(1_000).optional(),
    maximumPatchChars: z.number().int().min(0).max(2_000_000).optional(),
    maximumAgentRuns: z.number().int().min(1).max(50).optional(),
    deniedPaths: z.array(z.string().trim().min(1).max(1_000)).max(100).optional(),
    allowedDomains: z.array(z.string().trim().min(1).max(255)).max(100).optional(),
    privacyMode: z.enum(["standard", "minimal_retention", "no_persistence"]).optional(),
  })
  .strict();

export const managePolicyProfileSchema = managePolicyProfileObject.superRefine((value, ctx) => {
    if (value.action === "get" && !value.profileId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["profileId"], message: "profileId is required for get." });
    }
    if (value.action === "upsert") {
      const required = [
        "profileId",
        "description",
        "allowWrites",
        "requireApprovalForWrites",
        "allowCommands",
        "requireApprovalForCommands",
        "allowNetwork",
        "allowFileDeletion",
        "allowDependencyChanges",
        "maximumChangedFiles",
        "maximumPatchChars",
        "maximumAgentRuns",
        "privacyMode",
      ] as const;
      for (const field of required) {
        if (value[field] === undefined) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message: `${field} is required for upsert.` });
        }
      }
    }
});

export const repositoryMemoryObject = z
  .object({
    action: z.enum(["get", "list", "upsert"]),
    memoryId: z.string().uuid().optional(),
    category: z
      .enum([
        "architecture",
        "conventions",
        "testing_patterns",
        "security_rules",
        "dependencies",
        "known_failures",
        "useful_commands",
        "successful_strategies",
        "failed_strategies",
      ])
      .optional(),
    title: z.string().trim().min(3).max(300).optional(),
    content: z.string().trim().min(5).max(50_000).optional(),
    provenance: z.string().trim().min(3).max(1_000).optional(),
    confidence: z.number().min(0).max(1).optional(),
    status: z.enum(["candidate", "confirmed", "rejected", "superseded"]).optional(),
    evidenceIds: z.array(z.string().trim().min(1).max(100)).max(50).default([]),
  })
  .strict();

export const repositoryMemorySchema = repositoryMemoryObject.superRefine((value, ctx) => {
    if (value.action === "get" && !value.memoryId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["memoryId"], message: "memoryId is required for get." });
    }
    if (value.action === "upsert") {
      const required = ["category", "title", "content", "provenance", "confidence", "status"] as const;
      for (const field of required) {
        if (value[field] === undefined) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message: `${field} is required for upsert.` });
        }
      }
    }
});

export const createWorkflowSchema = z
  .object({
    workflowId: z.string().trim().min(1).max(100),
    title: z.string().trim().min(3).max(200),
    description: z.string().trim().min(5).max(2_000),
    steps: z
      .array(
        z
          .object({
            id: z.string().trim().min(1).max(100),
            type: z.enum([
              "inspect_project",
              "consult_knowledge",
              "query_reasoning",
              "run_controlled_agent",
              "propose_changes",
              "run_approved_command",
            ]),
            title: z.string().trim().min(3).max(200),
            dependsOn: z.array(z.string().trim().min(1).max(100)).max(20).default([]),
            input: z.record(z.unknown()).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(20),
  })
  .strict();

export const runWorkflowSchema = z
  .object({
    workflowId: z.string().trim().min(1).max(100),
    objective: z.string().trim().min(5).max(10_000),
    workingDirectory: z.string().trim().min(1).max(10_000),
    createJob: z.boolean().default(true),
    runQualityGates: z.array(z.enum(["typecheck", "tests", "build", "lint", "scope_review", "plan_compliance"])).max(6).default([]),
    executeQualityGates: z.boolean().default(false),
    proposalId: z.string().uuid().optional(),
    approvalId: z.string().uuid().optional(),
  })
  .strict();

export const reviewChangeSetSchema = z.object({ proposalId: z.string().uuid() }).strict();
export const listPendingApprovalsSchema = z.object({}).strict();

export const inspectWorkspaceSchema = z
  .object({
    workingDirectory: z.string().trim().min(1).max(10_000),
  })
  .strict();

export const exportProjectStateSchema = z
  .object({
    includeContexts: z.boolean().default(true),
    includeSessions: z.boolean().default(true),
    includeMemory: z.boolean().default(true),
    includePolicies: z.boolean().default(true),
    includeWorkflows: z.boolean().default(true),
    includeJobs: z.boolean().default(true),
  })
  .strict();

export const importProjectStateSchema = z
  .object({
    dryRun: z.boolean().default(true),
    overwrite: z.boolean().default(false),
    payload: z.object({
      repositoryMemory: z.array(z.record(z.unknown())).optional(),
      policies: z.array(z.record(z.unknown())).optional(),
      workflows: z.array(z.record(z.unknown())).optional(),
    }).strict(),
  })
  .strict();

export const managePolicyProfile = (store: PolicyStore) => async (input: unknown) => {
  try {
    const args = managePolicyProfileSchema.parse(input);
    if (args.action === "list") {
      return { content: [{ type: "text" as const, text: JSON.stringify(await store.list(), null, 2) }] };
    }
    if (args.action === "get") {
      return { content: [{ type: "text" as const, text: JSON.stringify(await store.get(args.profileId!), null, 2) }] };
    }
    const profile = await store.upsert({
      id: args.profileId!,
      description: args.description!,
      allowWrites: args.allowWrites!,
      requireApprovalForWrites: args.requireApprovalForWrites!,
      allowCommands: args.allowCommands!,
      requireApprovalForCommands: args.requireApprovalForCommands!,
      allowNetwork: args.allowNetwork!,
      allowFileDeletion: args.allowFileDeletion!,
      allowDependencyChanges: args.allowDependencyChanges!,
      maximumChangedFiles: args.maximumChangedFiles!,
      maximumPatchChars: args.maximumPatchChars!,
      maximumAgentRuns: args.maximumAgentRuns!,
      deniedPaths: args.deniedPaths ?? [],
      allowedDomains: args.allowedDomains ?? [],
      privacyMode: args.privacyMode!,
    });
    return { content: [{ type: "text" as const, text: JSON.stringify(profile, null, 2) }] };
  } catch (error) {
    return toolError(error);
  }
};

export const inspectRepositoryMemory = (store: RepositoryMemoryStore) => async (input: unknown) => {
  try {
    const args = repositoryMemorySchema.parse(input);
    const payload =
      args.action === "get" ? await store.get(args.memoryId!) : await store.list(args.category);
    return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] };
  } catch (error) {
    return toolError(error);
  }
};

export const updateRepositoryMemory = (store: RepositoryMemoryStore, evidenceStore?: EvidenceStore) => async (input: unknown) => {
  try {
    const args = repositoryMemorySchema.parse(Object.assign({}, input as Record<string, unknown>, { action: "upsert" }));
    const entry = await store.upsert({
      ...(args.memoryId ? { id: args.memoryId } : {}),
      category: args.category!,
      title: args.title!,
      content: args.content!,
      provenance: args.provenance!,
      confidence: args.confidence!,
      status: args.status!,
      evidenceIds: args.evidenceIds,
    });
    if (evidenceStore) {
      await evidenceStore.add({
        type: "repository_memory",
        title: `Repository memory ${args.memoryId ? "updated" : "created"}: ${entry.title}`,
        summary: `${entry.category} memory persisted with status ${entry.status}.`,
        sourceId: entry.id,
        metadata: {
          provenance: entry.provenance,
          confidence: entry.confidence,
          status: entry.status,
          evidenceIds: entry.evidenceIds,
        },
      });
    }
    return { content: [{ type: "text" as const, text: JSON.stringify(entry, null, 2) }] };
  } catch (error) {
    return toolError(error);
  }
};

export const createWorkflow = (registry: WorkflowRegistry) => async (input: unknown) => {
  try {
    const args = createWorkflowSchema.parse(input);
    const workflow = await registry.create({
      id: args.workflowId,
      title: args.title,
      description: args.description,
      steps: args.steps.map((step) => ({
        id: step.id,
        type: step.type,
        title: step.title,
        dependsOn: step.dependsOn,
        ...(step.input ? { input: step.input } : {}),
      })),
    });
    return { content: [{ type: "text" as const, text: JSON.stringify(workflow, null, 2) }] };
  } catch (error) {
    return toolError(error);
  }
};

export const runWorkflow = (registry: WorkflowRegistry, jobs: JobStore, executor?: DevelopmentExecutor, evidenceStore?: EvidenceStore) => async (input: unknown) => {
  try {
    const args = runWorkflowSchema.parse(input);
    const workflow = await registry.get(args.workflowId);
    const currentTaskId = workflow.steps.find((step) => step.dependsOn.length === 0)?.id;
    const job = args.createJob
      ? await jobs.create({
          objective: args.objective,
          workingDirectory: args.workingDirectory,
          taskGraph: workflow.steps.map((step) => ({
            taskId: step.id,
            title: step.title,
            description: `${step.type} for workflow ${workflow.id}: ${args.objective}`,
            assignedRole: step.type === "propose_changes" ? "implementer" : "architect",
            dependencies: step.dependsOn,
            status: step.dependsOn.length ? "pending" : "ready",
          })),
          selectedRoles: ["architect", "implementer"],
          approvalIds: [],
          sessionIds: [],
          checkpointIds: [],
          sourceWorkflowId: workflow.id,
          ...(currentTaskId ? { currentTaskId } : {}),
          state: "planning",
        })
      : undefined;
    if (job) {
      await jobs.appendEvent(job.id, "workflow_started", `Workflow ${workflow.id} instantiated for objective: ${args.objective}`);
    }
    let qualityGates: QualityGateResult[] = buildQualityGatePlan(args.runQualityGates);
    if (args.executeQualityGates) {
      if (!executor) {
        throw new Error("Workflow quality-gate execution is unavailable because no executor was provided.");
      }
      if (!args.proposalId || !args.approvalId) {
        throw new Error("proposalId and approvalId are required when executeQualityGates is true.");
      }
      qualityGates = await runQualityGates({executor,workingDirectory:args.workingDirectory,gates:args.runQualityGates,proposalId:args.proposalId,approvalId:args.approvalId,...(evidenceStore?{evidenceStore}:{})});
      if (job) {
        const refreshed = await jobs.get(job.id);
        const hasBlockingFailure = qualityGates.some((gate) => gate.status === "failed" || gate.status === "blocked" || gate.status === "pending_manual_review");
        refreshed.state = hasBlockingFailure ? "paused" : "completed";
        refreshed.completionSummary = hasBlockingFailure
          ? "Workflow planning completed, but blocking quality gates remain unresolved."
          : "Workflow planning and requested quality gates completed successfully.";
        await jobs.save(refreshed);
        await jobs.appendEvent(job.id, hasBlockingFailure ? "approval_required" : "completed", hasBlockingFailure ? "Workflow blocked by required quality gates." : "Workflow completed with all requested command-backed gates passing.");
      }
    }
    if (evidenceStore) {
      await evidenceStore.add({
        type: "quality_gate",
        title: `Workflow run summary: ${workflow.id}`,
        summary: `Workflow ${workflow.id} completed in ${args.executeQualityGates ? "execution" : "planning"} mode with ${qualityGates.length} gate(s).`,
        sourceId: job?.id ?? workflow.id,
        metadata: {
          workflowId: workflow.id,
          createdJobId: job?.id ?? null,
          executeQualityGates: args.executeQualityGates,
          qualityGates,
        },
      });
    }
    const blockingGate = qualityGates.find((gate) => gate.status !== "passed" && gate.status !== "ready_for_command");
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              workflowId: workflow.id,
              createdJobId: job?.id ?? null,
              stepCount: workflow.steps.length,
              qualityGates,
              workflowStatus: blockingGate ? "blocked" : args.executeQualityGates ? "completed" : "planned",
              summary: "Workflow instantiated as an auditable planning job. No mutation or command execution occurred.",
            },
            null,
            2,
          ),
        },
      ],
    };
  } catch (error) {
    return toolError(error);
  }
};

export const reviewChangeSet = (store: DevelopmentStore) => async (input: unknown) => {
  try {
    const args = reviewChangeSetSchema.parse(input);
    const proposal = await store.get(args.proposalId);
    const approvals = await store.listApprovalRecords(args.proposalId);
    const audit = await store.listAudit(args.proposalId);
    return { content: [{ type: "text" as const, text: JSON.stringify({ proposal, approvals, audit }, null, 2) }] };
  } catch (error) {
    return toolError(error);
  }
};

export const listPendingApprovals = (store: DevelopmentStore) => async (input: unknown) => {
  try {
    listPendingApprovalsSchema.parse(input);
    const pending = await store.listPendingApprovals();
    return { content: [{ type: "text" as const, text: JSON.stringify(pending, null, 2) }] };
  } catch (error) {
    return toolError(error);
  }
};

export const inspectWorkspace = () => async (input: unknown) => {
  try {
    const args = inspectWorkspaceSchema.parse(input);
    const workingDirectory = path.resolve(args.workingDirectory);
    const entries = await readdir(workingDirectory, { withFileTypes: true });
    const packageFiles: string[] = [];
    async function walk(current: string, depth: number): Promise<void> {
      if (depth > 2) return;
      const localEntries = await readdir(current, { withFileTypes: true }).catch(() => []);
      for (const entry of localEntries) {
        const next = path.join(current, entry.name);
        if (entry.isDirectory() && !["node_modules", ".git", "dist", "coverage"].includes(entry.name)) {
          await walk(next, depth + 1);
        } else if (entry.isFile() && entry.name === "package.json") {
          packageFiles.push(path.relative(workingDirectory, next) || "package.json");
        }
      }
    }
    await walk(workingDirectory, 0);
    const rootPackageJson = await readFile(path.join(workingDirectory, "package.json"), "utf8").catch(() => undefined);
    const rootManifest = rootPackageJson ? (JSON.parse(rootPackageJson) as Record<string, unknown>) : undefined;
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              workingDirectory,
              packageCount: packageFiles.length,
              packageFiles,
              workspaceSignals: {
                npm: Boolean(rootManifest?.workspaces),
                pnpm: entries.some((entry) => entry.name === "pnpm-workspace.yaml"),
                turbo: entries.some((entry) => entry.name === "turbo.json"),
                nx: entries.some((entry) => entry.name === "nx.json"),
                lerna: entries.some((entry) => entry.name === "lerna.json"),
              },
            },
            null,
            2,
          ),
        },
      ],
    };
  } catch (error) {
    return toolError(error);
  }
};

export const exportProjectState =
  (policies: PolicyStore, memory: RepositoryMemoryStore, workflows: WorkflowRegistry, jobs: JobStore) =>
  async (input: unknown) => {
    try {
      const args = exportProjectStateSchema.parse(input);
      const currentVersion = await readSchemaVersion(process.cwd(), 1);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                schemaVersion: 1,
                exportedAt: new Date().toISOString(),
                repositoryMemory: args.includeMemory ? await memory.list() : [],
                policies: args.includePolicies ? await policies.list() : [],
                workflows: args.includeWorkflows ? await workflows.list() : [],
                jobs: args.includeJobs ? (await jobs.list()).map((job) => ({
                  id: job.id,
                  state: job.state,
                  objective: job.objective,
                  sourceWorkflowId: job.sourceWorkflowId ?? null,
                  updatedAt: job.updatedAt,
                })) : [],
                migrationPlan: planMigration(currentVersion, currentVersion, true),
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      return toolError(error);
    }
  };

export const importProjectState =
  (policies: PolicyStore, memory: RepositoryMemoryStore, workflows: WorkflowRegistry) =>
  async (input: unknown) => {
    try {
      const args = importProjectStateSchema.parse(input);
      const summary = {
        dryRun: args.dryRun,
        wouldImport: {
          repositoryMemory: args.payload.repositoryMemory?.length ?? 0,
          policies: args.payload.policies?.length ?? 0,
          workflows: args.payload.workflows?.length ?? 0,
        },
        migration: await applyMigrationPlan({
          dataDir: process.cwd(),
          currentVersion: await readSchemaVersion(process.cwd(), 1),
          targetVersion: 1,
          dryRun: args.dryRun,
          createBackup: !args.dryRun,
        }),
      };
      if (args.dryRun) {
        return { content: [{ type: "text" as const, text: JSON.stringify(summary, null, 2) }] };
      }
      for (const item of args.payload.repositoryMemory ?? []) {
        await memory.upsert(item as never);
      }
      for (const item of args.payload.policies ?? []) {
        await policies.upsert(item as never);
      }
      for (const item of args.payload.workflows ?? []) {
        const workflow = item as { id: string; title: string; description: string; steps: Array<unknown> };
        if (!args.overwrite) {
          await workflows.get(workflow.id).then(
            () => {
              throw new Error(`Workflow already exists: ${workflow.id}`);
            },
            () => undefined,
          );
        }
        await workflows.create({
          id: workflow.id,
          title: workflow.title,
          description: workflow.description,
          steps: workflow.steps as never,
        });
      }
      return { content: [{ type: "text" as const, text: JSON.stringify({ ...summary, imported: true }, null, 2) }] };
    } catch (error) {
      return toolError(error);
    }
  };

export const runApprovedCommandSchema = z
  .object({
    workingDirectory: z.string().trim().min(1).max(10_000),
    command: z.enum(["npm run typecheck", "npm run build", "npm run test:run", "npm run lint"]),
    approvalId: z.string().uuid(),
    proposalId: z.string().uuid(),
  })
  .strict();

export const compareModelRecommendationsSchema = z
  .object({
    question: z.string().trim().min(5).max(20_000),
    context: z.string().trim().max(100_000).optional(),
  })
  .strict();

export const evaluateModelRoutingSchema = z
  .object({
    request: z.string().trim().min(5).max(20_000),
    imagePath: z.string().trim().min(1).optional(),
  })
  .strict();

export const fetchReferenceSchema = z
  .object({
    url: z.string().url(),
    allowRedirects: z.boolean().default(true),
  })
  .strict();

export const runApprovedCommand =
  (executor: DevelopmentExecutor) =>
  async (input: unknown) => {
    try {
      const args = runApprovedCommandSchema.parse(input);
      const output = await executor.runApprovedCommand(args);
      return { content: [{ type: "text" as const, text: JSON.stringify(output, null, 2) }] };
    } catch (error) {
      return toolError(error);
    }
  };

export const compareModelRecommendations =
  (client: ApiClient, config: Config, evidenceStore?: EvidenceStore) =>
  async (input: unknown) => {
    try {
      const args = compareModelRecommendationsSchema.parse(input);
      const prompt = textWithUntrusted(args.question, [{ label: "comparison_context", content: args.context }]);
      const [reasoning, knowledge] = await Promise.all([
        client.complete({
          model: config.textModel,
          messages: [
            { role: "system", content: "Provide a concise reasoning-first recommendation with assumptions and risks." },
            { role: "user", content: prompt },
          ],
          enableReasoning: true,
        }),
        client.complete({
          model: config.textModel,
          messages: [
            { role: "system", content: "Provide an independent expert recommendation, separating facts from opinion." },
            { role: "user", content: prompt },
          ],
        }),
      ]);
      const payload = {
        question: args.question,
        reasoningRecommendation: reasoning.text,
        knowledgeRecommendation: knowledge.text,
        comparedModels: [reasoning.model, knowledge.model],
      };
      if (evidenceStore) {
        await evidenceStore.add({
          type: "provider_response",
          title: "Compared model recommendations",
          summary: "Captured reasoning and knowledge recommendations for a single comparison request.",
          metadata: payload,
        });
      }
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(payload, null, 2),
          },
        ],
      };
    } catch (error) {
      return toolError(error);
    }
  };

export const evaluateModelRouting = () => async (input: unknown) => {
  try {
    const args = evaluateModelRoutingSchema.parse(input);
    const text = args.request.toLowerCase();
    const candidates = [
      { mode: args.imagePath || /ui|layout|visual|screenshot/.test(text) ? "vision" : "knowledge", score: args.imagePath ? 1 : 0.15 },
      { mode: /implement|refactor|migration|plan|multi-step/.test(text) ? "agentic" : "knowledge", score: /implement|refactor|migration|plan|multi-step/.test(text) ? 0.85 : 0.2 },
      { mode: /architecture|tradeoff|reason|algorithm|debug/.test(text) ? "reasoning" : "knowledge", score: /architecture|tradeoff|reason|algorithm|debug/.test(text) ? 0.8 : 0.25 },
      { mode: "knowledge", score: 0.4 },
    ];
    candidates.sort((a, b) => b.score - a.score);
    return { content: [{ type: "text" as const, text: JSON.stringify({ selectedMode: candidates[0]?.mode ?? "knowledge", candidates }, null, 2) }] };
  } catch (error) {
    return toolError(error);
  }
};

export const fetchReference =
  (config: Config, fetchFn: typeof fetch = fetch) =>
  async (input: unknown) => {
    try {
      const args = fetchReferenceSchema.parse(input);
      if (!config.networkEnabled) {
        throw new Error("Network retrieval is disabled by configuration.");
      }
      const url = new URL(args.url);
      if (url.protocol !== "https:") {
        throw new Error("Only HTTPS URLs are allowed.");
      }
      if (url.username || url.password) {
        throw new Error("Credential-bearing URLs are not allowed.");
      }
      const hostname = url.hostname.toLowerCase();
      if (hostname === "localhost" || hostname.endsWith(".localhost")) {
        throw new Error("Localhost targets are not allowed.");
      }
      if (net.isIP(hostname)) {
        const ipv4Private = /^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(hostname);
        const ipv6Private = hostname === "::1" || hostname.startsWith("fc") || hostname.startsWith("fd") || hostname.startsWith("fe80:");
        if (ipv4Private || ipv6Private) {
          throw new Error("Private, loopback, and link-local IP targets are not allowed.");
        }
      }
      const allowlisted =
        config.allowedDomains.length === 0 ||
        config.allowedDomains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
      if (!allowlisted) {
        throw new Error("URL domain is not allowlisted.");
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), config.networkTimeoutMs);
      const response = await fetchFn(url, { signal: controller.signal, redirect: args.allowRedirects ? "follow" : "error" }).finally(() => clearTimeout(timer));
      if (!response.ok) {
        throw new Error(`Reference fetch failed with status ${response.status}.`);
      }
      const contentType = response.headers.get("content-type") ?? "";
      if (!/(text|json|xml|javascript|yaml|html|x-www-form-urlencoded)/i.test(contentType)) {
        throw new Error("Only text-like content types are allowed.");
      }
      const text = (await response.text()).slice(0, config.networkMaxResponseChars);
      return { content: [{ type: "text" as const, text: JSON.stringify({ url: url.toString(), finalUrl: response.url, redirected: response.redirected, status: response.status, contentType, text }, null, 2) }] };
    } catch (error) {
      return toolError(error);
    }
  };
