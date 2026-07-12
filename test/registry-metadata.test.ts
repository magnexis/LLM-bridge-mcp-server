import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

describe("registry metadata", () => {
  it("keeps package.json and server.json MCP names in sync", async () => {
    const packageJson = JSON.parse(await readFile("package.json", "utf8")) as { name: string; version: string; mcpName: string };
    const serverJson = JSON.parse(await readFile("server.json", "utf8")) as {
      name: string;
      version: string;
      packages: Array<{ registryType: string; identifier: string; version: string; transport: { type: string } }>;
    };

    expect(serverJson.name).toBe(packageJson.mcpName);
    expect(serverJson.version).toBe(packageJson.version);
    expect(serverJson.packages).toEqual([
      expect.objectContaining({
        registryType: "npm",
        identifier: packageJson.name,
        version: packageJson.version,
        transport: { type: "stdio" },
      }),
    ]);
  });
});
