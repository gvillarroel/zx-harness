#!/usr/bin/env node

import { spawn } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const skillRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const fixtures = resolve(skillRoot, "scripts", "fixtures");
const scaffold = resolve(skillRoot, "scripts", "scaffold-repository-issue-workflow.mjs");
const fakePi = resolve(fixtures, "fake-pi.mjs");
const profile = resolve(fixtures, "repository-profile.json");
const skillLibrary = resolve(fixtures, "skill-library");
const temporaryBase = resolve(skillRoot, "..", "..", ".tmp");
await mkdir(temporaryBase, { recursive: true });
const temporaryRoot = await mkdtemp(resolve(temporaryBase, "zx-repository-issue-workflow-"));
const liveProbe = process.argv.includes("--live");

try {
  // Check discovery metadata and the runtime boundary before spending time on integration fixtures.
  const skillText = await readFile(resolve(skillRoot, "SKILL.md"), "utf8");
  const frontmatter = skillText.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? "";
  const keys = frontmatter.split(/\r?\n/).filter(Boolean).map((line) => line.split(":", 1)[0]);
  if (keys.join(",") !== "name,description" || !skillText.includes("Generate the solver architecture")) {
    throw new Error("Skill metadata or objective is invalid.");
  }
  const runtime = await readFile(resolve(skillRoot, "assets", "runtime", "solve-issue.mjs"), "utf8");
  for (const required of [
    "#!/usr/bin/env zx",
    '"--skill"',
    '"--no-skills"',
    '"worktree", "add"',
    '"apply", "--check"',
    "sector.model === \"sol\"",
  ]) {
    if (!runtime.includes(required)) throw new Error(`Runtime boundary is missing: ${required}`);
  }

  // Scaffold once outside a repository to prove the generated artifact contains no fixture answer.
  const generatedProbe = resolve(temporaryRoot, "generated-probe");
  await run(process.execPath, [scaffold, profile, generatedProbe, "--skill-library", skillLibrary], temporaryRoot);
  const generatedCatalog = JSON.parse(await readFile(resolve(generatedProbe, "skills", "catalog.json"), "utf8"));
  if (
    !generatedCatalog.skills["issue-testing"] ||
    !generatedCatalog.skills["concurrency-review"] ||
    generatedCatalog.skills["irrelevant-documentation"]
  ) {
    throw new Error("Scaffolding did not preserve the curated skill boundary.");
  }
  const generatedBytes = (
    await Promise.all([
      readFile(resolve(generatedProbe, "solve-issue.mjs"), "utf8"),
      readFile(resolve(generatedProbe, "repository-profile.json"), "utf8"),
      readFile(resolve(generatedProbe, "skills", generatedCatalog.repositoryGuide.name, "SKILL.md"), "utf8"),
    ])
  ).join("\n");
  if (generatedBytes.includes("end - start + 1") || generatedBytes.includes("Make the integer range include the end value")) {
    throw new Error("Generated workflow contains a fixture answer or issue text.");
  }
  const packageJson = JSON.parse(await readFile(resolve(generatedProbe, "package.json"), "utf8"));
  if (
    packageJson.dependencies["@earendil-works/pi-coding-agent"] !== "0.84.2" ||
    packageJson.dependencies.zx !== "8.8.5"
  ) {
    throw new Error("Generated runtime dependencies are not pinned.");
  }
  if (packageJson.scripts !== undefined) {
    throw new Error("Generated bundle must not duplicate its entrypoint with package-script aliases.");
  }
  // Walk the output itself so any future helper or undeclared artifact fails the minimal bundle.
  const generatedFiles = [];
  const pendingDirectories = [generatedProbe];
  while (pendingDirectories.length) {
    const directory = pendingDirectories.pop();
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) pendingDirectories.push(path);
      else generatedFiles.push(relative(generatedProbe, path).replaceAll("\\", "/"));
    }
  }
  generatedFiles.sort();
  const expectedFiles = [
    "package.json",
    "repository-profile.json",
    "solve-issue.mjs",
    "skills/catalog.json",
    `skills/${generatedCatalog.repositoryGuide.name}/SKILL.md`,
    ...Object.keys(generatedCatalog.skills).map((name) => `skills/${name}/SKILL.md`),
  ].sort();
  if (generatedFiles.join(",") !== expectedFiles.join(",")) {
    throw new Error(`Generated bundle contains an extra or missing file: ${generatedFiles.join(", ")}`);
  }

  // Validate the fixed Harbor adapter against Harbor's native agent types without starting Docker.
  await run(
    "uv",
    ["run", "--with", "harbor==0.18.0", "python", resolve(skillRoot, "scripts", "validate-agent.py")],
    skillRoot,
    { UV_CACHE_DIR: resolve(temporaryBase, "uv-cache") },
    0,
    300000,
  );

  // A dry run must classify, reduce, and select without creating state or invoking the fake agent.
  const maintenance = await createRepository("maintenance", "maintenance");
  const maintenanceScript = resolve(maintenance, "tools", "issue-solver", "solve-issue.mjs");
  const dry = await run(
    process.execPath,
    [
      maintenanceScript,
      maintenanceScript,
      "--root",
      maintenance,
      "--dry-run",
      "--issue",
      "Make the integer range include the end value.",
    ],
    maintenance,
  );
  const dryPlan = JSON.parse(dry.stdout);
  if (
    dryPlan.status !== "planned" ||
    dryPlan.sector !== "maintenance" ||
    dryPlan.model !== "openai-codex/gpt-5.6-luna" ||
    dryPlan.thinking !== "medium" ||
    dryPlan.contextBytes > 8192 ||
    dryPlan.files.length > 4 ||
    !dryPlan.files.some((file) => file.path === "src/range.mjs") ||
    !dryPlan.skills.some((skill) => skill.name === "issue-testing") ||
    dryPlan.skills.some((skill) => skill.name === "concurrency-review")
  ) {
    throw new Error("Maintenance dry-run routing or bounded context is incorrect.");
  }
  const maintenanceState = resolve(maintenance, ".git", "zx-issue-workflow");
  if (await stat(maintenanceState).catch(() => null)) throw new Error("Dry-run created private state.");

  // The first fake agent patch fails; the second receives gate output and fixes the runtime issue.
  const live = await run(
    process.execPath,
    [maintenanceScript, "--root", maintenance, "--issue", "Make the integer range include the end value."],
    maintenance,
    {
      ZX_ISSUE_PI_COMMAND: process.execPath,
      ZX_ISSUE_PI_PREFIX_JSON: JSON.stringify([fakePi]),
      ZX_FIXTURE_MODE: "maintenance",
      FIXTURE_API_KEY: "must-not-enter-agent-environment",
    },
    0,
    120000,
  );
  const liveResult = JSON.parse(live.stdout);
  if (liveResult.status !== "applied" || !liveResult.changedFiles.includes("src/range.mjs")) {
    throw new Error("Passing patch was not applied to the original checkout.");
  }
  await run(process.execPath, ["test.mjs"], maintenance);
  const maintenanceRun = await latestRun(maintenance);
  const calls = await readJsonLines(resolve(maintenanceRun, "fake-pi-calls.jsonl"));
  if (
    calls.length !== 2 ||
    calls.some((call) => call.model !== "openai-codex/gpt-5.6-luna" || call.thinking !== "medium") ||
    calls.some((call) => !call.noSkills || !call.noExtensions || call.secretPresent) ||
    calls.some((call) => !call.skills.some((path) => path.endsWith("issue-testing"))) ||
    calls.some((call) => call.skills.some((path) => path.endsWith("concurrency-review"))) ||
    !/tests:|AssertionError|expected/i.test(calls[1].feedback) ||
    !calls.every((call) => call.contextHasIssue && call.contextHasRange)
  ) {
    throw new Error("Runtime pi invocation, native skills, secret isolation, or retry feedback is incorrect.");
  }
  const agentLog = await readFile(resolve(maintenanceRun, "agent-1.stdout.txt"), "utf8");
  if (!agentLog.includes("[REDACTED]") || agentLog.includes("runtime-secret")) {
    throw new Error("Agent logs did not redact credential-shaped output.");
  }
  const memory = await readJsonLines(resolve(maintenance, ".git", "zx-issue-workflow", "fixture-issue-workflow", "memory.jsonl"));
  if (memory.length !== 1 || memory[0].sector !== "maintenance" || !memory[0].files.includes("src/range.mjs")) {
    throw new Error("Accepted-run memory is missing or contains the wrong evidence.");
  }
  const remembered = await run(
    process.execPath,
    [maintenanceScript, "--root", maintenance, "--dry-run", "--issue", "Add another inclusive range regression test."],
    maintenance,
  );
  if (!JSON.parse(remembered.stdout).memories.length) throw new Error("Relevant accepted-run memory was not retrieved.");
  const worktrees = await run("git", ["worktree", "list", "--porcelain"], maintenance);
  if ((worktrees.stdout.match(/^worktree /gm) ?? []).length !== 1) throw new Error("Temporary worktree was not removed.");

  // A concurrency problem is routed to Sol before inference and keeps that route for the whole run.
  const concurrency = await createRepository("concurrency", "concurrency");
  const concurrencyScript = resolve(concurrency, "tools", "issue-solver", "solve-issue.mjs");
  const powerPlan = JSON.parse(
    (
      await run(
        process.execPath,
        [concurrencyScript, "--root", concurrency, "--dry-run", "--issue", "Fix the queue race under concurrent updates."],
        concurrency,
      )
    ).stdout,
  );
  if (
    powerPlan.sector !== "concurrency" ||
    powerPlan.model !== "openai-codex/gpt-5.6-sol" ||
    powerPlan.thinking !== "max" ||
    !powerPlan.skills.some((skill) => skill.name === "concurrency-review")
  ) {
    throw new Error("Power-sector pre-routing is incorrect.");
  }
  await run(
    process.execPath,
    [concurrencyScript, "--root", concurrency, "--issue", "Fix the queue race under concurrent updates."],
    concurrency,
    {
      ZX_ISSUE_PI_COMMAND: process.execPath,
      ZX_ISSUE_PI_PREFIX_JSON: JSON.stringify([fakePi]),
      ZX_FIXTURE_MODE: "concurrency",
    },
    0,
    120000,
  );
  const powerCalls = await readJsonLines(resolve(await latestRun(concurrency), "fake-pi-calls.jsonl"));
  if (powerCalls.length !== 1 || powerCalls[0].model !== "openai-codex/gpt-5.6-sol" || powerCalls[0].thinking !== "max") {
    throw new Error("Live power-sector route drifted.");
  }
  await run(process.execPath, ["test.mjs"], concurrency);

  // Exhausted retries retain a failed patch while leaving every tracked checkout byte unchanged.
  const failure = await createRepository("failure", "maintenance");
  const failureScript = resolve(failure, "tools", "issue-solver", "solve-issue.mjs");
  const beforeFailure = await readFile(resolve(failure, "src", "range.mjs"), "utf8");
  const failed = await run(
    process.execPath,
    [failureScript, "--root", failure, "--issue", "Make the integer range include the end value."],
    failure,
    {
      ZX_ISSUE_PI_COMMAND: process.execPath,
      ZX_ISSUE_PI_PREFIX_JSON: JSON.stringify([fakePi]),
      ZX_FIXTURE_MODE: "failure",
    },
    1,
    120000,
  );
  if (!failed.stderr.includes("Original checkout was not changed")) throw new Error("Failure did not report isolation.");
  if ((await readFile(resolve(failure, "src", "range.mjs"), "utf8")) !== beforeFailure) {
    throw new Error("Failed agent mutations reached the original checkout.");
  }
  const failureStatus = await run("git", ["status", "--porcelain=v1", "--untracked-files=all"], failure);
  if (failureStatus.stdout.trim()) throw new Error("Failed run dirtied the original checkout.");
  const failedPatch = await readFile(resolve(await latestRun(failure), "failed.patch"), "utf8");
  if (!failedPatch.includes("src/range.mjs")) throw new Error("Failed patch evidence was not retained.");
  const failedCalls = await readJsonLines(resolve(await latestRun(failure), "fake-pi-calls.jsonl"));
  if (failedCalls.length !== 2 || failedCalls.some((call) => call.model !== "openai-codex/gpt-5.6-luna")) {
    throw new Error("Failed retries changed model route or attempt count.");
  }

  // Even a passing gate cannot authorize a generated-workflow or repository-protected mutation.
  const protectedRepo = await createRepository("protected", "passing");
  const protectedScript = resolve(protectedRepo, "tools", "issue-solver", "solve-issue.mjs");
  await run(
    process.execPath,
    [protectedScript, "--root", protectedRepo, "--issue", "Update validation documentation."],
    protectedRepo,
    {
      ZX_ISSUE_PI_COMMAND: process.execPath,
      ZX_ISSUE_PI_PREFIX_JSON: JSON.stringify([fakePi]),
      ZX_FIXTURE_MODE: "protected",
    },
    1,
    120000,
  );
  if ((await readFile(resolve(protectedRepo, "protected.txt"), "utf8")) !== "original\n") {
    throw new Error("Protected mutation reached the original checkout.");
  }

  // A dirty checkout fails before pi, preserving user-owned changes and avoiding ambiguous patches.
  const dirty = await createRepository("dirty", "maintenance");
  await writeFile(resolve(dirty, "src", "unrelated.mjs"), "export const userChange = true;\n");
  const dirtyScript = resolve(dirty, "tools", "issue-solver", "solve-issue.mjs");
  const dirtyResult = await run(
    process.execPath,
    [dirtyScript, "--root", dirty, "--issue", "Make the integer range include the end value."],
    dirty,
    {
      ZX_ISSUE_PI_COMMAND: process.execPath,
      ZX_ISSUE_PI_PREFIX_JSON: JSON.stringify([fakePi]),
      ZX_FIXTURE_MODE: "maintenance",
    },
    1,
  );
  if (!dirtyResult.stderr.includes("Repository must be clean")) throw new Error("Dirty checkout was not rejected.");

  if (liveProbe) {
    // This optional forward probe uses the real pi coding agent; it is never labeled fixture evidence.
    const livePiCli = process.env.ZX_ISSUE_LIVE_PI_CLI;
    if (!livePiCli || !(await stat(livePiCli).catch(() => null))?.isFile()) {
      throw new Error("Set ZX_ISSUE_LIVE_PI_CLI to the installed pi coding-agent cli.js for --live.");
    }
    const liveRepository = await createRepository("live", "maintenance");
    const liveScript = resolve(liveRepository, "tools", "issue-solver", "solve-issue.mjs");
    const liveRun = await run(
      process.execPath,
      [liveScript, "--root", liveRepository, "--issue", "Make integerRange include both endpoints without changing its exported name."],
      liveRepository,
      {
        ZX_ISSUE_PI_COMMAND: process.execPath,
        ZX_ISSUE_PI_PREFIX_JSON: JSON.stringify([livePiCli]),
      },
      0,
      900000,
    );
    const liveResult = JSON.parse(liveRun.stdout);
    if (liveResult.status !== "applied" || liveResult.model !== "openai-codex/gpt-5.6-luna") {
      throw new Error("Real pi probe did not apply a Luna-authored passing patch.");
    }
    await run(process.execPath, ["test.mjs"], liveRepository);
    console.log("real pi Luna probe passed.");
  }

  console.log("zx-repository-issue-workflow validation passed.");
} finally {
  // Delete only this validator's exact mkdtemp directory so repository evidence stays untouched.
  await rm(temporaryRoot, { recursive: true, force: true });
}

