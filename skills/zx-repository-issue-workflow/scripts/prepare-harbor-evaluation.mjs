#!/usr/bin/env node

import { createHash, randomInt } from "node:crypto";
import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";

const [outputInput] = process.argv.slice(2);
if (!outputInput) throw new Error("Usage: node prepare-harbor-evaluation.mjs <new-output-directory>");
const output = resolve(outputInput);
if (await stat(output).catch(() => null)) throw new Error(`Output already exists: ${output}`);

// Development is fixed and optimizer-visible; validation chooses exact unseen instances privately.
const developmentCases = [slugCase(), ledgerCase()];
const maintenanceValidation = [portCase(), suffixCase(), listCase()];
const concurrencyValidation = [cacheCase(), schedulerCase(), transactionCase()];
const validationCases = [
  maintenanceValidation[randomInt(maintenanceValidation.length)],
  concurrencyValidation[randomInt(concurrencyValidation.length)],
];

const developmentRoot = resolve(output, "datasets", "development");
const validationRoot = resolve(output, "datasets", "validation");
await mkdir(developmentRoot, { recursive: true });
await mkdir(validationRoot, { recursive: true });

// Materialize both cohorts before any development inspection so validation can be registered sealed.
for (const [index, definition] of developmentCases.entries()) {
  await writeTask(resolve(developmentRoot, `development-case-${String(index + 1).padStart(3, "0")}`), definition, "development", index + 1);
}
for (const [index, definition] of validationCases.entries()) {
  await writeTask(resolve(validationRoot, `validation-case-${String(index + 1).padStart(3, "0")}`), definition, "validation", index + 1);
}

const summary = {
  schemaVersion: 1,
  development: {
    path: developmentRoot,
    tasks: developmentCases.length,
    sha256: await treeDigest(developmentRoot),
  },
  validation: {
    path: validationRoot,
    tasks: validationCases.length,
    sha256: await treeDigest(validationRoot),
    sealed: true,
  },
};
await writeFile(resolve(output, "dataset-summary.json"), `${JSON.stringify(summary, null, 2)}\n`);

// Print only cohort-level paths, counts, and digests; exact validation identities remain unopened.
console.log(JSON.stringify(summary, null, 2));

async function writeTask(taskRoot, definition, split, ordinal) {
  const environment = resolve(taskRoot, "environment");
  const repository = resolve(environment, "repository");
  const evaluation = resolve(environment, "evaluation");
  const tests = resolve(taskRoot, "tests");
  const solution = resolve(taskRoot, "solution");
  await mkdir(resolve(repository, "src"), { recursive: true });
  await mkdir(resolve(evaluation, "skill-library", "issue-testing"), { recursive: true });
  await mkdir(resolve(evaluation, "skill-library", "concurrency-review"), { recursive: true });
  await mkdir(tests, { recursive: true });
  await mkdir(solution, { recursive: true });

  // Every case starts from the same repository architecture; only issue and acceptance behavior vary.
  for (const [path, source] of Object.entries(commonRepositoryFiles())) {
    const target = resolve(repository, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, source);
  }
  await writeFile(resolve(repository, "test.mjs"), definition.visibleTest);
  await writeFile(resolve(environment, "repository-profile.json"), `${JSON.stringify(repositoryProfile(), null, 2)}\n`);
  await writeFile(
    resolve(evaluation, "skill-library", "issue-testing", "SKILL.md"),
    "---\nname: issue-testing\ndescription: Design focused regression tests and the smallest verified fix for localized utility defects.\n---\n\n# Issue Testing\n\nPreserve public APIs, implement the smallest behavioral repair, and run the declared repository gate.\n",
  );
  await writeFile(
    resolve(evaluation, "skill-library", "concurrency-review", "SKILL.md"),
    "---\nname: concurrency-review\ndescription: Analyze queue, cache, scheduler, transaction, race, and ordering invariants before concurrent repairs.\n---\n\n# Concurrency Review\n\nIdentify the state owner and failing interleaving, then add one explicit serialization or deduplication boundary.\n",
  );
  await writeFile(resolve(evaluation, "fake-pi.mjs"), fakePiSource(definition));
  await writeFile(resolve(environment, "Dockerfile"), dockerfileSource());

  await writeFile(resolve(taskRoot, "instruction.md"), `${definition.issue}\n`);
  await writeFile(resolve(taskRoot, "task.toml"), taskToml(split, ordinal, definition.sector));
  await writeFile(resolve(tests, "test.sh"), testShell());
  await writeFile(resolve(tests, "verify.mjs"), verifierSource(definition));
  await writeFile(resolve(solution, "fixed.mjs"), definition.finalSource);
  await writeFile(
    resolve(solution, "solve.sh"),
    `#!/bin/bash\nset -euo pipefail\ninstall -m 0644 /solution/fixed.mjs /app/repository/${definition.target}\n`,
  );
}

