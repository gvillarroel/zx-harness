#!/usr/bin/env node

import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const skillRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const profiler = resolve(skillRoot, "scripts", "profile-deep-swe-repository.mjs");
const scaffolder = resolve(skillRoot, "scripts", "scaffold-repository-issue-workflow.mjs");
const temporaryBase = resolve(skillRoot, "..", "..", ".tmp");
await mkdir(temporaryBase, { recursive: true });
const temporaryRoot = await mkdtemp(resolve(temporaryBase, "deep-swe-profiler-"));

try {
  // Build a clean repository whose file contents include data that profiling must never copy.
  const repository = resolve(temporaryRoot, "repository");
  await mkdir(resolve(repository, "src"), { recursive: true });
  await mkdir(resolve(repository, "test"), { recursive: true });
  await writeFile(resolve(repository, "AGENTS.md"), "PRIVATE_INSTRUCTION_SENTINEL\n");
  await writeFile(resolve(repository, "package.json"), '{"name":"fixture","scripts":{"test":"node test/check.mjs"}}\n');
  await writeFile(resolve(repository, "src", "index.js"), "export const PRIVATE_ISSUE_SENTINEL = true;\n");
  await writeFile(resolve(repository, "test", "check.mjs"), "console.log('ok');\n");
  await initialize(repository);
  const baseCommit = (await run("git", ["rev-parse", "HEAD"], repository)).stdout.trim();
  const output = resolve(temporaryRoot, "repository-profile.json");
  const argumentsList = ["--root", repository, "--base-commit", baseCommit, "--output", output, "--dry-run"];

  // Two path-only passes must be byte-identical and must not create the declared output.
  const first = await run(process.execPath, [profiler, ...argumentsList], temporaryRoot);
  const second = await run(process.execPath, [profiler, ...argumentsList], temporaryRoot);
  if (first.stdout !== second.stdout) throw new Error("Profiler output is not deterministic.");
  if (await stat(output).catch(() => null)) throw new Error("Profiler dry-run created its output file.");
  if (/PRIVATE_(?:INSTRUCTION|ISSUE)_SENTINEL/u.test(first.stdout)) {
    throw new Error("Profiler copied tracked file content into the profile.");
  }
  const profile = JSON.parse(first.stdout);
  if (
    profile.repository.roots.join(",") !== "AGENTS.md,package.json,src,test" ||
    !profile.repository.extensions.includes(".js") ||
    !profile.repository.extensions.includes(".mjs") ||
    !profile.repository.alwaysInclude.includes("AGENTS.md") ||
    !profile.gates.some((gate) => gate.id === "node-tests")
  ) {
    throw new Error("Profiler did not derive the expected stable repository facts.");
  }

  // Materialize once and pass the result through the owning closed-schema scaffolder.
  await run(process.execPath, [profiler, ...argumentsList.slice(0, -1)], temporaryRoot);
  const materialized = await readFile(output, "utf8");
  if (materialized !== first.stdout) throw new Error("Dry-run and materialized profile bytes differ.");
  const generated = resolve(temporaryRoot, "generated");
  await run(process.execPath, [scaffolder, output, generated], temporaryRoot);
  if (!(await stat(resolve(generated, "solve-issue.mjs"))).isFile()) throw new Error("Scaffolder rejected the profile.");
  await expectFailure(process.execPath, [profiler, ...argumentsList.slice(0, -1)], temporaryRoot, "new file");

  // Dirty, mismatched, and nested roots fail before any profile can be emitted.
  const dirty = resolve(repository, "untracked.txt");
  await writeFile(dirty, "user change\n");
  await expectFailure(
    process.execPath,
    [profiler, "--root", repository, "--base-commit", baseCommit, "--output", resolve(temporaryRoot, "dirty.json"), "--dry-run"],
    temporaryRoot,
    "clean",
  );
  await rm(dirty);
  await expectFailure(
    process.execPath,
    [profiler, "--root", repository, "--base-commit", "0".repeat(40), "--output", resolve(temporaryRoot, "mismatch.json"), "--dry-run"],
    temporaryRoot,
    "does not match",
  );
  await expectFailure(
    process.execPath,
    [profiler, "--root", resolve(repository, "src"), "--base-commit", baseCommit, "--output", resolve(temporaryRoot, "nested.json"), "--dry-run"],
    temporaryRoot,
    "exact Git worktree root",
  );

  // Commit an index-level symbolic link so the security case works without OS symlink privileges.
  const symlinkRepository = resolve(temporaryRoot, "symlink-repository");
  await mkdir(symlinkRepository);
  await writeFile(resolve(symlinkRepository, "target.txt"), "target\n");
  await initialize(symlinkRepository);
  const blob = (await run("git", ["hash-object", "-w", "--stdin"], symlinkRepository, {}, 0, "target.txt\n")).stdout.trim();
  await run("git", ["update-index", "--add", "--cacheinfo", `120000,${blob},link.txt`], symlinkRepository);
  await run("git", ["commit", "-m", "add indexed symlink"], symlinkRepository);
  await run("git", ["checkout", "--", "link.txt"], symlinkRepository);
  const symlinkCommit = (await run("git", ["rev-parse", "HEAD"], symlinkRepository)).stdout.trim();
  await expectFailure(
    process.execPath,
    [profiler, "--root", symlinkRepository, "--base-commit", symlinkCommit, "--output", resolve(temporaryRoot, "symlink.json"), "--dry-run"],
    temporaryRoot,
    "Unsupported tracked index entry",
  );

  console.log("DeepSWE repository profiler validation passed.");
} finally {
  // Delete only the validator-owned directory; external study evidence is never touched.
  await rm(temporaryRoot, { recursive: true, force: true });
}

async function initialize(repository) {
  await run("git", ["init"], repository);
  await run("git", ["config", "user.email", "fixture@example.invalid"], repository);
  await run("git", ["config", "user.name", "Fixture"], repository);
  await run("git", ["config", "core.autocrlf", "false"], repository);
  await run("git", ["add", "."], repository);
  await run("git", ["commit", "-m", "fixture baseline"], repository);
}

async function expectFailure(command, args, cwd, fragment) {
  const result = await run(command, args, cwd, {}, null);
  if (result.code === 0 || !`${result.stdout}\n${result.stderr}`.includes(fragment)) {
    throw new Error(`Expected failure containing ${JSON.stringify(fragment)}.\n${result.stdout}\n${result.stderr}`);
  }
}

async function run(command, args, cwd, additions = {}, expectedCode = 0, stdin = "") {
  return await new Promise((resolvePromise, rejectPromise) => {
    // Preserve argv and stdin boundaries; no fixture value becomes shell source.
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...additions },
      shell: false,
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("error", rejectPromise);
    child.on("close", (code) => {
      const actual = code ?? 1;
      if (expectedCode !== null && actual !== expectedCode) {
        rejectPromise(new Error(`Unexpected exit ${actual}: ${command} ${args.join(" ")}\n${stdout}\n${stderr}`));
      } else resolvePromise({ code: actual, stdout, stderr });
    });
    child.stdin.end(stdin);
  });
}
