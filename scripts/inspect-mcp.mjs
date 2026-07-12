import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/server.ts", import.meta.url), "utf8");

const collect = (kind) => {
  const pattern = new RegExp(`register${kind}\\("([^"]+)"`, "g");
  return [...source.matchAll(pattern)].map((match) => match[1]).sort();
};

const report = {
  tools: collect("Tool"),
  resources: collect("Resource"),
  prompts: collect("Prompt"),
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