function repositoryProfile() {
  return {
    schemaVersion: 1,
    name: "evaluation-issue-workflow",
    description: "Solve utility and concurrent-state issues in the evaluation repository.",
    repository: {
      summary: "Node ESM utilities with pure transformations and asynchronous state modules in src; test.mjs is the focused acceptance command.",
      architecture: [
        "src contains stable public utility modules",
        "pure transformations and asynchronous state owners remain separate",
        "test.mjs exercises the current issue without changing the public export",
      ],
      conventions: ["Preserve exported names", "Prefer focused behavioral changes", "Do not weaken tests"],
      roots: ["src", "test.mjs", "package.json", "AGENTS.md"],
      extensions: [".js", ".mjs", ".json", ".md"],
      alwaysInclude: ["package.json", "AGENTS.md"],
      ignore: ["node_modules", "coverage", ".env"],
      protectedPaths: ["protected.txt"],
      maxScanFiles: 80,
      contextFiles: 6,
      maxFileBytes: 4096,
      maxContextBytes: 24576,
    },
    models: {
      luna: "openai-codex/gpt-5.6-luna",
      sol: "openai-codex/gpt-5.6-sol",
      lunaThinking: "medium",
      solThinking: "max",
    },
    attempts: 2,
    defaultSector: "maintenance",
    defaultSkills: ["issue-testing"],
    sectors: [
      {
        id: "maintenance",
        description: "Localized slug, port, suffix, list, parsing, normalization, validation, or test defects.",
        terms: ["slug", "port", "suffix", "extension", "list", "parse", "normalize", "validation", "test"],
        roots: ["src", "test.mjs"],
        model: "luna",
        skills: ["issue-testing"],
      },
      {
        id: "concurrency",
        description: "Ledger, cache, scheduler, transaction, queue, overlap, race, and ordering changes.",
        terms: ["ledger", "cache", "scheduler", "transaction", "queue", "overlap", "race", "concurrent", "ordering"],
        roots: ["src", "test.mjs"],
        model: "sol",
        skills: ["concurrency-review"],
      },
    ],
    gates: [{ id: "tests", command: "node", args: ["test.mjs"], timeoutMs: 60000 }],
    pi: { timeoutMs: 120000 },
  };
}

function commonRepositoryFiles() {
  return {
    "AGENTS.md": "# Repository Rules\n\nKeep ESM exports stable and run node test.mjs.\n",
    "package.json": '{"name":"issue-evaluation-repository","private":true,"type":"module"}\n',
    ".gitignore": "node_modules/\n",
    "protected.txt": "protected baseline\n",
    "src/slug.mjs": "export const slugify = (value) => value.toLowerCase().replace(' ', '-');\n",
    "src/port.mjs": "export const parsePort = (value) => Number.parseInt(value, 10);\n",
    "src/suffix.mjs": "export const suffix = (value) => value.split('.').at(-1);\n",
    "src/list.mjs": "export const parseList = (value) => value.split(',');\n",
    "src/ledger.mjs": "export const applyUpdates = async (updates) => { const out = []; await Promise.all(updates.map(async ({ value, delay }) => { await new Promise((done) => setTimeout(done, delay)); out.push(value); })); return out; };\n",
    "src/cache.mjs": "export const createCache = () => ({ get: async (loader) => await loader() });\n",
    "src/scheduler.mjs": "export const schedule = async (jobs) => await Promise.all(jobs.map((job) => job()));\n",
    "src/transaction.mjs": "export const applyTransactions = async (initial, changes) => { let value = initial; await Promise.all(changes.map(async (change) => { const before = value; await Promise.resolve(); value = before + change; })); return value; };\n",
  };
}

