import { access, readFile } from "node:fs/promises";
import path from "node:path";

const root = new URL("../", import.meta.url);
const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const serverSource = await readFile(new URL("../src/server.ts", import.meta.url), "utf8");

const collect = (kind) => {
  const pattern = new RegExp(`register${kind}\\("([^"]+)"`, "g");
  return [...serverSource.matchAll(pattern)].map((match) => match[1]).sort();
};

const checks = [];

const compiledEntry = path.resolve(new URL("../dist/index.js", import.meta.url).pathname);
await access(new URL("../dist/index.js", import.meta.url));
checks.push({ name: "compiled-entry", ok: true, detail: packageJson.main });

checks.push({
  name: "start-script",
  ok: packageJson.scripts?.start === "node dist/index.js",
  detail: packageJson.scripts?.start ?? null,
});

checks.push({
  name: "stdout-safety",
  ok: !/\bconsole\.log\b/.test(serverSource),
  detail: "src/server.ts contains no console.log",
});

checks.push({
  name: "tool-registration",
  ok: collect("Tool").length >= 20,
  detail: collect("Tool"),
});

checks.push({
  name: "resource-registration",
  ok: collect("Resource").length >= 8,
  detail: collect("Resource"),
});

checks.push({
  name: "prompt-registration",
  ok: collect("Prompt").length >= 8,
  detail: collect("Prompt"),
});

const failed = checks.filter((check) => !check.ok);
process.stdout.write(`${JSON.stringify({ checks, failedCount: failed.length }, null, 2)}\n`);
if (failed.length > 0) {
  process.exit(1);
}
