import { readFile } from "node:fs/promises";
import path from "node:path";
import type { CommandDefinition } from "./registry.js";

async function hasPackageJson(directory: string): Promise<boolean> {
  try {
    JSON.parse(await readFile(path.join(directory, "package.json"), "utf8"));
    return true;
  } catch {
    return false;
  }
}

export async function resolveCommandWorkingDirectory(
  workspaceRoot: string,
  requestedDirectory: string,
  definition: CommandDefinition,
): Promise<string> {
  const workspace = path.resolve(workspaceRoot);
  if (definition.scope === "workspace_root") {
    return workspace;
  }
  let current = path.resolve(requestedDirectory);
  while (true) {
    const relative = path.relative(workspace, current);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      break;
    }
    if (await hasPackageJson(current)) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  if (await hasPackageJson(workspace)) {
    return workspace;
  }
  throw new Error("No package.json was found in the requested working directory scope.");
}
