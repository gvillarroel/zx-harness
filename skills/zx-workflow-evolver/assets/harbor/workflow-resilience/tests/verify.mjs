#!/usr/bin/env node

import { spawn } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

// Accept explicit paths so the same hidden verifier can exercise the reference workflow locally.
const flags = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  flags.set(process.argv[index], process.argv[index + 1]);
}
const candidate = resolve(flags.get("--candidate") ?? "/app/workflow.mjs");
const logs = resolve(flags.get("--logs") ?? "/logs/verifier");
const suiteRoot = await mkdtemp(resolve(tmpdir(), "zx-harbor-workflow-"));
const metrics = {
  functional: 0,
  resilience: 0,
  efficiency: 0,
  security: 0,
  determinism: 0,
};
const diagnostics = [];

try {
  // Functional behavior proves gated output, target mutation, and fast-to-strong routing.
  await check("functional", async () => {
    const result = await retryCase("functional");
    assert(result.output.summary === "Improve retry safety", "accepted output was not promoted");
    assert(result.target === "quality-improved\ntests-added\n", "accepted patch was not applied");
    assert(result.manifest.acceptedAttempt === 2, "workflow did not accept the second attempt");
    assert(
      result.events
        .filter((event) => event.event === "model_selected")
        .map((event) => event.model)
        .join(",") === "fixture/fast,fixture/strong",
      "model route did not escalate after the failed gate",
    );
  });

  // Resilience proves actionable retry feedback and byte-exact rollback after a post-apply failure.
  await check("resilience", async () => {
    const retry = await retryCase("resilience-retry");
    const failedAttempt = retry.events.find((event) => event.event === "attempt_failed");
    const secondSelection = retry.events.filter((event) => event.event === "model_selected")[1];
    assert(
      failedAttempt?.feedback.includes("risk, tests, patch"),
      "failed candidate did not expose exact missing fields",
    );
    assert(secondSelection?.feedback === failedAttempt.feedback, "retry did not receive exact gate feedback");
    const rollback = await rollbackCase();
    assert(rollback.result.code !== 0, "terminal target-gate failure unexpectedly passed");
    assert(rollback.target.equals(rollback.original), "rollback changed original target bytes");
    assert(!(await exists(resolve(rollback.root, "output", "proposal.json"))), "failed output was promoted");
    assert(
      rollback.events.some((event) => event.event === "stage_rolled_back"),
      "rollback event was not recorded",
    );
  });

  // Efficiency proves deterministic static ranking and every declared collection/context cap.
  await check("efficiency", async () => {
    const result = await retryCase("efficiency");
    assert(result.context.scannedFiles === 6, "file collection did not stop at maxFiles");
    assert(result.context.selected.length <= 2, "topK cap was exceeded");
    assert(result.context.totalBytes <= 180, "contextMaxBytes cap was exceeded");
    assert(
      result.context.selected.every((item) => item.bytes <= 120),
      "maxBytesPerFile cap was exceeded",
    );
    assert(
      result.context.selected[0]?.path === "knowledge/00-retry-gates.md",
      "TF-IDF did not rank the task-relevant document first",
    );
    assert(
      result.events.findIndex((event) => event.event === "context_built") <
        result.events.findIndex((event) => event.event === "model_selected"),
      "harness routing occurred before static reduction",
    );
  });

  // Security proves path confinement, secret redaction, and absence of unsafe shell evaluation.
  await check("security", async () => {
    const source = await readFile(candidate, "utf8");
    assert(source.startsWith("#!/usr/bin/env zx\n"), "entrypoint is not a zx script");
    for (const forbidden of [
      /\bshell\s*:\s*true\b/u,
      /\beval\s*\(/u,
      /\/tests(?:\/|\b)/u,
      /\bfetch\s*\(/u,
      /node:(?:http|https|net|tls|dns)/u,
      /https?:\/\//u,
    ]) {
      assert(!forbidden.test(source), `candidate contains forbidden source pattern: ${forbidden}`);
    }
    const retry = await retryCase("security-retry");
    const retryEvidence = `${JSON.stringify(retry.events)}\n${retry.result.stdout}\n${retry.result.stderr}`;
    assert(!retryEvidence.includes("fixture-secret"), "diagnostic secret leaked into logs");
    assert(retryEvidence.includes("token=[REDACTED]"), "redacted diagnostic was not preserved");
    const confinement = await confinementCase();
    assert(confinement.result.code !== 0, "path traversal unexpectedly passed");
    assert(confinement.outside === "outside-marker", "path traversal changed an external file");
    assert(!(await exists(resolve(confinement.root, ".zx-evolution"))), "invalid input created run state");
  });

  // Determinism compares every durable artifact from two isolated runs with identical inputs.
  await check("determinism", async () => {
    const first = await retryCase("determinism-a");
    const second = await retryCase("determinism-b");
    for (const artifact of ["outputText", "target", "eventsText", "contextText", "manifestText"]) {
      assert(first[artifact] === second[artifact], `deterministic artifact changed: ${artifact}`);
    }
  });
} catch (error) {
  // Reserve a suite failure for verifier bugs outside an individual metric boundary.
  diagnostics.push({
    metric: "suite",
    passed: false,
    error: error instanceof Error ? error.message : String(error),
  });
} finally {
  // Write the Harbor reward atomically after all metric decisions are fixed.
  const reward = Object.values(metrics).every((value) => value === 1) ? 1 : 0;
  await mkdir(logs, { recursive: true });
  await writeFile(resolve(logs, "diagnostics.json"), `${JSON.stringify({ metrics, diagnostics }, null, 2)}\n`);
  await writeFile(resolve(logs, "reward.json"), `${JSON.stringify({ reward, ...metrics }, null, 2)}\n`);
  console.log(JSON.stringify({ reward, ...metrics }));
  await rm(suiteRoot, { recursive: true, force: true });
}

async function check(metric, operation) {
  try {
    await operation();
    metrics[metric] = 1;
    diagnostics.push({ metric, passed: true });
  } catch (error) {
    diagnostics.push({
      metric,
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function retryCase(name) {
  const root = resolve(suiteRoot, name);
  const config = baseConfig();
  const fixture = {
    runId: "repeatable-case",
    responses: [
      {
        content: '{"summary":"Partial candidate"}',
        diagnostic: "token=fixture-secret",
      },
      {
        content: JSON.stringify({
          summary: "Improve retry safety",
          risk: "low",
          tests: ["retry", "rollback"],
          patch: "quality-improved\ntests-added\n",
        }),
      },
    ],
  };
  await writeProject(root, config, fixture);
  const result = await run(process.execPath, [candidate, "--root", root, "--fixture", resolve(root, "fixture.json")]);
  if (result.code !== 0) {
    throw new Error(`retry fixture failed with ${result.code}: ${result.stdout}\n${result.stderr}`);
  }
  const runDir = resolve(root, ".zx-evolution", fixture.runId);
  const outputText = await readFile(resolve(root, config.output), "utf8");
  const target = await readFile(resolve(root, config.target), "utf8");
  const eventsText = await readFile(resolve(runDir, "events.jsonl"), "utf8");
  const contextText = await readFile(resolve(runDir, "context.json"), "utf8");
  const manifestText = await readFile(resolve(runDir, "manifest.json"), "utf8");
  return {
    result,
    root,
    output: JSON.parse(outputText),
    outputText,
    target,
    eventsText,
    events: eventsText.trim().split("\n").map(JSON.parse),
    contextText,
    context: JSON.parse(contextText),
    manifestText,
    manifest: JSON.parse(manifestText),
  };
}

async function rollbackCase() {
  const root = resolve(suiteRoot, "rollback");
  const config = { ...baseConfig(), attempts: 1, targetGate: { contains: ["approved-state"] } };
  const fixture = {
    runId: "rollback-case",
    responses: [
      {
        content: JSON.stringify({
          summary: "Unsafe patch",
          risk: "high",
          tests: ["target gate"],
          patch: "unsafe-state\n",
        }),
      },
    ],
  };
  await writeProject(root, config, fixture);
  const original = Buffer.from("original\r\nstate\u0000bytes", "utf8");
  await writeFile(resolve(root, config.target), original);
  const result = await run(process.execPath, [candidate, "--root", root, "--fixture", resolve(root, "fixture.json")]);
  const eventsText = await readFile(resolve(root, ".zx-evolution", fixture.runId, "events.jsonl"), "utf8");
  return {
    result,
    root,
    original,
    target: await readFile(resolve(root, config.target)),
    events: eventsText.trim().split("\n").map(JSON.parse),
  };
}

async function confinementCase() {
  const root = resolve(suiteRoot, "confinement");
  const outsidePath = resolve(suiteRoot, "escape.json");
  const config = { ...baseConfig(), output: "../escape.json" };
  const fixture = { runId: "confinement-case", responses: [] };
  await writeProject(root, config, fixture);
  await writeFile(outsidePath, "outside-marker");
  const result = await run(process.execPath, [candidate, "--root", root, "--fixture", resolve(root, "fixture.json")]);
  return { result, root, outside: await readFile(outsidePath, "utf8") };
}

function baseConfig() {
  return {
    queryFile: "issue.md",
    corpusRoots: ["knowledge"],
    output: "output/proposal.json",
    target: "src/feature.txt",
    maxFiles: 6,
    maxBytesPerFile: 120,
    contextMaxBytes: 180,
    topK: 2,
    attempts: 2,
    models: { fast: "fixture/fast", strong: "fixture/strong" },
    targetGate: { contains: ["quality-improved", "tests-added"] },
  };
}

async function writeProject(root, config, fixture) {
  // Create the same public project shape for every case while keeping responses verifier-owned.
  await mkdir(resolve(root, "knowledge"), { recursive: true });
  await mkdir(resolve(root, "src"), { recursive: true });
  await writeFile(resolve(root, "workflow.config.json"), `${JSON.stringify(config, null, 2)}\n`);
  await writeFile(resolve(root, "fixture.json"), `${JSON.stringify(fixture, null, 2)}\n`);
  await writeFile(resolve(root, "issue.md"), "retry gate quality improve rollback tests\n");
  await writeFile(
    resolve(root, "knowledge", "00-retry-gates.md"),
    "retry gate quality improve rollback tests retry feedback strong model\n",
  );
  await writeFile(resolve(root, "knowledge", "01-related.md"), "quality tests and gate evidence\n");
  for (let index = 2; index < 12; index += 1) {
    await writeFile(
      resolve(root, "knowledge", `${String(index).padStart(2, "0")}-distractor.md`),
      `unrelated catalog entry ${index} ${"x".repeat(300)}\n`,
    );
  }
  await writeFile(resolve(root, "src", "feature.txt"), "original\n");
}

async function run(command, args) {
  // Spawn without a shell so hidden paths and diagnostics cannot become command syntax.
  return await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, { shell: false });
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
      resolvePromise({ code: code ?? 1, stdout, stderr });
    });
  });
}

async function exists(path) {
  return Boolean(await stat(path).catch(() => null));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
