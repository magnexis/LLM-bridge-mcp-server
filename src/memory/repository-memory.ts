import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export type MemoryCategory =
  | "architecture"
  | "conventions"
  | "testing_patterns"
  | "security_rules"
  | "dependencies"
  | "known_failures"
  | "useful_commands"
  | "successful_strategies"
  | "failed_strategies";

export type MemoryStatus = "candidate" | "confirmed" | "rejected" | "superseded";

export interface RepositoryMemoryEntry {
  id: string;
  schemaVersion: 1;
  createdAt: string;
  updatedAt: string;
  category: MemoryCategory;
  title: string;
  content: string;
  provenance: string;
  confidence: number;
  status: MemoryStatus;
  evidenceIds: string[];
}

export class RepositoryMemoryStore {
  private readonly filePath: string;

  constructor(private readonly dir: string) {
    this.filePath = path.join(dir, "repository-memory.json");
  }

  private async readAll(): Promise<RepositoryMemoryEntry[]> {
    try {
      return JSON.parse(await readFile(this.filePath, "utf8")) as RepositoryMemoryEntry[];
    } catch {
      return [];
    }
  }

  private async writeAll(entries: RepositoryMemoryEntry[]): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    const temp = `${this.filePath}.${randomUUID()}.tmp`;
    await writeFile(temp, JSON.stringify(entries, null, 2), "utf8");
    await rename(temp, this.filePath);
  }

  async list(category?: MemoryCategory): Promise<RepositoryMemoryEntry[]> {
    const entries = await this.readAll();
    return category ? entries.filter((entry) => entry.category === category) : entries;
  }

  async get(id: string): Promise<RepositoryMemoryEntry> {
    const entry = (await this.readAll()).find((item) => item.id === id);
    if (!entry) {
      throw new Error("Repository memory entry was not found.");
    }
    return entry;
  }

  async upsert(
    input: Omit<RepositoryMemoryEntry, "id" | "schemaVersion" | "createdAt" | "updatedAt"> & {
      id?: string;
    },
  ): Promise<RepositoryMemoryEntry> {
    const entries = await this.readAll();
    const now = new Date().toISOString();
    const existingIndex = input.id ? entries.findIndex((item) => item.id === input.id) : -1;
    const existing = existingIndex >= 0 ? entries[existingIndex] : undefined;
    const next: RepositoryMemoryEntry = {
      id: input.id ?? randomUUID(),
      schemaVersion: 1,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      category: input.category,
      title: input.title,
      content: input.content,
      provenance: input.provenance,
      confidence: input.confidence,
      status: input.status,
      evidenceIds: [...input.evidenceIds].sort(),
    };
    if (existingIndex >= 0) {
      entries[existingIndex] = next;
    } else {
      entries.push(next);
    }
    entries.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    await this.writeAll(entries);
    return next;
  }
}