async function createRepository(name, scenario) {
  const repository = resolve(temporaryRoot, name);
  await mkdir(resolve(repository, "src"), { recursive: true });
  await writeFile(resolve(repository, "AGENTS.md"), "# Fixture Rules\n\nKeep source in src and run node test.mjs.\n");
  await writeFile(resolve(repository, ".gitignore"), "node_modules/\n");
  await writeFile(resolve(repository, "package.json"), '{"name":"fixture-repository","private":true,"type":"module"}\n');
  await writeFile(
    resolve(repository, "src", "range.mjs"),
    "export const integerRange = (start, end) => Array.from({ length: end - start }, (_, index) => start + index);\n",
  );
  await writeFile(resolve(repository, "src", "queue.mjs"), "export const queuePolicy = 'parallel';\n");
  await writeFile(resolve(repository, "src", "unrelated.mjs"), "export const unrelated = 'large unrelated documentation '.repeat(300);\n");
  await writeFile(resolve(repository, "protected.txt"), "original\n");
  const test = scenario === "concurrency"
    ? "import assert from 'node:assert/strict';\nimport { queuePolicy } from './src/queue.mjs';\nassert.equal(queuePolicy, 'serialized');\nconsole.log('tests passed');\n"
    : scenario === "passing"
      ? "console.log('tests passed');\n"
      : "import assert from 'node:assert/strict';\nimport { integerRange } from './src/range.mjs';\nassert.deepEqual(integerRange(1, 3), [1, 2, 3]);\nconsole.log('tests passed');\n";
  await writeFile(resolve(repository, "test.mjs"), test);
  await run(process.execPath, [scaffold, profile, resolve(repository, "tools", "issue-solver"), "--skill-library", skillLibrary], repository);
  await run("git", ["init"], repository);
  await run("git", ["config", "user.email", "fixture@example.invalid"], repository);
  await run("git", ["config", "user.name", "Fixture"], repository);
  await run("git", ["config", "core.autocrlf", "false"], repository);
  await run("git", ["add", "."], repository);
  await run("git", ["commit", "-m", "fixture baseline"], repository);
  return repository;
}

async function latestRun(repository) {
  const directory = resolve(repository, ".git", "zx-issue-workflow", "fixture-issue-workflow", "runs");
  const entries = (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  if (!entries.length) throw new Error(`No workflow run exists in ${repository}`);
  return resolve(directory, entries.at(-1));
}

async function readJsonLines(path) {
  return (await readFile(path, "utf8"))
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

async function run(command, args, cwd, additions = {}, expectedCode = 0, timeoutMs = 60000) {
  return await new Promise((resolvePromise, rejectPromise) => {
    // All fixture values remain argv data; tests never enable a shell.
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...additions },
      shell: false,
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.stdin.end();
    child.on("error", rejectPromise);
    child.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) rejectPromise(new Error(`Timed out: ${command} ${args.join(" ")}`));
      else if ((code ?? 1) !== expectedCode) {
        rejectPromise(new Error(`Unexpected exit ${code}: ${command} ${args.join(" ")}\n${stdout}\n${stderr}`));
      } else resolvePromise({ code: code ?? 1, stdout, stderr });
    });
  });
}
