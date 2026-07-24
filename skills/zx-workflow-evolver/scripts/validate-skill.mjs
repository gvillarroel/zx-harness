#!/usr/bin/env node

import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const skillDir = fileURLToPath(new URL("..", import.meta.url));
const taskDir = resolve(skillDir, "assets", "harbor", "workflow-resilience");
const temporaryRoot = await mkdtemp(resolve(tmpdir(), "zx-workflow-evolver-"));

try {
  // Validate discovery metadata before spending time on the bundled executable benchmark.
  const skillText = await readFile(resolve(skillDir, "SKILL.md"), "utf8");
  const frontmatter = skillText.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!frontmatter) {
    throw new Error("SKILL.md frontmatter is missing");
  }
  const keys = frontmatter[1]
    .split(/\r?\n/)
    .filter((line) => /^[a-z][a-z0-9_-]*:/.test(line))
    .map((line) => line.split(":", 1)[0]);
  if (keys.join(",") !== "name,description" || !frontmatter[1].includes("name: zx-workflow-evolver")) {
    throw new Error("SKILL.md frontmatter must contain only the canonical name and description");
  }
  const openaiYaml = await readFile(resolve(skillDir, "agents", "openai.yaml"), "utf8");
  for (const required of ["display_name:", "short_description:", "default_prompt:", "$zx-workflow-evolver"]) {
    if (!openaiYaml.includes(required)) {
      throw new Error(`agents/openai.yaml is missing ${required}`);
    }
  }

  // Check the task boundary because instructions must not leak hidden verifier cases or answers.
  for (const path of [
    "task.toml",
    "instruction.md",
    "environment/Dockerfile",
    "solution/solve.sh",
    "solution/workflow.mjs",
    "tests/test.sh",
    "tests/verify.mjs",
  ]) {
    if (!(await stat(resolve(taskDir, path)).catch(() => null))) {
      throw new Error(`Harbor task is missing ${path}`);
    }
  }
  const instruction = await readFile(resolve(taskDir, "instruction.md"), "utf8");
  if (instruction.includes("fixture-secret") || instruction.includes("00-retry-gates.md")) {
    throw new Error("Agent-visible instruction leaks hidden verifier evidence");
  }
  const taskToml = await readFile(resolve(taskDir, "task.toml"), "utf8");
  for (const required of [
    'schema_version = "1.3"',
    'name = "zx-harness/workflow-resilience"',
    'network_mode = "public"',
  ]) {
    if (!taskToml.includes(required)) {
      throw new Error(`task.toml is missing ${required}`);
    }
  }

  // Execute hidden cases locally first for fast, dependency-free feedback on the reference script.
  const verifier = resolve(taskDir, "tests", "verify.mjs");
  const reference = resolve(taskDir, "solution", "workflow.mjs");
  const localLogs = resolve(temporaryRoot, "verifier");
  await run(process.execPath, [verifier, "--candidate", reference, "--logs", localLogs], skillDir);
  const reward = JSON.parse(await readFile(resolve(localLogs, "reward.json"), "utf8"));
  if (Object.values(reward).some((value) => value !== 1)) {
    throw new Error(`Reference workflow failed local metrics: ${JSON.stringify(reward)}`);
  }

  // Finish with Harbor's own JobConfig resolver so schema or task-path drift fails validation.
  await run(process.execPath, [resolve(skillDir, "scripts", "run-benchmark.mjs"), "--validate-only"], skillDir);
  console.log("zx-workflow-evolver validation passed.");
} finally {
  // Remove local evidence because durable Harbor jobs use unique, repository-ignored directories.
  await rm(temporaryRoot, { recursive: true, force: true });
}

async function run(command, args, cwd) {
  // Keep validation cross-platform and shell-independent.
  return await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, { cwd, shell: false, windowsHide: true });
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
      if (code === 0) {
        resolvePromise({ code, stdout, stderr });
      } else {
        rejectPromise(new Error(`${command} exited ${code}\n${stdout}\n${stderr}`));
      }
    });
  });
}
