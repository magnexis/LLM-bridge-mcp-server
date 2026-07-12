import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export type WorkflowStepType =
  | "inspect_project"
  | "consult_knowledge"
  | "query_reasoning"
  | "run_controlled_agent"
  | "propose_changes"
  | "run_approved_command";

export interface WorkflowStep {
  id: string;
  type: WorkflowStepType;
  title: string;
  dependsOn: string[];
  input?: Record<string, unknown>;
}

export interface WorkflowDefinition {
  id: string;
  schemaVersion: 1;
  createdAt: string;
  updatedAt: string;
  title: string;
  description: string;
  steps: WorkflowStep[];
  builtIn: boolean;
}

const builtins: Array<Omit<WorkflowDefinition, "createdAt" | "updatedAt">> = [
  {
    id: "repository_audit",
    schemaVersion: 1,
    title: "Repository Audit",
    description: "Inspect project structure and request a second-opinion audit.",
    builtIn: true,
    steps: [
      { id: "inspect", type: "inspect_project", title: "Inspect repository", dependsOn: [] },
      { id: "audit", type: "consult_knowledge", title: "Generate audit", dependsOn: ["inspect"] },
    ],
  },
  {
    id: "fix_failing_tests",
    schemaVersion: 1,
    title: "Fix Failing Tests",
    description: "Inspect the project, reason about failures, then propose a focused change set.",
    builtIn: true,
    steps: [
      { id: "inspect", type: "inspect_project", title: "Inspect repository", dependsOn: [] },
      { id: "reason", type: "query_reasoning", title: "Analyze failure", dependsOn: ["inspect"] },
      { id: "patch", type: "propose_changes", title: "Propose a patch", dependsOn: ["reason"] },
    ],
  },
  {
    id: "safe_refactor",
    schemaVersion: 1,
    title: "Safe Refactor",
    description: "Plan a change, audit risks, and prepare an approval-gated patch.",
    builtIn: true,
    steps: [
      { id: "reason", type: "query_reasoning", title: "Plan refactor", dependsOn: [] },
      { id: "patch", type: "propose_changes", title: "Prepare patch proposal", dependsOn: ["reason"] },
    ],
  },
  {
    id: "dependency_upgrade",
    schemaVersion: 1,
    title: "Dependency Upgrade",
    description: "Assess upgrade risk and stage an approved dependency change workflow.",
    builtIn: true,
    steps: [
      { id: "inspect", type: "inspect_project", title: "Inspect repository", dependsOn: [] },
      { id: "reason", type: "query_reasoning", title: "Assess dependency impact", dependsOn: ["inspect"] },
      { id: "patch", type: "propose_changes", title: "Stage upgrade patch", dependsOn: ["reason"] },
    ],
  },
  {
    id: "security_remediation",
    schemaVersion: 1,
    title: "Security Remediation",
    description: "Audit a security concern and prepare a constrained remediation plan.",
    builtIn: true,
    steps: [
      { id: "audit", type: "query_reasoning", title: "Analyze issue", dependsOn: [] },
      { id: "patch", type: "propose_changes", title: "Prepare remediation patch", dependsOn: ["audit"] },
    ],
  },
  {
    id: "release_readiness",
    schemaVersion: 1,
    title: "Release Readiness",
    description: "Inspect the project and summarize release blockers and validation requirements.",
    builtIn: true,
    steps: [
      { id: "inspect", type: "inspect_project", title: "Inspect repository", dependsOn: [] },
      { id: "summary", type: "consult_knowledge", title: "Summarize readiness", dependsOn: ["inspect"] },
    ],
  },
  {
    id: "ui_quality_review",
    schemaVersion: 1,
    title: "UI Quality Review",
    description: "Use the visual auditing path for screenshot-based review.",
    builtIn: true,
    steps: [{ id: "review", type: "consult_knowledge", title: "Prepare UI review guidance", dependsOn: [] }],
  },
  {
    id: "documentation_refresh",
    schemaVersion: 1,
    title: "Documentation Refresh",
    description: "Inspect code paths, reason about gaps, and propose doc updates.",
    builtIn: true,
    steps: [
      { id: "inspect", type: "inspect_project", title: "Inspect repository", dependsOn: [] },
      { id: "reason", type: "query_reasoning", title: "Identify doc gaps", dependsOn: ["inspect"] },
      { id: "patch", type: "propose_changes", title: "Propose documentation changes", dependsOn: ["reason"] },
    ],
  },
];

function validateWorkflow(definition: WorkflowDefinition): void {
  if (definition.steps.length < 1 || definition.steps.length > 20) {
    throw new Error("Workflow step count must be between 1 and 20.");
  }
  const ids = new Set<string>();
  for (const step of definition.steps) {
    if (ids.has(step.id)) {
      throw new Error(`Workflow step ID is duplicated: ${step.id}`);
    }
    ids.add(step.id);
  }
  for (const step of definition.steps) {
    for (const dependency of step.dependsOn) {
      if (!ids.has(dependency)) {
        throw new Error(`Workflow dependency is missing: ${dependency}`);
      }
      if (dependency === step.id) {
        throw new Error(`Workflow step cannot depend on itself: ${step.id}`);
      }
    }
  }
}

export class WorkflowRegistry {
  constructor(private readonly dir: string) {}

  private file(id: string): string {
    return path.join(this.dir, `${id}.json`);
  }

  async init(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    for (const workflow of builtins) {
      const full = path.join(this.dir, `${workflow.id}.json`);
      const exists = await readFile(full, "utf8").catch(() => undefined);
      if (!exists) {
        const now = new Date().toISOString();
        await this.save({ ...workflow, createdAt: now, updatedAt: now });
      }
    }
  }

  async save(definition: WorkflowDefinition): Promise<WorkflowDefinition> {
    validateWorkflow(definition);
    await mkdir(this.dir, { recursive: true });
    const target = this.file(definition.id);
    const temp = `${target}.${randomUUID()}.tmp`;
    const next = { ...definition, updatedAt: new Date().toISOString() };
    await writeFile(temp, JSON.stringify(next, null, 2), "utf8");
    await rename(temp, target);
    return next;
  }

  async get(id: string): Promise<WorkflowDefinition> {
    await this.init();
    return JSON.parse(await readFile(this.file(id), "utf8")) as WorkflowDefinition;
  }

  async list(): Promise<WorkflowDefinition[]> {
    await this.init();
    const { readdir } = await import("node:fs/promises");
    const files = (await readdir(this.dir)).filter((name) => name.endsWith(".json")).sort();
    return Promise.all(files.map((name) => this.get(name.slice(0, -5))));
  }

  async create(input: Omit<WorkflowDefinition, "schemaVersion" | "createdAt" | "updatedAt" | "builtIn">): Promise<WorkflowDefinition> {
    const now = new Date().toISOString();
    return this.save({
      ...input,
      schemaVersion: 1,
      createdAt: now,
      updatedAt: now,
      builtIn: false,
    });
  }
}
