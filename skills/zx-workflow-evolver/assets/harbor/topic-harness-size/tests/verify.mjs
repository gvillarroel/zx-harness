#!/usr/bin/env node

import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const [generatedInput = "/app/generated", logsInput = "/logs/verifier"] = process.argv.slice(2);
const generated = resolve(generatedInput);
const logs = resolve(logsInput);
const topic = process.env.TOPIC ?? "bounded topic";
const MAX_SCRIPT_BYTES = Number(process.env.MAX_SCRIPT_BYTES ?? "7000");
const evaluationProfile = process.env.EVALUATION_PROFILE ?? "standard";
const zxCommand = process.env.ZX_COMMAND ?? "zx";
const zxCommandArgs = JSON.parse(process.env.ZX_COMMAND_ARGS ?? "[]");
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

// Verify every entrypoint preserves one exact topic and emits the same plan on a repeated dry-run.
let functional = 1;
let deterministic = 1;
const plans = [];
for (const harness of harnesses) {
  const script = join(generated, `${harness}.mjs`);
  const runs = [0, 1].map(() =>
    spawnSync(zxCommand, [...zxCommandArgs, script, topic, "--dry-run"], {
      cwd: generated,
      encoding: "utf8",
      env: { ...process.env, TOPIC_DRY_RUN: "1" },
    }),
  );
  try {
    const plan = JSON.parse(runs[0].stdout.trim());
    const repeatedPlan = JSON.parse(runs[1].stdout.trim());
    plans.push(plan);
    if (runs.some((run) => run.status !== 0) || plan.topic !== topic || plan.harness !== harness) {
      throw new Error("dry-run plan mismatch");
    }
    if (JSON.stringify(plan) !== JSON.stringify(repeatedPlan)) {
      deterministic = 0;
      throw new Error("repeated dry-run changed the plan");
    }
  } catch (error) {
    functional = 0;
    diagnostics.push(
      `${harness}: ${error.message}; stderr=${String(
        runs[0].stderr ?? runs[0].error?.message ?? "",
      ).trim()}`,
    );
  }
}

// Make each cohort exercise a distinct input risk while keeping the exact cases verifier-owned.
const profileMatched = {
  standard: /[a-z0-9]/iu.test(topic),
  unicode: /[^\u0000-\u007f]/u.test(topic),
  punctuation: topic.includes("++") && topic.includes("-"),
  "shell-metacharacters": topic.includes("$(") && topic.includes(";"),
  "option-like": topic.startsWith("--"),
  "path-like": topic.includes("../"),
}[evaluationProfile] === true;
if (!profileMatched) {
  functional = 0;
  diagnostics.push(`topic does not match evaluation profile: ${evaluationProfile}`);
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
const dry_run_purity = (await stat(join(generated, "topics")).catch(() => null)) ? 0 : 1;

// Keep correctness gates non-compensating while exposing the exact negative byte objective.
const rewards = {
  reward: functional && size_gate && terminal_tools && incremental && okf && sources
    && prompt_diversity && safe_arguments && deterministic && dry_run_purity ? 1 : 0,
  script_size_bytes,
  script_size_negative,
  script_total_bytes,
  functional,
  deterministic,
  dry_run_purity,
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
  `${JSON.stringify({ MAX_SCRIPT_BYTES, evaluationProfile, sizes, diagnostics, plans }, null, 2)}\n`,
);
