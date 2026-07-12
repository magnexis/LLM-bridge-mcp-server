import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { applyMigrationPlan, planMigration, readSchemaVersion } from "../src/persistence/migrations.js";

let root = "";

afterEach(async () => {
  if (root) {
    await rm(root, { recursive: true, force: true });
    root = "";
  }
});

describe("migrations", () => {
  it("plans ordered migrations", () => {
    const plan = planMigration(0, 1, true);
    expect(plan.steps).toEqual(["baseline_v1"]);
  });

  it("applies schema version metadata and backup directory", async () => {
    root = await mkdtemp(path.join(tmpdir(), "glm-migrations-"));
    await writeFile(path.join(root, "example.json"), JSON.stringify({ ok: true }), "utf8");
    const result = await applyMigrationPlan({ dataDir: root, currentVersion: 0, targetVersion: 1, dryRun: false });
    expect(result.appliedSteps).toEqual(["baseline_v1"]);
    expect(result.backupDirectory).toContain(".migration-backups");
    const metadata = JSON.parse(await readFile(path.join(root, "schema-version.json"), "utf8")) as { schemaVersion: number };
    expect(metadata.schemaVersion).toBe(1);
  });

  it("reads fallback schema version when metadata is absent", async () => {
    root = await mkdtemp(path.join(tmpdir(), "glm-migrations-schema-"));
    await expect(readSchemaVersion(root, 3)).resolves.toBe(3);
  });
});
