#!/usr/bin/env node

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, realpath, stat, writeFile } from "node:fs/promises";
import { dirname, extname, isAbsolute, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";

const runFile = promisify(execFile);
const options = parseOptions(process.argv.slice(2));
const root = await realpath(resolve(options.root));
const output = resolve(options.output);

// Bind profiling to the exact clean checkout before any benchmark instruction is exposed.
if (!/^[0-9a-f]{40}$/.test(options.baseCommit)) {
  throw new Error("--base-commit must be one lowercase 40-character Git commit.");
}
if (!/^openai-codex\/gpt-5\.6-luna$/.test(options.lunaModel)) {
  throw new Error("--luna-model must be the explicit openai-codex GPT-5.6 Luna route.");
}
if (!/^openai-codex\/gpt-5\.6-sol$/.test(options.solModel)) {
  throw new Error("--sol-model must be the explicit openai-codex GPT-5.6 Sol route.");
}
if ((await stat(root)).isDirectory() === false) throw new Error(`Repository root is not a directory: ${root}`);
const worktreeRoot = await realpath((await git(root, ["rev-parse", "--show-toplevel"])).trim());
if (!samePath(root, worktreeRoot)) throw new Error("--root must be the exact Git worktree root.");
if (within(root, output)) throw new Error("--output must stay outside the profiled repository.");
const outputParent = await realpath(dirname(output));
if (!(await stat(outputParent)).isDirectory()) throw new Error("--output parent must already exist.");
if (within(root, outputParent)) throw new Error("--output parent resolves inside the profiled repository.");
if (await lstat(output).catch(() => null)) throw new Error("--output must name a new file.");

const headBefore = (await git(root, ["rev-parse", "HEAD"])).trim();
if (headBefore !== options.baseCommit) throw new Error("Repository HEAD does not match --base-commit.");
if ((await git(root, ["status", "--porcelain=v1", "--untracked-files=all"])).trim()) {
  throw new Error("Repository must be clean before profiling.");
}

// Parse the index rather than repository contents so issue answers and verifier text cannot enter the profile.
const records = (await git(root, ["ls-files", "--stage", "-z"])).split("\0").filter(Boolean);
if (!records.length) throw new Error("Repository has no tracked files.");
const tracked = [];
for (const record of records) {
  const match = /^(\d{6}) ([0-9a-f]{40,64}) ([0-3])\t([\s\S]+)$/u.exec(record);
  if (!match) throw new Error("Git returned an invalid index record.");
  const [, mode, , stage, relativePath] = match;
  if (stage !== "0" || !["100644", "100755"].includes(mode)) {
    throw new Error(`Unsupported tracked index entry: ${relativePath}`);
  }
  if (!safeRelative(relativePath)) throw new Error(`Unsafe tracked path: ${relativePath}`);
  const absolutePath = resolve(root, relativePath);
  const metadata = await lstat(absolutePath);
  if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error(`Tracked path is not a regular file: ${relativePath}`);
  const resolvedPath = await realpath(absolutePath);
  if (!within(root, resolvedPath)) throw new Error(`Tracked path escapes the repository: ${relativePath}`);
  tracked.push(relativePath.replaceAll("\\", "/"));
}
tracked.sort((left, right) => left.localeCompare(right, "en"));

// Derive only stable path-level facts; file bytes, task prompts, tests, and solutions remain unread.
const roots = [...new Set(tracked.map((path) => path.split("/")[0]))].sort().slice(0, 64);
const extensionCounts = new Map();
for (const path of tracked) {
  const extension = extname(path).toLowerCase();
  if (extension) extensionCounts.set(extension, (extensionCounts.get(extension) ?? 0) + 1);
}
const extensions = [...extensionCounts]
  .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "en"))
  .slice(0, 64)
  .map(([extension]) => extension);
if (!extensions.length) extensions.push(".txt");

const stableFiles = tracked.filter((path) => stableRepositoryFile(path)).slice(0, 32);
const languageNames = inferLanguages(extensionCounts).slice(0, 8);
const architecture = roots.slice(0, 32).map((entry) => `${entry} is a tracked top-level repository root.`);
const conventions = [
  stableFiles.length
    ? `Follow the tracked repository guidance and manifests: ${stableFiles.join(", ")}.`.slice(0, 1024)
    : "Follow repository-local conventions visible in the tracked source tree.",
  "Keep changes scoped, preserve public behavior, and update existing tests when behavior changes.",
  "Do not change generated workflow files, credentials, Git internals, or evaluator-owned paths.",
];
const sectorRoots = roots.slice(0, 32);
const gates = [
  { id: "diff-check", command: "git", args: ["diff", "--check", "HEAD"], timeoutMs: 60000 },
  ...inferredGates(tracked),
];
const repositoryName = root.split(/[\\/]/u).filter(Boolean).at(-1) ?? "repository";
const slug = `deep-swe-${repositoryName.toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "") || "repo"}`
  .slice(0, 48)
  .replace(/-$/u, "");
