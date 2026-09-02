#!/usr/bin/env node

import { appendFile, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

// Capture the exact native pi-facing contract so the validator can inspect routing and isolation.
const args = process.argv.slice(2);
const valueAfter = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : "";
};
const skills = [];
for (let index = 0; index < args.length; index += 1) {
  if (args[index] === "--skill") skills.push(args[index + 1]);
}
const contextArgument = args.find((value) => value.startsWith("@"));
const context = contextArgument ? await readFile(contextArgument.slice(1), "utf8") : "";
const attempt = Number(process.env.ZX_ISSUE_ATTEMPT ?? "0");
const mode = process.env.ZX_FIXTURE_MODE ?? "maintenance";
const call = {
  attempt,
  model: valueAfter("--model"),
  thinking: valueAfter("--thinking"),
  skills,
  noSkills: args.includes("--no-skills"),
  noExtensions: args.includes("--no-extensions"),
  tools: valueAfter("--tools"),
  feedback: process.env.ZX_ISSUE_GATE_FEEDBACK ?? "",
  contextHasIssue: /include the end|queue race/i.test(context),
  contextHasRange: context.includes("src/range.mjs"),
  secretPresent: Boolean(process.env.FIXTURE_API_KEY),
};
await appendFile(resolve(process.env.ZX_ISSUE_RUN_DIR, "fake-pi-calls.jsonl"), `${JSON.stringify(call)}\n`);

// Mutate only at runtime. The generated workflow has no fixture answer or answer-bearing helper.
if (mode === "maintenance") {
  const source = attempt === 1
    ? "export const integerRange = (start, end) => [start, end];\n"
    : "export const integerRange = (start, end) => Array.from({ length: end - start + 1 }, (_, index) => start + index);\n";
  if (attempt > 1 && !/tests:|AssertionError|expected/i.test(process.env.ZX_ISSUE_GATE_FEEDBACK ?? "")) {
    throw new Error("Retry did not receive concrete gate diagnostics.");
  }
  await writeFile(resolve("src", "range.mjs"), source);
} else if (mode === "concurrency") {
  await writeFile(
    resolve("src", "queue.mjs"),
    "export const queuePolicy = 'serialized';\nexport const enqueue = async (value) => value;\n",
  );
} else if (mode === "protected") {
  await writeFile("protected.txt", "changed by fixture agent\n");
} else {
  await writeFile(resolve("src", "range.mjs"), "export const integerRange = () => [];\n");
}

// Emit a redaction probe; the runtime must not preserve this literal in private logs.
console.log("api_key=runtime-secret");