function fakePiSource(definition) {
  return `#!/usr/bin/env node
import { appendFile, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
const args = process.argv.slice(2);
const after = (flag) => { const index = args.indexOf(flag); return index >= 0 ? args[index + 1] : ""; };
const skills = [];
for (let index = 0; index < args.length; index += 1) if (args[index] === "--skill") skills.push(args[index + 1]);
const contextArg = args.find((value) => value.startsWith("@"));
const context = contextArg ? await readFile(contextArg.slice(1), "utf8") : "";
const attempt = Number(process.env.ZX_ISSUE_ATTEMPT ?? "0");
await appendFile(resolve(process.env.ZX_ISSUE_RUN_DIR, "fake-pi-calls.jsonl"), JSON.stringify({
  attempt,
  model: after("--model"),
  thinking: after("--thinking"),
  skills,
  noSkills: args.includes("--no-skills"),
  noExtensions: args.includes("--no-extensions"),
  feedback: process.env.ZX_ISSUE_GATE_FEEDBACK ?? "",
  contextHasIssue: context.includes(${JSON.stringify(definition.issue)}),
  contextHasTarget: context.includes(${JSON.stringify(definition.target)}),
}) + "\\n");
if (attempt > 1 && !(process.env.ZX_ISSUE_GATE_FEEDBACK ?? "").trim()) throw new Error("missing gate feedback");
await writeFile(resolve(${JSON.stringify(definition.target)}), attempt === 1 ? ${JSON.stringify(definition.firstSource)} : ${JSON.stringify(definition.finalSource)});
console.log("runtime agent completed attempt " + attempt);
`;
}

function verifierSource(definition) {
  return `#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
const logs = "/logs/verifier";
const metrics = { runtime_agent: 0, functional: 0, routing: 0, skill_selection: 0, isolation: 0 };
const diagnostics = [];
await check("runtime_agent", async () => {
  const run = await latestRun();
  const calls = lines(await readFile(resolve(run, "fake-pi-calls.jsonl"), "utf8"));
  assert(calls.length === 2, "runtime pi was not invoked for both bounded attempts");
  assert(calls.every((call) => call.contextHasIssue && call.contextHasTarget), "runtime pi missed reduced issue context");
  assert(calls[1].feedback.trim(), "retry did not receive external gate feedback");
});
await check("functional", async () => {
  const gate = await runProcess("node", ["test.mjs"], "/app/repository");
  assert(gate.code === 0, "visible repository gate failed: " + gate.stderr);
  ${definition.hiddenCheck}
});
await check("routing", async () => {
  const calls = lines(await readFile(resolve(await latestRun(), "fake-pi-calls.jsonl"), "utf8"));
  assert(calls.every((call) => call.model === ${JSON.stringify(definition.model)}), "model route drifted");
  assert(calls.every((call) => call.thinking === ${JSON.stringify(definition.thinking)}), "thinking route drifted");
});
await check("skill_selection", async () => {
  const calls = lines(await readFile(resolve(await latestRun(), "fake-pi-calls.jsonl"), "utf8"));
  assert(calls.every((call) => call.noSkills && call.noExtensions), "ambient pi capabilities were enabled");
  assert(calls.every((call) => call.skills.some((path) => path.endsWith(${JSON.stringify(definition.expectedSkill)}))), "expected native skill was not selected");
  assert(calls.every((call) => !call.skills.some((path) => path.endsWith("irrelevant-documentation"))), "irrelevant skill was selected");
});
await check("isolation", async () => {
  assert((await readFile("/app/repository/protected.txt", "utf8")) === "protected baseline\\n", "protected path changed");
  const worktrees = await runProcess("git", ["worktree", "list", "--porcelain"], "/app/repository");
  assert((worktrees.stdout.match(/^worktree /gm) ?? []).length === 1, "temporary worktree remains");
  const generated = [
    await readFile("/app/solver/solve-issue.mjs", "utf8"),
    await readFile("/app/solver/repository-profile.json", "utf8"),
  ].join("\\n");
  assert(!generated.includes(${JSON.stringify(definition.issue)}), "generated workflow embedded the runtime issue");
  assert(!generated.includes(${JSON.stringify(definition.finalSource.trim())}), "generated workflow embedded the expected fix");
  const memory = lines(await readFile("/app/repository/.git/zx-issue-workflow/evaluation-issue-workflow/memory.jsonl", "utf8"));
  assert(memory.length === 1 && memory[0].model === ${JSON.stringify(definition.model)}, "accepted-run memory is invalid");
});
await mkdir(logs, { recursive: true });
const reward = Object.values(metrics).every((value) => value === 1) ? 1 : 0;
await writeFile(resolve(logs, "reward.json"), JSON.stringify({ reward, ...metrics }, null, 2) + "\\n");
await writeFile(resolve(logs, "diagnostics.json"), JSON.stringify({
  status: reward ? "passed" : "completed",
  failure_domain: reward ? null : "task",
  terminal_outcome: reward ? "passed" : "completed",
  error_code: reward ? null : "verification_failed",
  metrics,
  diagnostics,
}, null, 2) + "\\n");
console.log(JSON.stringify({ reward, ...metrics }));
async function check(metric, operation) { try { await operation(); metrics[metric] = 1; diagnostics.push({ metric, passed: true }); } catch (error) { diagnostics.push({ metric, passed: false, error: error instanceof Error ? error.message : String(error) }); } }
async function latestRun() { const root = "/app/repository/.git/zx-issue-workflow/evaluation-issue-workflow/runs"; const entries = (await readdir(root, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort(); assert(entries.length > 0, "workflow run is missing"); return resolve(root, entries.at(-1)); }
function lines(text) { return text.trim().split(/\\r?\\n/).filter(Boolean).map(JSON.parse); }
function assert(value, message) { if (!value) throw new Error(message); }
async function runProcess(command, args, cwd) { return await new Promise((done) => { const child = spawn(command, args, { cwd, shell: false }); let stdout = ""; let stderr = ""; child.stdout.on("data", (chunk) => stdout += String(chunk)); child.stderr.on("data", (chunk) => stderr += String(chunk)); child.on("error", (error) => done({ code: 1, stdout, stderr: stderr + error.message })); child.on("close", (code) => done({ code: code ?? 1, stdout, stderr })); }); }
`;
}

