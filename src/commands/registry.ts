export type CommandCategory = "inspect" | "typecheck" | "test" | "build" | "lint" | "git_read" | "install";
export type CommandRisk = "low" | "medium" | "high";
export type CommandScope = "workspace_root" | "package_root";

export interface CommandDefinition {
  id: "npm_typecheck" | "npm_test" | "npm_build" | "npm_lint";
  label: string;
  executable: string;
  args: string[];
  commandText: "npm run typecheck" | "npm run test:run" | "npm run build" | "npm run lint";
  category: CommandCategory;
  risk: CommandRisk;
  scope: CommandScope;
  timeoutMs: number;
  requiresApproval: boolean;
  networkBehavior: "none" | "package_manager";
}

const definitions: CommandDefinition[] = [
  {
    id: "npm_typecheck",
    label: "Typecheck",
    executable: "npm",
    args: ["run", "typecheck"],
    commandText: "npm run typecheck",
    category: "typecheck",
    risk: "low",
    scope: "package_root",
    timeoutMs: 120_000,
    requiresApproval: true,
    networkBehavior: "none",
  },
  {
    id: "npm_test",
    label: "Tests",
    executable: "npm",
    args: ["run", "test:run"],
    commandText: "npm run test:run",
    category: "test",
    risk: "medium",
    scope: "package_root",
    timeoutMs: 180_000,
    requiresApproval: true,
    networkBehavior: "none",
  },
  {
    id: "npm_build",
    label: "Build",
    executable: "npm",
    args: ["run", "build"],
    commandText: "npm run build",
    category: "build",
    risk: "medium",
    scope: "package_root",
    timeoutMs: 180_000,
    requiresApproval: true,
    networkBehavior: "none",
  },
  {
    id: "npm_lint",
    label: "Lint",
    executable: "npm",
    args: ["run", "lint"],
    commandText: "npm run lint",
    category: "lint",
    risk: "medium",
    scope: "package_root",
    timeoutMs: 120_000,
    requiresApproval: true,
    networkBehavior: "none",
  },
];

const byText = new Map(definitions.map((definition) => [definition.commandText, definition]));
const byId = new Map(definitions.map((definition) => [definition.id, definition]));

export function listCommandDefinitions(): CommandDefinition[] {
  return [...definitions];
}

export function getCommandDefinitionByText(commandText: CommandDefinition["commandText"]): CommandDefinition {
  const definition = byText.get(commandText);
  if (!definition) {
    throw new Error(`Unknown command text: ${commandText}`);
  }
  return definition;
}

export function getCommandDefinitionById(id: CommandDefinition["id"]): CommandDefinition {
  const definition = byId.get(id);
  if (!definition) {
    throw new Error(`Unknown command id: ${id}`);
  }
  return definition;
}
