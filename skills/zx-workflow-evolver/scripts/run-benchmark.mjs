#!/usr/bin/env node

import { spawn } from "node:child_process";
import { readFile, readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const skillDir = fileURLToPath(new URL("..", import.meta.url));
const harborDir = resolve(skillDir, "assets", "harbor");
const configPath = resolve(harborDir, "oracle-job.yaml");
const jobsRoot = resolve(harborDir, "..", "..", "..", "..", ".tmp", "harbor", "jobs");
const validateOnly = process.argv.includes("--validate-only");
const jobFlag = process.argv.indexOf("--job-name");
const requestedName = jobFlag >= 0 ? process.argv[jobFlag + 1] : null;
const generatedName =
  `zx-workflow-resilience-${new Date().toISOString().replace(/\D/g, "").slice(0, 17)}-${process.pid}`;
const jobName = requestedName ?? generatedName;

// Keep job identities portable and refuse accidental overwrite before Harbor starts.
if (!/^[a-z0-9][a-z0-9-]{1,80}$/.test(jobName)) {
  throw new Error("Job name must be a 2-81 character lowercase slug");
}
const jobDir = resolve(jobsRoot, jobName);
if (!validateOnly && (await stat(jobDir).catch(() => null))) {
  throw new Error(`Harbor evidence directory already exists: ${jobDir}`);
}

// Resolve one pinned Harbor invocation; Windows delegates to the existing WSL Docker runtime.
let command = "uvx";
let prefix = ["--from", "harbor==0.18.0", "harbor"];
let uvCommand = "uv";
let uvPrefix = [];
let cwd = harborDir;
if (process.platform === "win32") {
  const linuxCwd = (
    await run("wsl.exe", ["--exec", "wslpath", "-a", "-u", harborDir], process.cwd())
  ).stdout.trim();
  const linuxUvx = (await run("wsl.exe", ["sh", "-lc", "command -v uvx"], process.cwd())).stdout.trim();
  const linuxUv = (await run("wsl.exe", ["sh", "-lc", "command -v uv"], process.cwd())).stdout.trim();
  if (!linuxCwd || !linuxUvx || !linuxUv) {
    throw new Error("WSL must expose uv, uvx, and the repository path");
  }
  command = "wsl.exe";
  prefix = ["--cd", linuxCwd, linuxUvx, "--from", "harbor==0.18.0", "harbor"];
  uvCommand = "wsl.exe";
  uvPrefix = ["--cd", linuxCwd, linuxUv];
  cwd = process.cwd();
}

// Pin-check first, then ask Harbor to resolve the complete native JobConfig without execution.
const version = await run(command, [...prefix, "--version"], cwd);
if (!version.stdout.trim().endsWith("0.18.0")) {
  throw new Error(`Expected Harbor 0.18.0, received: ${version.stdout.trim()}`);
}
const resolved = await run(
  command,
  [...prefix, "run", "--config", "oracle-job.yaml", "--print-config"],
  cwd,
);
const resolvedConfig = JSON.parse(resolved.stdout);
if (
  resolvedConfig.tasks?.[0]?.path !== "workflow-resilience" ||
  resolvedConfig.n_concurrent_trials !== 1
) {
  throw new Error("Resolved Harbor config drifted from the bundled task");
}
const taskValidation = await run(
  uvCommand,
  [
    ...uvPrefix,
    "run",
    "--with",
    "harbor==0.18.0",
    "python",
    "-c",
    "from pathlib import Path; from harbor.models.task.task import Task; print(Task(Path('workflow-resilience')).name)",
  ],
  cwd,
);
if (taskValidation.stdout.trim() !== "zx-harness/workflow-resilience") {
  throw new Error(`Harbor task model resolved an unexpected identity: ${taskValidation.stdout.trim()}`);
}
if (validateOnly) {
  console.log("Harbor 0.18.0 benchmark configuration is valid.");
  process.exit(0);
}

// Execute the oracle in a fresh job so the reference solution passes through normal Harbor isolation.
await run(
  command,
  [...prefix, "run", "--config", "oracle-job.yaml", "--job-name", jobName, "--yes"],
  cwd,
  true,
);
if (!(await stat(jobDir).catch(() => null))) {
  throw new Error(`Harbor did not create the expected job: ${jobDir}`);
}

// Read verifier-owned reward files only after Harbor finishes and fail closed on missing dimensions.
const rewardFiles = await findFiles(jobDir, "reward.json");
if (rewardFiles.length !== 1) {
  throw new Error(`Expected one verifier reward.json, found ${rewardFiles.length}`);
}
const reward = JSON.parse(await readFile(rewardFiles[0], "utf8"));
for (const key of ["reward", "functional", "resilience", "efficiency", "security", "determinism"]) {
  if (reward[key] !== 1) {
    throw new Error(`Reference benchmark failed metric ${key}: ${JSON.stringify(reward)}`);
  }
}
console.log(
  JSON.stringify(
    {
      harborVersion: "0.18.0",
      jobName,
      jobDir,
      reward,
    },
    null,
    2,
  ),
);

async function findFiles(root, name) {
  const matches = [];
  const pending = [root];
  while (pending.length > 0) {
    const current = pending.pop();
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = resolve(current, entry.name);
      if (entry.isDirectory()) {
        pending.push(path);
      } else if (entry.isFile() && entry.name === name) {
        matches.push(path);
      }
    }
  }
  return matches.sort();
}

async function run(executable, args, directory, stream = false) {
  // Pass every dynamic value as an argument; never expose paths or job names to shell parsing.
  return await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(executable, args, {
      cwd: directory,
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
      if (stream) process.stdout.write(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
      if (stream) process.stderr.write(chunk);
    });
    child.on("error", rejectPromise);
    child.on("close", (code) => {
      if (code === 0) {
        resolvePromise({ code, stdout, stderr });
      } else {
        rejectPromise(new Error(`${executable} exited ${code}\n${stdout}\n${stderr}`));
      }
    });
  });
}