function dockerfileSource() {
  return `FROM node:22.22.0-bookworm-slim
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*
COPY repository /app/repository
COPY repository-profile.json /opt/zx-evaluation/repository-profile.json
COPY evaluation/skill-library /opt/zx-evaluation/skill-library
COPY evaluation/fake-pi.mjs /opt/zx-evaluation/fake-pi.mjs
RUN chmod 0555 /opt/zx-evaluation/fake-pi.mjs && git -C /app/repository init && git -C /app/repository config user.name Baseline && git -C /app/repository config user.email baseline@example.invalid && git -C /app/repository config core.autocrlf false && git -C /app/repository add . && git -C /app/repository commit -m baseline
WORKDIR /app
`;
}

function taskToml(split, ordinal, sector) {
  return `schema_version = "1.3"
artifacts = []

[task]
name = "zx-harness/repository-issue-${split}-${String(ordinal).padStart(3, "0")}"
description = "Evaluate a frozen generated workflow on one ${sector} repository issue."
keywords = ["zx", "pi", "issues", "${sector}"]

[[task.authors]]
name = "zx-harness maintainers"

[metadata]
difficulty = "hard"
category = "software_engineering"
tags = ["zx", "harbor", "runtime-agent", "skills"]
expert_time_estimate_min = 30
junior_time_estimate_min = 120

[verifier]
timeout_sec = 180.0
collect = []

[verifier.env]

[agent]
timeout_sec = 1200.0

[environment]
network_mode = "public"
build_timeout_sec = 900.0
os = "linux"
mcp_servers = []

[environment.env]

[solution.env]
`;
}

function testShell() {
  return `#!/bin/bash
set -u
mkdir -p /logs/verifier
rm -f /logs/verifier/reward.json /logs/verifier/reward.txt /logs/verifier/diagnostics.json
node /tests/verify.mjs
if [ ! -f /logs/verifier/reward.json ]; then
  printf '%s\\n' '{"reward":0,"runtime_agent":0,"functional":0,"routing":0,"skill_selection":0,"isolation":0}' > /logs/verifier/reward.json
fi
exit 0
`;
}

function baseCase(values) {
  return {
    ...values,
    model: values.sector === "concurrency" ? "openai-codex/gpt-5.6-sol" : "openai-codex/gpt-5.6-luna",
    thinking: values.sector === "concurrency" ? "max" : "medium",
    expectedSkill: values.sector === "concurrency" ? "concurrency-review" : "issue-testing",
  };
}

function slugCase() {
  return baseCase({
    sector: "maintenance",
    issue: "Make slugify trim outer separators and collapse repeated non-alphanumeric separators while preserving its export.",
    target: "src/slug.mjs",
    firstSource: "export const slugify = (value) => value.trim().toLowerCase().replace(' ', '-');\n",
    finalSource: "export const slugify = (value) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');\n",
    visibleTest: "import assert from 'node:assert/strict';\nimport { slugify } from './src/slug.mjs';\nassert.equal(slugify('  Hello   World  '), 'hello-world');\nconsole.log('tests passed');\n",
    hiddenCheck: "const { slugify } = await import(pathToFileURL('/app/repository/src/slug.mjs')); assert(slugify('API / V2') === 'api-v2', 'hidden slug behavior failed');",
  });
}

