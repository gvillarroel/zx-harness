#!/usr/bin/env node

import { spawn } from "node:child_process";
import { cp, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const skillDir = fileURLToPath(new URL("..", import.meta.url));
const repoRoot = resolve(skillDir, "..", "..");
const scaffoldScript = resolve(skillDir, "scripts", "scaffold-workflow.mjs");
const fixturesDir = resolve(skillDir, "scripts", "fixtures");
const temporaryRoot = await mkdtemp(resolve(tmpdir(), "zx-workflow-author-"));

try {
  // Human guides may live in docs; executable product artifacts still belong only to skills.
  for (const forbidden of ["deliverables", "evaluations", "examples", "results"]) {
    if (await stat(resolve(repoRoot, forbidden)).catch(() => null)) {
      throw new Error(`Forbidden top-level product directory exists: ${forbidden}`);
    }
  }

  // Validate the skill trigger metadata independently of any local Codex installation.
  const skillText = await readFile(resolve(skillDir, "SKILL.md"), "utf8");
  const frontmatter = skillText.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!frontmatter) {
    throw new Error("SKILL.md frontmatter is missing.");
  }
  const frontmatterKeys = frontmatter[1]
    .split(/\r?\n/)
    .filter((line) => /^[a-z][a-z0-9_-]*:/.test(line))
    .map((line) => line.split(":", 1)[0]);
  if (frontmatterKeys.join(",") !== "name,description" || !frontmatter[1].includes("name: zx-workflow-author")) {
    throw new Error("SKILL.md frontmatter must contain only name and description.");
  }

  // Check UI metadata because discovery and the default invocation must match the skill name.
  const openaiYaml = await readFile(resolve(skillDir, "agents", "openai.yaml"), "utf8");
  for (const required of ["display_name:", "short_description:", "default_prompt:", "$zx-workflow-author"]) {
    if (!openaiYaml.includes(required)) {
      throw new Error(`agents/openai.yaml is missing: ${required}`);
    }
  }

  // Scaffold both real-task probes to prove provider-specific dependencies stay minimal.
  const gcpTarget = resolve(temporaryRoot, "gcp");
  const knowledgeTarget = resolve(temporaryRoot, "knowledge");
  await run(process.execPath, [scaffoldScript, resolve(fixturesDir, "gcp-radar-coverage.json"), gcpTarget], repoRoot);
  await run(process.execPath, [scaffoldScript, resolve(fixturesDir, "knowledge-redaction.json"), knowledgeTarget], repoRoot);
  const gcpPackage = JSON.parse(await readFile(resolve(gcpTarget, "package.json"), "utf8"));
  const knowledgePackage = JSON.parse(await readFile(resolve(knowledgeTarget, "package.json"), "utf8"));
  if (!gcpPackage.dependencies["@github/copilot-sdk"] || gcpPackage.dependencies["@earendil-works/pi-ai"]) {
    throw new Error("Copilot scaffold dependencies are not minimal.");
  }
  if (!knowledgePackage.dependencies["@earendil-works/pi-ai"] || knowledgePackage.dependencies["@github/copilot-sdk"]) {
    throw new Error("pi scaffold dependencies are not minimal.");
  }

  // Install exact scaffold dependencies without lifecycle scripts, then type-check each real SDK adapter.
  for (const target of [gcpTarget, knowledgeTarget]) {
    await runNpm(target, ["install", "--ignore-scripts", "--no-audit", "--no-fund"]);
    await runNpm(target, ["run", "check"]);
  }

  // Execute a generated workflow with fixed responses to prove retry feedback and model escalation.
  const retryTarget = resolve(temporaryRoot, "retry");
  await run(process.execPath, [scaffoldScript, resolve(fixturesDir, "offline-retry.json"), retryTarget], repoRoot);
  await cp(resolve(fixturesDir, "offline-retry-responses.json"), resolve(retryTarget, "responses.json"));
  await runTsx(retryTarget, {
    ZX_WORKFLOW_HARNESS_FIXTURE: "responses.json",
    ZX_WORKFLOW_RUN_ID: "validation",
  });
  const proposal = await readFile(resolve(retryTarget, "run", "proposal.md"), "utf8");
  const retryEvents = await readFile(
    resolve(retryTarget, ".zx-workflow", "offline-retry-proof", "validation", "events.jsonl"),
    "utf8",
  );
  for (const required of [
    "APPROVED",
    '"model":"fast-fixture-model"',
    '"model":"strong-fixture-model"',
    '"event":"attempt_failed"',
    '"stage":"retry-mutation","attempt":1',
    "token=[REDACTED]",
  ]) {
    if (!`${proposal}\n${retryEvents}`.includes(required)) {
      throw new Error(`Offline retry proof is missing: ${required}`);
    }
  }
  if (retryEvents.includes("fixture-secret")) {
    throw new Error("Run log contains an unredacted diagnostic secret.");
  }
  if ((await readFile(resolve(retryTarget, "protected.txt"), "utf8")) !== "accepted") {
    throw new Error("Mutation retry did not restart from its original snapshot.");
  }
  if ((await readFile(resolve(retryTarget, "feature.txt"), "utf8")) !== "quality-improved\n") {
    throw new Error("Gated harness output was not applied by the deterministic feature stage.");
  }

  // Force a terminal gate failure and prove the declared mutation returns to its original bytes.
  const rollbackTarget = resolve(temporaryRoot, "rollback");
  await run(process.execPath, [scaffoldScript, resolve(fixturesDir, "offline-rollback.json"), rollbackTarget], repoRoot);
  await writeFile(resolve(rollbackTarget, "protected.txt"), "original");
  const rollbackResult = await runTsx(rollbackTarget, { ZX_WORKFLOW_RUN_ID: "validation" }, true);
  if (rollbackResult.code === 0) {
    throw new Error("Rollback fixture unexpectedly passed.");
  }
  if ((await readFile(resolve(rollbackTarget, "protected.txt"), "utf8")) !== "original") {
    throw new Error("Rollback did not restore protected.txt.");
  }

  // Ensure generated runtimes are standalone and never reach back into this repository.
  for (const target of [gcpTarget, knowledgeTarget, retryTarget, rollbackTarget]) {
    const generatedFiles = await readdir(target);
    for (const name of generatedFiles.filter((value) => !value.startsWith("."))) {
      const path = resolve(target, name);
      if ((await stat(path)).isFile()) {
        const content = await readFile(path, "utf8");
        if (content.includes("skills/zx-workflow-author")) {
          throw new Error(`Generated runtime references the source skill: ${name}`);
        }
      }
    }
  }

  // Exercise the dedicated arXiv and multi-source OKF workflow across new, unchanged, and later batches.
  await run(process.execPath, [resolve(skillDir, "scripts", "validate-topic-knowledge.mjs")], repoRoot);

  console.log("zx-workflow-author validation passed.");
} finally {
  // Remove isolated fixtures so validation never pollutes the repository or a user's target.
  await rm(temporaryRoot, { recursive: true, force: true });
}

async function runTsx(cwd, env, allowFailure = false) {
  // Invoke npm's JavaScript entrypoint directly so Windows validation also avoids shell parsing.
  const bundledNpx = resolve(process.execPath, "..", "node_modules", "npm", "bin", "npx-cli.js");
  if (await stat(bundledNpx).catch(() => null)) {
    return await run(process.execPath, [bundledNpx, "--yes", "tsx@4.23.1", "workflow.ts"], cwd, env, allowFailure);
  }
  return await run("npx", ["--yes", "tsx@4.23.1", "workflow.ts"], cwd, env, allowFailure);
}

async function runNpm(cwd, args) {
  // Call npm through Node so Windows never needs a shell to execute npm.cmd.
  const bundledNpm = resolve(process.execPath, "..", "node_modules", "npm", "bin", "npm-cli.js");
  if (await stat(bundledNpm).catch(() => null)) {
    return await run(process.execPath, [bundledNpm, ...args], cwd);
  }
  return await run("npm", args, cwd);
}

async function run(command, args, cwd, env = {}, allowFailure = false) {
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
    throw new Error(`${command} failed with ${result.code}\n${result.stdout}\n${result.stderr}`);
  }
  return result;
}
