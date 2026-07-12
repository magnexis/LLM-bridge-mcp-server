import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export type PrivacyMode = "standard" | "minimal_retention" | "no_persistence";

export interface PolicyProfile {
  id: string;
  schemaVersion: 1;
  createdAt: string;
  updatedAt: string;
  description: string;
  allowWrites: boolean;
  requireApprovalForWrites: boolean;
  allowCommands: boolean;
  requireApprovalForCommands: boolean;
  allowNetwork: boolean;
  allowFileDeletion: boolean;
  allowDependencyChanges: boolean;
  maximumChangedFiles: number;
  maximumPatchChars: number;
  maximumAgentRuns: number;
  deniedPaths: string[];
  allowedDomains: string[];
  privacyMode: PrivacyMode;
}

const builtinProfiles: Array<Omit<PolicyProfile, "createdAt" | "updatedAt">> = [
  {
    id: "read_only",
    schemaVersion: 1,
    description: "Inspection only. No writes, commands, or network retrieval.",
    allowWrites: false,
    requireApprovalForWrites: true,
    allowCommands: false,
    requireApprovalForCommands: true,
    allowNetwork: false,
    allowFileDeletion: false,
    allowDependencyChanges: false,
    maximumChangedFiles: 0,
    maximumPatchChars: 0,
    maximumAgentRuns: 4,
    deniedPaths: [],
    allowedDomains: [],
    privacyMode: "minimal_retention",
  },
  {
    id: "safe_development",
    schemaVersion: 1,
    description: "Scoped file changes and approved local validation commands.",
    allowWrites: true,
    requireApprovalForWrites: true,
    allowCommands: true,
    requireApprovalForCommands: true,
    allowNetwork: false,
    allowFileDeletion: false,
    allowDependencyChanges: false,
    maximumChangedFiles: 25,
    maximumPatchChars: 200_000,
    maximumAgentRuns: 8,
    deniedPaths: [],
    allowedDomains: [],
    privacyMode: "standard",
  },
  {
    id: "strict_enterprise",
    schemaVersion: 1,
    description: "High-friction mode with tight write, command, and retention limits.",
    allowWrites: true,
    requireApprovalForWrites: true,
    allowCommands: true,
    requireApprovalForCommands: true,
    allowNetwork: false,
    allowFileDeletion: false,
    allowDependencyChanges: false,
    maximumChangedFiles: 10,
    maximumPatchChars: 100_000,
    maximumAgentRuns: 6,
    deniedPaths: [".env", ".env.*", ".git", ".ssh", ".aws"],
    allowedDomains: [],
    privacyMode: "minimal_retention",
  },
  {
    id: "ui_review",
    schemaVersion: 1,
    description: "Visual analysis with no write access and optional screenshots only.",
    allowWrites: false,
    requireApprovalForWrites: true,
    allowCommands: false,
    requireApprovalForCommands: true,
    allowNetwork: false,
    allowFileDeletion: false,
    allowDependencyChanges: false,
    maximumChangedFiles: 0,
    maximumPatchChars: 0,
    maximumAgentRuns: 4,
    deniedPaths: [],
    allowedDomains: [],
    privacyMode: "standard",
  },
  {
    id: "dependency_maintenance",
    schemaVersion: 1,
    description: "Approved dependency and validation work with tighter change limits.",
    allowWrites: true,
    requireApprovalForWrites: true,
    allowCommands: true,
    requireApprovalForCommands: true,
    allowNetwork: false,
    allowFileDeletion: false,
    allowDependencyChanges: true,
    maximumChangedFiles: 20,
    maximumPatchChars: 150_000,
    maximumAgentRuns: 8,
    deniedPaths: [],
    allowedDomains: [],
    privacyMode: "standard",
  },
];

function stamp(value: Omit<PolicyProfile, "createdAt" | "updatedAt">): PolicyProfile {
  const now = new Date().toISOString();
  return { ...value, createdAt: now, updatedAt: now };
}

export class PolicyStore {
  constructor(private readonly dir: string) {}

  private file(id: string): string {
    return path.join(this.dir, `${id}.json`);
  }

  async init(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    const existing = new Set(await readdir(this.dir).catch(() => []));
    for (const profile of builtinProfiles) {
      const name = `${profile.id}.json`;
      if (!existing.has(name)) {
        await this.save(stamp(profile));
      }
    }
  }

  async save(profile: PolicyProfile): Promise<PolicyProfile> {
    await mkdir(this.dir, { recursive: true });
    const target = this.file(profile.id);
    const temp = `${target}.${randomUUID()}.tmp`;
    const next = { ...profile, updatedAt: new Date().toISOString() };
    await writeFile(temp, JSON.stringify(next, null, 2), "utf8");
    await rename(temp, target);
    return next;
  }

  async get(id: string): Promise<PolicyProfile> {
    await this.init();
    return JSON.parse(await readFile(this.file(id), "utf8")) as PolicyProfile;
  }

  async list(): Promise<PolicyProfile[]> {
    await this.init();
    const files = (await readdir(this.dir)).filter((entry) => entry.endsWith(".json")).sort();
    return Promise.all(files.map((entry) => this.get(entry.slice(0, -5))));
  }

  async upsert(
    input: Omit<PolicyProfile, "createdAt" | "updatedAt" | "schemaVersion"> & {
      schemaVersion?: 1;
    },
  ): Promise<PolicyProfile> {
    const existing = await readFile(this.file(input.id), "utf8")
      .then((data) => JSON.parse(data) as PolicyProfile)
      .catch(() => undefined);
    const now = new Date().toISOString();
    return this.save({
      ...input,
      schemaVersion: 1,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });
  }
}