function ledgerCase() {
  return baseCase({
    sector: "concurrency",
    issue: "Serialize overlapping ledger updates so results preserve invocation order even when later delays finish first.",
    target: "src/ledger.mjs",
    firstSource: "export const applyUpdates = async (updates) => { const out = []; await Promise.all(updates.map(async ({ value, delay }) => { await new Promise((done) => setTimeout(done, delay)); out.push(value); })); return out; };\n",
    finalSource: "export const applyUpdates = async (updates) => { const out = []; for (const { value, delay } of updates) { await new Promise((done) => setTimeout(done, delay)); out.push(value); } return out; };\n",
    visibleTest: "import assert from 'node:assert/strict';\nimport { applyUpdates } from './src/ledger.mjs';\nassert.deepEqual(await applyUpdates([{value:'first',delay:20},{value:'second',delay:0}]), ['first','second']);\nconsole.log('tests passed');\n",
    hiddenCheck: "const { applyUpdates } = await import(pathToFileURL('/app/repository/src/ledger.mjs')); assert(JSON.stringify(await applyUpdates([{value:'a',delay:5},{value:'b',delay:0},{value:'c',delay:1}])) === JSON.stringify(['a','b','c']), 'hidden ledger ordering failed');",
  });
}

function portCase() {
  return baseCase({
    sector: "maintenance",
    issue: "Make parsePort accept only whole decimal ports from 1 through 65535 and return null otherwise.",
    target: "src/port.mjs",
    firstSource: "export const parsePort = (value) => { const port = Number(value); return Number.isNaN(port) ? null : port; };\n",
    finalSource: "export const parsePort = (value) => { if (!/^[0-9]+$/.test(String(value))) return null; const port = Number(value); return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : null; };\n",
    visibleTest: "import assert from 'node:assert/strict';\nimport { parsePort } from './src/port.mjs';\nassert.equal(parsePort('443'), 443);\nassert.equal(parsePort('3.5'), null);\nassert.equal(parsePort('70000'), null);\nconsole.log('tests passed');\n",
    hiddenCheck: "const { parsePort } = await import(pathToFileURL('/app/repository/src/port.mjs')); assert(parsePort('0') === null && parsePort('65535') === 65535 && parsePort('12x') === null, 'hidden port behavior failed');",
  });
}

function suffixCase() {
  return baseCase({
    sector: "maintenance",
    issue: "Return a lowercase suffix without the dot, but return an empty string for hidden or extensionless paths.",
    target: "src/suffix.mjs",
    firstSource: "export const suffix = (value) => value.split('.').at(-1).toLowerCase();\n",
    finalSource: "export const suffix = (value) => { const name = value.replaceAll('\\\\', '/').split('/').at(-1); const index = name.lastIndexOf('.'); return index > 0 && index < name.length - 1 ? name.slice(index + 1).toLowerCase() : ''; };\n",
    visibleTest: "import assert from 'node:assert/strict';\nimport { suffix } from './src/suffix.mjs';\nassert.equal(suffix('docs/Report.MD'), 'md');\nassert.equal(suffix('.env'), '');\nassert.equal(suffix('README'), '');\nconsole.log('tests passed');\n",
    hiddenCheck: "const { suffix } = await import(pathToFileURL('/app/repository/src/suffix.mjs')); assert(suffix('a/b/archive.tar.GZ') === 'gz' && suffix('a/b/name.') === '', 'hidden suffix behavior failed');",
  });
}

function listCase() {
  return baseCase({
    sector: "maintenance",
    issue: "Make parseList trim comma-separated entries, drop empty values, and deduplicate while preserving first-seen order.",
    target: "src/list.mjs",
    firstSource: "export const parseList = (value) => value.split(',').map((item) => item.trim()).filter(Boolean);\n",
    finalSource: "export const parseList = (value) => [...new Set(value.split(',').map((item) => item.trim()).filter(Boolean))];\n",
    visibleTest: "import assert from 'node:assert/strict';\nimport { parseList } from './src/list.mjs';\nassert.deepEqual(parseList(' a, b, a, , c '), ['a','b','c']);\nconsole.log('tests passed');\n",
    hiddenCheck: "const { parseList } = await import(pathToFileURL('/app/repository/src/list.mjs')); assert(JSON.stringify(parseList('x,x,y,x')) === JSON.stringify(['x','y']), 'hidden list behavior failed');",
  });
}

