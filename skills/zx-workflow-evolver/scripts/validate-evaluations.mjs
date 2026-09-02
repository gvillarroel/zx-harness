#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const skillDir = fileURLToPath(new URL("..", import.meta.url));
const authorSkill = resolve(skillDir, "..", "zx-workflow-author");
const prepareScript = resolve(skillDir, "scripts", "prepare-topic-harness-trace.mjs");
const scaffoldScript = resolve(authorSkill, "scripts", "scaffold-topic-knowledge.mjs");
const verifier = resolve(skillDir, "assets", "harbor", "topic-harness-size", "tests", "verify.mjs");
const temporaryRoot = await mkdtemp(resolve(tmpdir(), "zx-evaluations-"));
const releaseHoldout = process.argv.includes("--release-holdout");

try {
  // Generate the complete study in isolation so validation cannot reuse prior tasks or evidence.
  const study = resolve(temporaryRoot, "study");
  await run(process.execPath, [prepareScript, study, authorSkill], skillDir);
  const plan = JSON.parse(await readFile(resolve(study, "evaluation-plan.json"), "utf8"));
  const expectedSplits = ["discovery", "development", "validation", "holdout"];
  if (
    plan.comparisonProfile !== "topic-harness-size-v1" ||
    plan.datasets.map(({ split }) => split).join(",") !== expectedSplits.join(",") ||
    plan.datasets.some(({ taskCount }) => taskCount !== 2)
  ) {
    throw new Error("Evaluation plan must define four ordered two-task cohorts");
  }
  const holdoutStage = plan.stages.find(({ id }) => id === "holdout-gate");
  if (
    holdoutStage?.ownerSkill !== "harbor-run-results" ||
    holdoutStage.datasets.join(",") !== "holdout-v1" ||
    holdoutStage.dependsOn.join(",") !== "candidate-selection"
  ) {
    throw new Error("Holdout must depend on the dataset-free candidate selection stage");
  }

  // Lock every task tree by canonical relative names and bytes, then reject cross-split duplicates.
  const taskDigests = new Set();
  const executableSplits = releaseHoldout ? expectedSplits : expectedSplits.filter((split) => split !== "holdout");
  for (const split of executableSplits) {
    const splitRoot = resolve(study, "tasks", split);
    const taskNames = (await readdir(splitRoot, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    if (taskNames.length !== 2) {
      throw new Error(`${split} must contain exactly two task roots`);
    }
    for (const taskName of taskNames) {
      const taskRoot = resolve(splitRoot, taskName);
      const pending = [taskRoot];
      const files = [];
      while (pending.length > 0) {
        const current = pending.pop();
        for (const entry of await readdir(current, { withFileTypes: true })) {
          const path = resolve(current, entry.name);
          if (entry.isDirectory()) pending.push(path);
          else if (entry.isFile()) files.push(path);
          else throw new Error(`Unsupported task entry: ${path}`);
        }
      }
      const digest = createHash("sha256");
      for (const path of files.sort()) {
        const bytes = await readFile(path);
        digest.update(relative(taskRoot, path).replaceAll("\\", "/"));
        digest.update("\0");
        digest.update(String(bytes.length));
        digest.update("\0");
        digest.update(bytes);
      }
      const value = digest.digest("hex");
      if (taskDigests.has(value)) {
        throw new Error(`Duplicate task content crosses evaluation cohorts: ${taskName}`);
      }
      taskDigests.add(value);
    }
  }

  // Check each replay job stays inside one cohort and baseline/candidate coverage is symmetric.
  const expectedJobs = new Map([
    ["discovery-baseline.yaml", "discovery"],
    ["development-baseline.yaml", "development"],
    ["development-candidate.yaml", "development"],
    ["validation-baseline.yaml", "validation"],
    ["validation-candidate.yaml", "validation"],
    ["holdout-baseline.yaml", "holdout"],
    ["holdout-candidate.yaml", "holdout"],
  ]);
  const jobNames = (await readdir(resolve(study, "jobs"))).sort();
  if (jobNames.join(",") !== [...expectedJobs.keys()].sort().join(",")) {
    throw new Error("Generated Harbor replay jobs drifted from the declared comparison matrix");
  }
  for (const [name, split] of expectedJobs) {
    const yaml = await readFile(resolve(study, "jobs", name), "utf8");
    const taskReferences = [...yaml.matchAll(/tasks\/([^/]+)\//gu)].map((match) => match[1]);
    if (taskReferences.length !== 2 || taskReferences.some((value) => value !== split)) {
      throw new Error(`${name} mixes evaluation cohorts`);
    }
  }

  // Scaffold one baseline and execute every risk profile with the exact pinned zx runtime.
  const generated = resolve(temporaryRoot, "generated");
  await run(process.execPath, [scaffoldScript, generated], skillDir);
  const bundledNpx = resolve(process.execPath, "..", "node_modules", "npm", "bin", "npx-cli.js");
  const zxCommand = (await stat(bundledNpx).catch(() => null)) ? process.execPath : "npx";
  const zxCommandArgs = (await stat(bundledNpx).catch(() => null))
    ? [bundledNpx, "--yes", "zx@8.8.5"]
    : ["--yes", "zx@8.8.5"];
  for (const split of executableSplits) {
    const splitRoot = resolve(study, "tasks", split);
    for (const taskName of (await readdir(splitRoot)).sort()) {
      const taskToml = await readFile(resolve(splitRoot, taskName, "task.toml"), "utf8");
      const topic = taskToml.match(/^TOPIC = "(.*)"$/mu)?.[1];
      const profile = taskToml.match(/^EVALUATION_PROFILE = "(.*)"$/mu)?.[1];
      if (!topic || !profile) {
        throw new Error(`Task environment is incomplete: ${taskName}`);
      }
      const logs = resolve(temporaryRoot, "logs", taskName);
      await mkdir(logs, { recursive: true });
      await run(process.execPath, [verifier, generated, logs], skillDir, {
        TOPIC: topic,
        MAX_SCRIPT_BYTES: "7000",
        EVALUATION_PROFILE: profile,
        ZX_COMMAND: zxCommand,
        ZX_COMMAND_ARGS: JSON.stringify(zxCommandArgs),
      });
      const reward = JSON.parse(await readFile(resolve(logs, "reward.json"), "utf8"));
      for (const metric of [
        "reward",
        "functional",
        "deterministic",
        "dry_run_purity",
        "size_gate",
        "terminal_tools",
        "incremental",
        "okf",
        "sources",
        "prompt_diversity",
        "safe_arguments",
      ]) {
        if (reward[metric] !== 1) {
          throw new Error(`${taskName} failed ${metric}: ${JSON.stringify(reward)}`);
        }
      }
    }
  }
  console.log(
    releaseHoldout
      ? "zx-workflow-evolver evaluations and released holdout passed."
      : "zx-workflow-evolver visible evaluations passed; holdout remains sealed.",
  );
} finally {
  // Remove generated tasks and logs because durable evidence belongs in unique Harbor job directories.
  await rm(temporaryRoot, { recursive: true, force: true });
}

async function run(command, args, cwd, env = {}) {
  // Preserve argv boundaries so adversarial topics are data throughout the validation path.
  return await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
      shell: false,
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", rejectPromise);
    child.on("close", (code) => {
      if (code === 0) resolvePromise({ stdout, stderr });
      else rejectPromise(new Error(`${command} exited ${code}\n${stdout}\n${stderr}`));
    });
  });
}
