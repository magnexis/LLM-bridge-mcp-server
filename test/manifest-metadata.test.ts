import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

describe("manifest metadata", () => {
  it("keeps manifest.json aligned with package and server metadata", async () => {
    const packageJson = JSON.parse(await readFile("package.json", "utf8")) as {
      name: string;
      version: string;
      description: string;
      license: string;
      repository: { url: string };
      homepage: string;
      mcpName: string;
    };
    const serverJson = JSON.parse(await readFile("server.json", "utf8")) as {
      name: string;
      description: string;
    };
    const manifestJson = JSON.parse(await readFile("manifest.json", "utf8")) as {
      id: string;
      version: string;
      description: string;
      homepage: string;
      license: string;
      repository: { url: string };
      server: { entry: string; transport: string; package: { manager: string; name: string } };
    };

    expect(manifestJson.id).toBe(packageJson.mcpName);
    expect(manifestJson.id).toBe(serverJson.name);
    expect(manifestJson.version).toBe(packageJson.version);
    expect(manifestJson.description).toContain("Approval-gated LLM MCP bridge");
    expect(packageJson.description).toContain("Approval-gated LLM MCP bridge");
    expect(serverJson.description).toContain("Approval-gated LLM MCP bridge");
    expect(manifestJson.homepage).toBe(packageJson.homepage);
    expect(manifestJson.license).toBe(packageJson.license);
    expect(manifestJson.repository.url).toBe(packageJson.repository.url);
    expect(manifestJson.server.entry).toBe("dist/index.js");
    expect(manifestJson.server.transport).toBe("stdio");
    expect(manifestJson.server.package).toEqual({ manager: "npm", name: packageJson.name });
  });
});
