import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { PrivacyMode } from "../policies/store.js";

export function resolveRuntimeDataDir(baseDir: string, privacyMode: PrivacyMode): { dataDir: string; ephemeral: boolean } {
  if (privacyMode === "no_persistence") {
    return {
      dataDir: path.join(tmpdir(), `llm-bridge-ephemeral-${process.pid}-${randomUUID()}`),
      ephemeral: true,
    };
  }
  return { dataDir: baseDir, ephemeral: false };
}

export async function cleanupRuntimeDataDir(dataDir: string, ephemeral: boolean): Promise<void> {
  if (!ephemeral) return;
  await rm(dataDir, { recursive: true, force: true });
}
