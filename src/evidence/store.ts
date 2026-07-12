import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export type EvidenceType =
  | "repository_file"
  | "command_output"
  | "provider_response"
  | "saved_context"
  | "repository_memory"
  | "external_reference"
  | "user_statement"
  | "patch"
  | "test_result"
  | "quality_gate";

export interface EvidenceRecord {
  id: string;
  schemaVersion: 1;
  createdAt: string;
  type: EvidenceType;
  title: string;
  summary: string;
  sourceId?: string;
  metadata: Record<string, unknown>;
}

export class EvidenceStore {
  constructor(private readonly dir: string, private readonly enabled = true) {}

  private file(): string {
    return path.join(this.dir, "evidence.json");
  }

  private async readAll(): Promise<EvidenceRecord[]> {
    if (!this.enabled) return [];
    try {
      return JSON.parse(await readFile(this.file(), "utf8")) as EvidenceRecord[];
    } catch {
      return [];
    }
  }

  private async writeAll(records: EvidenceRecord[]): Promise<void> {
    if (!this.enabled) return;
    await mkdir(this.dir, { recursive: true });
    const target = this.file();
    const temp = `${target}.${randomUUID()}.tmp`;
    await writeFile(temp, JSON.stringify(records, null, 2), "utf8");
    await rename(temp, target);
  }

  async add(input: Omit<EvidenceRecord, "id" | "schemaVersion" | "createdAt">): Promise<EvidenceRecord> {
    const record: EvidenceRecord = {
      id: randomUUID(),
      schemaVersion: 1,
      createdAt: new Date().toISOString(),
      ...input,
    };
    const records = await this.readAll();
    records.push(record);
    await this.writeAll(records);
    return record;
  }

  async list(): Promise<EvidenceRecord[]> {
    return this.readAll();
  }

  async get(id: string): Promise<EvidenceRecord> {
    const record = (await this.readAll()).find((item) => item.id === id);
    if (!record) {
      throw new Error("Evidence record was not found.");
    }
    return record;
  }
}
