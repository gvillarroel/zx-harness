#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const skillDir = fileURLToPath(new URL("..", import.meta.url));
const repoRoot = resolve(skillDir, "..", "..");
const fixtureDir = resolve(skillDir, "scripts", "fixtures", "topic-knowledge");
const scaffold = resolve(skillDir, "scripts", "scaffold-topic-knowledge.mjs");
const okfSkill = process.env.TOPIC_OKF_SKILL ?? resolve(fixtureDir, "fake-okf-skill");
const fakeHarness = resolve(fixtureDir, "fake-harness.mjs");
const fakePowerShellHarness = resolve(fixtureDir, "fake-harness.ps1");
const temporaryRoot = await mkdtemp(resolve(tmpdir(), "topic-knowledge-workflow-"));
const target = resolve(temporaryRoot, "workflow");

try {
  // Scaffold a fresh standalone workflow and replace only its user-owned source configuration.
  await run(process.execPath, [scaffold, target], repoRoot);
  const presetPlan = JSON.parse(
    (
      await run(
        process.execPath,
        [
          resolve(target, "index.mjs"),
          "--root",
          target,
          "--config",
          "knowledge.config.json",
          "--dry-run",
          "--auto-harness",
        ],
        target,
      )
    ).stdout,
  );
  assert(
    presetPlan.processor.harnesses.map((harness) => harness.id).join(",") ===
      "codex,copilot,pi,opencode",
    "auto discovery did not materialize every built-in harness",
  );
  assert(
    presetPlan.processor.harnesses.every(
      (harness) => harness.preset === harness.id && harness.argumentCount > 0,
    ),
    "a built-in harness lacks its non-interactive preset",
  );
  const config = {
    topic: "agentic retrieval augmented generation",
    know: {
      command: process.execPath,
      args: [resolve(fixtureDir, "fake-know.mjs")],
    },
    sources: [
      {
        type: "arxiv-search",
        query: "{topic}",
        maxResults: 5,
        sortBy: "relevance",
        sortOrder: "descending",
      },
      {
        type: "site",
        url: "https://example.test/agentic-rag",
        sourceId: "agentic-rag-notes",
        maxDepth: 1,
        maxPages: 5,
      },
      {
        type: "github-repo",
        url: "https://github.com/example/agentic-rag",
        branches: ["main"],
      },
    ],
    processor: {
      required: true,
      autoDiscover: false,
      timeoutMs: 30_000,
      probeTimeoutMs: 5_000,
      harnesses: [
        {
          id: "fixture-missing",
          command: "topic-knowledge-harness-that-does-not-exist",
          probeArgs: ["--version"],
          args: [],
        },
        {
          id: "fixture-primary",
          preset: "codex",
          command: process.execPath,
          probeArgs: [fakeHarness, "--probe"],
          args: [
            fakeHarness,
            "--run",
            "--id",
            "fixture-primary",
            "--batch",
            "{batch}",
            "--candidate",
            "{candidate}",
            "--prompt",
            "{prompt}",
          ],
        },
        {
          id: "fixture-secondary",
          preset: "pi",
          command: process.execPath,
          probeArgs: [fakeHarness, "--probe"],
          args: [
            fakeHarness,
            "--run",
            "--id",
            "fixture-secondary",
            "--batch",
            "{batch}",
            "--candidate",
            "{candidate}",
            "--prompt-text",
            "{promptText}",
          ],
        },
        {
          id: "fixture-mutator",
          preset: "copilot",
          command: process.execPath,
          probeArgs: [fakeHarness, "--probe"],
          args: [
            fakeHarness,
            "--run",
            "--id",
            "fixture-mutator",
            "--mode",
            "mutator",
            "--batch",
            "{batch}",
            "--candidate",
            "{candidate}",
            "--prompt",
            "{prompt}",
          ],
        },
        {
          id: "fixture-stdout",
          preset: "opencode",
          command: process.execPath,
          probeArgs: [fakeHarness, "--probe"],
          stdoutPath: "derived/{runId}-fixture-stdout.md",
          args: [
            fakeHarness,
            "--run",
            "--id",
            "fixture-stdout",
            "--mode",
            "stdout",
            "--batch",
            "{batch}",
            "--candidate",
            "{candidate}",
            "--prompt",
            "{prompt}",
          ],
        },
        ...(process.platform === "win32"
          ? [
              {
                id: "fixture-powershell",
                command: fakePowerShellHarness,
                probeArgs: ["--probe", "literal; exit 77"],
                args: [],
              },
            ]
          : []),
      ],
    },
    export: true,
  };
  await writeFile(resolve(target, "knowledge.config.json"), `${JSON.stringify(config, null, 2)}\n`);
  const probeReport = JSON.parse(
    (
      await run(
        process.execPath,
        [
          resolve(target, "index.mjs"),
          "--root",
          target,
          "--config",
          "knowledge.config.json",
          "--probe-harnesses",
        ],
        target,
      )
    ).stdout,
  );
  assert(
    probeReport.harnesses.find((harness) => harness.id === "fixture-missing")?.available === false,
    "probe mode did not report an absent harness",
  );
  assert(
    ["fixture-primary", "fixture-secondary", "fixture-mutator", "fixture-stdout"].every(
      (id) => probeReport.harnesses.find((harness) => harness.id === id)?.available,
    ),
    "probe mode did not report every command adapter",
  );
  if (process.platform === "win32") {
    assert(
      probeReport.harnesses.find((harness) => harness.id === "fixture-powershell")?.available,
      "Windows PowerShell harness shim was not launchable",
    );
  }
  const commonArgs = [
    resolve(target, "index.mjs"),
    "--root",
    target,
    "--config",
    "knowledge.config.json",
    "--okf-skill",
    okfSkill,
  ];

  // The first run must publish both arXiv discoveries plus two distinct direct source types.
  await run(process.execPath, commonArgs, target, {
    TOPIC_KNOWLEDGE_RUN_ID: "run-1",
    FAKE_KNOW_REVISION: "1",
  });
  const topicDir = resolve(target, "topics", "agentic-retrieval-augmented-generation");
  const firstReport = await json(resolve(topicDir, "runs", "run-1.json"));
  assert(firstReport.newContentVersions.length === 4, "first run did not process four source documents");
  assert(firstReport.validationPassed && firstReport.published && firstReport.exported, "first run gates failed");
  assert(firstReport.processor.selected === "fixture-primary", "auto selection did not skip the missing harness");
  assert(firstReport.processor.selectedPreset === "codex", "Codex preset metadata was not preserved");
  assert(
    JSON.stringify(firstReport.processor.probes) ===
      JSON.stringify([
        { id: "fixture-missing", available: false },
        { id: "fixture-primary", available: true },
      ]),
    "auto selection probe order changed",
  );
  const firstIndex = await readFile(resolve(topicDir, "okf", "index.md"), "utf8");
  assert((firstIndex.match(/^\* \[/gm) ?? []).length === 5, "first index lacks the harness-derived concept");
  const firstStateText = await readFile(resolve(topicDir, "state.json"), "utf8");
  const firstLibraryDigests = await conceptDigests(resolve(topicDir, "okf"));

  // The second run synchronizes sources but must process and publish no unchanged files.
  await run(process.execPath, commonArgs, target, {
    TOPIC_KNOWLEDGE_RUN_ID: "run-2",
    FAKE_KNOW_REVISION: "1",
  });
  const secondReport = await json(resolve(topicDir, "runs", "run-2.json"));
  assert(secondReport.newContentVersions.length === 0, "unchanged files were reprocessed");
  assert(secondReport.validationPassed && !secondReport.published && !secondReport.exported, "empty batch mutated output");
  assert(secondReport.processor.status === "skipped-empty-batch", "empty batch invoked a harness");
  assert((await readFile(resolve(topicDir, "state.json"), "utf8")) === firstStateText, "empty batch changed state");
  assert(
    JSON.stringify(await conceptDigests(resolve(topicDir, "okf"))) === JSON.stringify(firstLibraryDigests),
    "empty batch changed published concept bytes",
  );

  // A later arXiv result must add exactly one concept while preserving every prior concept digest.
  await run(
    process.execPath,
    [...commonArgs, "--harness", "fixture-secondary"],
    target,
    {
      TOPIC_KNOWLEDGE_RUN_ID: "run-3",
      FAKE_KNOW_REVISION: "2",
    },
  );
  const thirdReport = await json(resolve(topicDir, "runs", "run-3.json"));
  assert(thirdReport.newContentVersions.length === 1, "incremental arXiv run did not isolate one new paper");
  assert(thirdReport.published && thirdReport.validationPassed, "incremental publication failed");
  assert(thirdReport.processor.selected === "fixture-secondary", "explicit harness selection was ignored");
  assert(thirdReport.processor.selectedPreset === "pi", "pi preset metadata was not preserved");
  const thirdIndex = await readFile(resolve(topicDir, "okf", "index.md"), "utf8");
  assert((thirdIndex.match(/^\* \[/gm) ?? []).length === 7, "updated index lacks the second derived concept");
  assert(thirdIndex.includes("[Incremental Knowledge Agents]"), "folded YAML title was truncated");
  const thirdDigests = await conceptDigests(resolve(topicDir, "okf"));
  for (const [path, hash] of Object.entries(firstLibraryDigests)) {
    assert(thirdDigests[path] === hash, `existing concept was rewritten: ${path}`);
  }
  assert(Object.keys((await json(resolve(topicDir, "state.json"))).processed).length === 5, "state lacks five digests");

  // A harness may use any implementation, but it cannot mutate knowledge outside the declared batch.
  const thirdStateText = await readFile(resolve(topicDir, "state.json"), "utf8");
  const rejected = await run(
    process.execPath,
    [...commonArgs, "--harness", "fixture-mutator"],
    target,
    {
      TOPIC_KNOWLEDGE_RUN_ID: "run-4",
      FAKE_KNOW_REVISION: "3",
    },
    true,
  );
  assert(rejected.code !== 0, "historical harness mutation unexpectedly passed");
  const fourthReport = await json(resolve(topicDir, "runs", "run-4.json"));
  assert(
    fourthReport.processor.status === "rejected" && fourthReport.failure.stage === "processor-isolation",
    "historical harness mutation lacks a rejected receipt",
  );
  assert((await readFile(resolve(topicDir, "state.json"), "utf8")) === thirdStateText, "rejected batch changed state");
  assert(
    JSON.stringify(await conceptDigests(resolve(topicDir, "okf"))) === JSON.stringify(thirdDigests),
    "rejected harness changed the published library",
  );
  assert(
    !(await readdir(topicDir)).some((name) => name.startsWith(".okf-candidate-")),
    "rejected harness left a candidate directory",
  );

  // The same new source remains pending and succeeds later through another configured harness.
  await run(
    process.execPath,
    [...commonArgs, "--harness", "fixture-stdout"],
    target,
    {
      TOPIC_KNOWLEDGE_RUN_ID: "run-5",
      FAKE_KNOW_REVISION: "3",
    },
  );
  const fifthReport = await json(resolve(topicDir, "runs", "run-5.json"));
  assert(fifthReport.newContentVersions.length === 1, "rejected source version was not retried");
  assert(fifthReport.processor.selected === "fixture-stdout" && fifthReport.published, "stdout recovery run failed");
  assert(fifthReport.processor.selectedPreset === "opencode", "OpenCode preset metadata was not preserved");
  const fifthIndex = await readFile(resolve(topicDir, "okf", "index.md"), "utf8");
  assert((fifthIndex.match(/^\* \[/gm) ?? []).length === 9, "recovery index has the wrong concept count");
  assert(Object.keys((await json(resolve(topicDir, "state.json"))).processed).length === 6, "state lacks six digests");

  // Optional processing remains deterministic when no harness is configured or available.
  config.processor = { required: false, harnesses: [] };
  await writeFile(resolve(target, "knowledge.config.json"), `${JSON.stringify(config, null, 2)}\n`);
  await run(process.execPath, commonArgs, target, {
    TOPIC_KNOWLEDGE_RUN_ID: "run-6",
    FAKE_KNOW_REVISION: "4",
  });
  const sixthReport = await json(resolve(topicDir, "runs", "run-6.json"));
  assert(sixthReport.newContentVersions.length === 1, "passthrough run did not isolate one new paper");
  assert(
    sixthReport.processor.status === "passthrough" && sixthReport.processor.selected === null,
    "optional processor did not use validated passthrough",
  );
  const sixthIndex = await readFile(resolve(topicDir, "okf", "index.md"), "utf8");
  assert((sixthIndex.match(/^\* \[/gm) ?? []).length === 10, "passthrough index has the wrong concept count");
  assert(Object.keys((await json(resolve(topicDir, "state.json"))).processed).length === 7, "state lacks seven digests");

  // Confirm the scaffold is portable and contains no source-skill dependency.
  for (const name of (await readdir(target)).filter((value) => value !== "knowledge.config.json")) {
    const path = resolve(target, name);
    if ((await stat(path)).isFile()) {
      assert(!(await readFile(path, "utf8")).includes("skills/zx-workflow-author"), `scaffold leaks skill path: ${name}`);
    }
  }
  console.log("topic knowledge workflow validation passed.");
} finally {
  // Remove all generated topic stores and fixture exports after the three-run proof.
  await rm(temporaryRoot, { recursive: true, force: true });
}

async function conceptDigests(root) {
  const result = {};
  const pending = [root];
  while (pending.length > 0) {
    const current = pending.pop();
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = resolve(current, entry.name);
      if (entry.isDirectory()) {
        pending.push(path);
      } else if (entry.isFile() && entry.name.endsWith(".md") && entry.name !== "index.md") {
        const relativePath = path.slice(root.length + 1).replaceAll("\\", "/");
        result[relativePath] = createHash("sha256").update(await readFile(path)).digest("hex");
      }
    }
  }
  return Object.fromEntries(Object.entries(result).sort(([left], [right]) => left.localeCompare(right)));
}

async function json(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function run(command, args, cwd, env = {}, allowFailure = false) {
  // Invoke every fixture stage without a shell to preserve the production escaping boundary.
  const result = await new Promise((resolvePromise, rejectPromise) => {
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
      resolvePromise({ code: code ?? 1, stdout, stderr });
    });
  });
  if (result.code !== 0 && !allowFailure) {
    throw new Error(`${command} exited ${result.code}\n${result.stdout}\n${result.stderr}`);
  }
  return result;
}