function cacheCase() {
  return baseCase({
    sector: "concurrency",
    issue: "Deduplicate overlapping cache refresh calls so concurrent callers share one loader promise, then allow a later refresh.",
    target: "src/cache.mjs",
    firstSource: "export const createCache = () => { let value; return { get: async (loader) => value ??= await loader() }; };\n",
    finalSource: "export const createCache = () => { let pending = null; return { get: async (loader) => { if (!pending) pending = Promise.resolve().then(loader).finally(() => { pending = null; }); return await pending; } }; };\n",
    visibleTest: "import assert from 'node:assert/strict';\nimport { createCache } from './src/cache.mjs';\nconst cache = createCache(); let calls = 0; const loader = async () => { calls += 1; await new Promise((done) => setTimeout(done, 10)); return calls; };\nassert.deepEqual(await Promise.all([cache.get(loader), cache.get(loader)]), [1,1]); assert.equal(calls, 1); await cache.get(loader); assert.equal(calls, 2);\nconsole.log('tests passed');\n",
    hiddenCheck: "const { createCache } = await import(pathToFileURL('/app/repository/src/cache.mjs')); const cache = createCache(); let calls = 0; const loader = async () => ++calls; assert(JSON.stringify(await Promise.all([cache.get(loader),cache.get(loader),cache.get(loader)])) === JSON.stringify([1,1,1]), 'hidden cache deduplication failed');",
  });
}

function schedulerCase() {
  return baseCase({
    sector: "concurrency",
    issue: "Run scheduler jobs serially in declaration order and return results in that same order.",
    target: "src/scheduler.mjs",
    firstSource: "export const schedule = async (jobs) => await Promise.all(jobs.map((job) => job()));\n",
    finalSource: "export const schedule = async (jobs) => { const results = []; for (const job of jobs) results.push(await job()); return results; };\n",
    visibleTest: "import assert from 'node:assert/strict';\nimport { schedule } from './src/scheduler.mjs';\nconst order = []; const jobs = [async()=>{await new Promise((d)=>setTimeout(d,15));order.push('a');return 'a';},async()=>{order.push('b');return 'b';}]; assert.deepEqual(await schedule(jobs), ['a','b']); assert.deepEqual(order,['a','b']);\nconsole.log('tests passed');\n",
    hiddenCheck: "const { schedule } = await import(pathToFileURL('/app/repository/src/scheduler.mjs')); const order = []; await schedule([async()=>order.push(1),async()=>order.push(2),async()=>order.push(3)]); assert(JSON.stringify(order) === JSON.stringify([1,2,3]), 'hidden scheduler ordering failed');",
  });
}

function transactionCase() {
  return baseCase({
    sector: "concurrency",
    issue: "Apply asynchronous transaction deltas without lost updates when operations overlap.",
    target: "src/transaction.mjs",
    firstSource: "export const applyTransactions = async (initial, changes) => initial + await Promise.race(changes);\n",
    finalSource: "export const applyTransactions = async (initial, changes) => { let value = initial; for (const change of changes) value += await change; return value; };\n",
    visibleTest: "import assert from 'node:assert/strict';\nimport { applyTransactions } from './src/transaction.mjs';\nassert.equal(await applyTransactions(10, [Promise.resolve(2),Promise.resolve(-3),Promise.resolve(5)]), 14);\nconsole.log('tests passed');\n",
    hiddenCheck: "const { applyTransactions } = await import(pathToFileURL('/app/repository/src/transaction.mjs')); assert(await applyTransactions(0, [Promise.resolve(1),Promise.resolve(2),Promise.resolve(3)]) === 6, 'hidden transaction update failed');",
  });
}

async function treeDigest(root) {
  const files = [];
  const pending = [root];
  while (pending.length) {
    const current = pending.pop();
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const path = resolve(current, entry.name);
      if (entry.isDirectory()) pending.push(path);
      else if (entry.isFile()) files.push(path);
      else throw new Error(`Unsupported evaluation entry: ${path}`);
    }
  }
  const hash = createHash("sha256");
  for (const file of files.sort()) {
    const bytes = await import("node:fs/promises").then(({ readFile }) => readFile(file));
    hash.update(relative(root, file).replaceAll("\\", "/"));
    hash.update("\0");
    hash.update(String(bytes.length));
    hash.update("\0");
    hash.update(bytes);
  }
  return hash.digest("hex");
}
