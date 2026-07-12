import { copyFile, mkdir, readdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";

export interface MigrationPlan {
  currentVersion: number;
  targetVersion: number;
  steps: string[];
  dryRun: boolean;
}

export interface AppliedMigrationResult {
  currentVersion: number;
  targetVersion: number;
  appliedSteps: string[];
  backupDirectory: string | null;
  dryRun: boolean;
}

const orderedSteps = [{ version: 1, name: "baseline_v1" }] as const;

export function planMigration(currentVersion: number, targetVersion: number, dryRun = true): MigrationPlan {
  if (targetVersion < currentVersion) {
    throw new Error("Target migration version cannot be older than the current version.");
  }
  return {
    currentVersion,
    targetVersion,
    dryRun,
    steps: orderedSteps
      .filter((step) => step.version > currentVersion && step.version <= targetVersion)
      .map((step) => step.name),
  };
}

async function copyDirectory(sourceDir: string, targetDir: string, skipDirs = new Set<string>()): Promise<void> {
  await mkdir(targetDir, { recursive: true });
  for (const entry of await readdir(sourceDir, { withFileTypes: true })) {
    const source = path.join(sourceDir, entry.name);
    const target = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      if (skipDirs.has(path.resolve(source))) {
        continue;
      }
      await copyDirectory(source, target, skipDirs);
    } else if (entry.isFile()) {
      await copyFile(source, target);
    }
  }
}

export async function applyMigrationPlan(input: {
  dataDir: string;
  currentVersion: number;
  targetVersion: number;
  dryRun?: boolean;
  createBackup?: boolean;
}): Promise<AppliedMigrationResult> {
  const plan = planMigration(input.currentVersion, input.targetVersion, input.dryRun ?? true);
  const metadataFile = path.join(input.dataDir, "schema-version.json");
  const backupDirectory =
    input.createBackup === false || plan.dryRun
      ? null
      : path.join(input.dataDir, ".migration-backups", `${Date.now()}-v${input.currentVersion}-to-v${input.targetVersion}`);
  if (backupDirectory) {
    try {
      await stat(input.dataDir);
      await copyDirectory(input.dataDir, backupDirectory, new Set([path.resolve(backupDirectory)]));
    } catch {
      await mkdir(backupDirectory, { recursive: true });
    }
  }
  if (!plan.dryRun) {
    await mkdir(input.dataDir, { recursive: true });
    const temp = `${metadataFile}.tmp`;
    await writeFile(temp, JSON.stringify({ schemaVersion: input.targetVersion }, null, 2), "utf8");
    await rename(temp, metadataFile);
  }
  return {
    currentVersion: input.currentVersion,
    targetVersion: input.targetVersion,
    appliedSteps: plan.steps,
    backupDirectory,
    dryRun: plan.dryRun,
  };
}

export async function readSchemaVersion(dataDir: string, fallbackVersion = 1): Promise<number> {
  try {
    const parsed = JSON.parse(await readFile(path.join(dataDir, "schema-version.json"), "utf8")) as { schemaVersion?: unknown };
    if (typeof parsed.schemaVersion === "number" && Number.isInteger(parsed.schemaVersion) && parsed.schemaVersion > 0) {
      return parsed.schemaVersion;
    }
  } catch {
    // ignore and use fallback
  }
  return fallbackVersion;
}