const profile = {
  schemaVersion: 1,
  name: slug.length >= 2 ? slug : "deep-swe-repo",
  description: `Solve repository issues in ${repositoryName} with a frozen, gated zx workflow.`,
  repository: {
    summary: `${tracked.length} tracked files${languageNames.length ? `; primary languages: ${languageNames.join(", ")}` : ""}.`,
    architecture,
    conventions,
    roots,
    extensions,
    alwaysInclude: stableFiles,
    ignore: [".git", ".env", "node_modules", "dist", "build", "coverage", "target", ".venv", "__pycache__"],
    protectedPaths: [],
    maxScanFiles: Math.min(5000, Math.max(800, tracked.length)),
    contextFiles: 16,
    maxFileBytes: 24000,
    maxContextBytes: 160000,
  },
  models: {
    luna: options.lunaModel,
    sol: options.solModel,
    lunaThinking: "medium",
    solThinking: "max",
  },
  attempts: 2,
  defaultSector: "maintenance",
  defaultSkills: [],
  sectors: [
    {
      id: "maintenance",
      description: "Localized defects, tests, documentation, and bounded feature work.",
      terms: ["bug", "fix", "test", "document", "feature", "implement", "support", "refactor"],
      roots: sectorRoots,
      model: "luna",
      skills: [],
    },
    {
      id: "cross-cutting",
      description: "Concurrency, security, performance, migrations, or changes spanning subsystems.",
      terms: ["concurrency", "race", "deadlock", "security", "performance", "migration", "distributed", "architecture"],
      roots: sectorRoots,
      model: "sol",
      skills: [],
    },
  ],
  gates,
  pi: { timeoutMs: 3600000 },
};

// Recheck the immutable source after derivation so a concurrent mutation cannot yield a mixed profile.
const headAfter = (await git(root, ["rev-parse", "HEAD"])).trim();
const statusAfter = (await git(root, ["status", "--porcelain=v1", "--untracked-files=all"])).trim();
if (headAfter !== headBefore || statusAfter) throw new Error("Repository changed while it was being profiled.");

const bytes = `${JSON.stringify(profile, null, 2)}\n`;
if (options.dryRun) process.stdout.write(bytes);
else {
  await writeFile(output, bytes, { flag: "wx", mode: 0o600 });
  process.stdout.write(`${JSON.stringify({ profileSha256: createHash("sha256").update(bytes).digest("hex"), trackedFiles: tracked.length })}\n`);
}

function parseOptions(args) {
  const values = {
    root: "",
    baseCommit: "",
    output: "",
    lunaModel: "openai-codex/gpt-5.6-luna",
    solModel: "openai-codex/gpt-5.6-sol",
    dryRun: false,
  };
  const names = new Map([
    ["--root", "root"],
    ["--base-commit", "baseCommit"],
    ["--output", "output"],
    ["--luna-model", "lunaModel"],
    ["--sol-model", "solModel"],
  ]);
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--dry-run" && !values.dryRun) values.dryRun = true;
    else if (names.has(argument) && args[index + 1] && !args[index + 1].startsWith("--")) {
      values[names.get(argument)] = args[index + 1];
      index += 1;
    } else throw new Error(`Unknown or incomplete option: ${argument}`);
  }
  if (!values.root || !values.baseCommit || !values.output) {
    throw new Error("Usage: profile-deep-swe-repository.mjs --root <repo> --base-commit <sha> --output <new-file> [--luna-model <model>] [--sol-model <model>] [--dry-run]");
  }
  return values;
}

async function git(cwd, args) {
  const result = await runFile("git", ["-C", cwd, ...args], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true,
  });
  return result.stdout;
}

function stableRepositoryFile(path) {
  const name = path.split("/").at(-1);
  return /^(?:AGENTS|CLAUDE)\.md$/iu.test(name) ||
    /^(?:README|CONTRIBUTING)(?:\.[^.]+)?$/iu.test(name) ||
    /^(?:package\.json|pyproject\.toml|Cargo\.toml|go\.mod|Makefile|justfile|pnpm-lock\.yaml|yarn\.lock|package-lock\.json|uv\.lock|poetry\.lock)$/u.test(name);
}

function inferLanguages(counts) {
  const names = new Map([
    [".ts", "TypeScript"], [".tsx", "TypeScript"], [".js", "JavaScript"], [".mjs", "JavaScript"],
    [".py", "Python"], [".go", "Go"], [".rs", "Rust"], [".java", "Java"], [".rb", "Ruby"], [".php", "PHP"],
  ]);
  const totals = new Map();
  for (const [extension, count] of counts) {
    const name = names.get(extension);
    if (name) totals.set(name, (totals.get(name) ?? 0) + count);
  }
  return [...totals].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "en")).map(([name]) => name);
}

function inferredGates(paths) {
  const files = new Set(paths);
  const gates = [];
  if (files.has("go.mod")) gates.push({ id: "go-tests", command: "go", args: ["test", "./..."], timeoutMs: 900000 });
  if (files.has("Cargo.toml")) gates.push({ id: "rust-tests", command: "cargo", args: ["test", "--workspace"], timeoutMs: 900000 });
  if (files.has("package.json")) gates.push({ id: "node-tests", command: "npm", args: ["test"], timeoutMs: 900000 });
  if (files.has("pyproject.toml")) gates.push({ id: "python-tests", command: "python", args: ["-m", "pytest"], timeoutMs: 900000 });
  return gates.slice(0, 3);
}

function safeRelative(path) {
  return path.length > 0 && !isAbsolute(path) && !path.includes("\0") && !/[\r\n]/u.test(path) && !path.split(/[\\/]/u).includes("..");
}

function normalized(path) {
  const value = resolve(path).replace(/[\\/]+$/u, "");
  return process.platform === "win32" ? value.toLowerCase() : value;
}

function samePath(left, right) {
  return normalized(left) === normalized(right);
}

function within(parent, child) {
  const value = relative(parent, child);
  return value === "" || (!value.startsWith(`..${sep}`) && value !== ".." && !isAbsolute(value));
}
