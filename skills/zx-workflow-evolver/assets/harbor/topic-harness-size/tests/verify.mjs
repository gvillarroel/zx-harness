#!/usr/bin/env node

import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const [generatedInput = "/app/generated", logsInput = "/logs/verifier"] = process.argv.slice(2);
const generated = resolve(generatedInput);
const logs = resolve(logsInput);
const topic = process.env.TOPIC ?? "bounded topic";
const MAX_SCRIPT_BYTES = Number(process.env.MAX_SCRIPT_BYTES ?? "7000");
const harnesses = ["codex", "copilot", "pi", "opencode"];
const diagnostics = [];

// Enumerate all executable modules so splitting code cannot hide bytes from the objective.
const modules = (await readdir(generated).catch(() => []))
  .filter((name) => name.endsWith(".mjs"))
  .sort();
const sizes = {};
for (const name of modules) {
  sizes[name] = (await stat(join(generated, name))).size;
}
const script_size_bytes = Math.max(0, ...Object.values(sizes));
const script_size_negative = -script_size_bytes;
const script_total_bytes = Object.values(sizes).reduce((sum, size) => sum + size, 0);

// Verify one topic is sufficient to dry-run every distinct harness entrypoint.
let functional = 1;
const plans = [];
for (const harness of harnesses) {
  const script = join(generated, `${harness}.mjs`);
  const run = spawnSync("zx", [script, topic, "--dry-run"], {
    cwd: generated,
    encoding: "utf8",
    env: { ...process.env, TOPIC_DRY_RUN: "1" },
  });
  try {
    const plan = JSON.parse(run.stdout.trim());
    plans.push(plan);
    if (run.status !== 0 || plan.topic !== topic || plan.harness !== harness) {
      throw new Error("dry-run plan mismatch");
    }
  } catch (error) {
    functional = 0;
    diagnostics.push(
      `${harness}: ${error.message}; stderr=${String(run.stderr ?? run.error?.message ?? "").trim()}`,
    );
  }
}

// Inspect the shared runtime for the deterministic tools and external OKF validation boundary.
const runtime = await readFile(join(generated, "topic.mjs"), "utf8").catch(() => "");
const generatedCode = (
  await Promise.all(modules.map((name) => readFile(join(generated, name), "utf8")))
).join("\n");
const terminal_tools = ["know", "jq", "rg", "fd", "git"].every((tool) => runtime.includes(`"${tool}"`))
  ? 1
  : 0;
const incremental =
  runtime.includes("hash-object") &&
  runtime.includes("fresh") &&
  runtime.includes("state-") &&
  runtime.includes("manifest")
    ? 1
    : 0;
const okf =
  runtime.includes("OPEN_KNOWLEDGE_FORMAT_SKILL") &&
  runtime.includes("validate_okf_bundle.py") &&
  runtime.includes("index.md")
    ? 1
    : 0;

// Require arXiv plus at least two configurable source kinds in the generated source manifest.
const sourceConfig = JSON.parse(
  await readFile(join(generated, "sources.json"), "utf8").catch(() => "[]"),
);
const sources =
  runtime.includes('"search"') &&
  runtime.includes('"arxiv"') &&
  new Set(sourceConfig.map((source) => source.type)).size >= 2
    ? 1
    : 0;

// Distinct plan prompts prove the four entrypoints are different simulations, not aliases.
const prompt_diversity =
  plans.length === harnesses.length &&
  new Set(plans.map((plan) => plan.prompt)).size === harnesses.length
    ? 1
    : 0;

// Require direct argument-array execution and reject any fallback to a command shell.
const safe_arguments =
  generatedCode.includes("execFile(") && !generatedCode.includes("shell: true") ? 1 : 0;
const size_gate = script_size_bytes > 0 && script_size_bytes <= MAX_SCRIPT_BYTES ? 1 : 0;

// Keep correctness gates non-compensating while exposing the exact negative byte objective.
const rewards = {
  reward: functional && size_gate && terminal_tools && incremental && okf && sources
    && prompt_diversity && safe_arguments ? 1 : 0,
  script_size_bytes,
  script_size_negative,
  script_total_bytes,
  functional,
  size_gate,
  terminal_tools,
  incremental,
  okf,
  sources,
  prompt_diversity,
  safe_arguments,
};
await writeFile(join(logs, "reward.json"), `${JSON.stringify(rewards, null, 2)}\n`);
await writeFile(
  join(logs, "diagnostics.json"),
  `${JSON.stringify({ MAX_SCRIPT_BYTES, sizes, diagnostics, plans }, null, 2)}\n`,
);
