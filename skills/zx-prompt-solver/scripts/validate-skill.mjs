#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const skillDir = fileURLToPath(new URL("..", import.meta.url));
const repoRoot = resolve(skillDir, "..", "..");
const temporaryParent = resolve(repoRoot, ".tmp");
await mkdir(temporaryParent, { recursive: true });
const temporaryRoot = await mkdtemp(resolve(temporaryParent, "zx-prompt-solver-validation-"));

try {
  // Validate discovery metadata before importing Harbor or spending provider tokens.
  const skillText = await readFile(resolve(skillDir, "SKILL.md"), "utf8");
  const frontmatter = skillText.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!frontmatter) throw new Error("SKILL.md frontmatter is missing");
  const keys = frontmatter[1]
    .split(/\r?\n/)
    .filter((line) => /^[a-z][a-z0-9_-]*:/.test(line))
    .map((line) => line.split(":", 1)[0]);
  if (keys.join(",") !== "name,description" || !frontmatter[1].includes("name: zx-prompt-solver")) {
    throw new Error("SKILL.md frontmatter must contain only the canonical name and description");
  }
  const openaiYaml = await readFile(resolve(skillDir, "agents", "openai.yaml"), "utf8");
  for (const required of ["display_name:", "short_description:", "default_prompt:", "$zx-prompt-solver"]) {
    if (!openaiYaml.includes(required)) throw new Error(`agents/openai.yaml is missing ${required}`);
  }

  // Check that the fixed model contract states every prompt-only and script-only invariant.
  const contract = await readFile(resolve(skillDir, "references", "generator-contract.md"), "utf8");
  for (const required of [
    "only task-specific evidence",
    "Return exactly one JSON object",
    "Return JavaScript, never TypeScript",
    "#!/usr/bin/env zx",
    "must not access `/tests`, `/solution`, `/logs`",
    "must not make another inference call",
  ]) {
    if (!contract.includes(required)) throw new Error(`generator contract is missing ${required}`);
  }

  // Verify every publishable guidance body is digest-bound before routing can expose it.
  const solverRoot = resolve(skillDir, "references", "solver-skills");
  const catalog = JSON.parse(await readFile(resolve(solverRoot, "catalog.json"), "utf8"));
  if (catalog.version !== 1 || catalog.skills?.length !== 3) {
    throw new Error("solver skill catalog must contain three reviewed entries");
  }
  const entries = new Map(catalog.skills.map((entry) => [entry.name, entry]));
  for (const entry of catalog.skills) {
    const body = await readFile(resolve(solverRoot, entry.path));
    const digest = createHash("sha256").update(body).digest("hex");
    if (digest !== entry.sha256) throw new Error(`solver guidance digest changed: ${entry.name}`);
  }
  const entry = entries.get("compact-topic-workflow-runtime");
  const logEntry = entries.get("log-summary-runtime");
  const auditEntry = entries.get("security-audit-runtime");
  if (!entry || !logEntry || !auditEntry) throw new Error("solver skill catalog entries are incomplete");
  const topicRoot = resolve(solverRoot, "compact-topic-workflow-runtime");
  const topicSkill = await readFile(resolve(topicRoot, "SKILL.md"));
  const topicDigest = createHash("sha256").update(topicSkill).digest("hex");
  if (topicDigest !== entry.sha256) throw new Error("topic runtime skill digest changed");
  const topicText = topicSkill.toString("utf8");
  for (const required of [
    "process.env.ZX_PROMPT_SKILL_ROOT",
    "references/solver-skills/compact-topic-workflow-runtime/scripts/install.mjs",
    "Return only these exact compact artifacts",
  ]) {
    if (!topicText.includes(required)) throw new Error(`topic runtime skill is missing ${required}`);
  }
  const auditText = await readFile(resolve(solverRoot, auditEntry.path), "utf8");
  for (const required of [
    "one compact wrapper",
    "process.env.ZX_PROMPT_SKILL_ROOT",
    "references/solver-skills/security-audit-runtime/scripts/audit.mjs",
    "generated bundle still contains one script",
  ]) {
    if (!auditText.includes(required)) throw new Error(`security audit runtime is missing ${required}`);
  }
  const auditHelper = resolve(solverRoot, "security-audit-runtime", "scripts", "audit.mjs");
  const auditHelperBytes = await readFile(auditHelper);
  const auditHelperDigest = createHash("sha256").update(auditHelperBytes).digest("hex");
  if (auditHelperDigest !== "f11a3e6fc0eb206a2c6db3e652f133aebdb3a4fcd17a8990f5551a92f0813326") {
    throw new Error("security audit runtime digest changed");
  }
  if (auditHelperBytes.length > 2500) throw new Error("security audit runtime exceeds its size budget");
  await run(process.execPath, ["--check", auditHelper], repoRoot);
  const logText = await readFile(resolve(solverRoot, logEntry.path), "utf8");
  for (const required of [
    "one compact wrapper",
    "process.env.ZX_PROMPT_SKILL_ROOT",
    "references/solver-skills/log-summary-runtime/scripts/summarize.mjs",
    "generated bundle still contains one script",
  ]) {
    if (!logText.includes(required)) throw new Error(`log summary runtime is missing ${required}`);
  }
  const logHelper = resolve(solverRoot, "log-summary-runtime", "scripts", "summarize.mjs");
  const logHelperBytes = await readFile(logHelper);
  const logHelperDigest = createHash("sha256").update(logHelperBytes).digest("hex");
  if (logHelperDigest !== "fc51b924e158394f329288734e2700e8d061788e548aca94e634d745417bd622") {
    throw new Error("log summary runtime digest changed");
  }
  if (logHelperBytes.length > 2500) throw new Error("log summary runtime exceeds its size budget");
  await run(process.execPath, ["--check", logHelper], repoRoot);
  const topicFiles = new Map([
    ["command-runtime.mjs", "73df5351e481775cd6703ba43d5a386776e069b5bc0921b0da0defff31984b70"],
    ["scaffold-topic-knowledge.mjs", "81416e027fb218bd26cb82dd4d625defa2b430d7b16f9abea2e37cbd3751b0be"],
    ["topic-runtime.mjs", "efb814db3e2f455974dc719b8fdbc7c844de8d76f3b451ca4b95068825774932"],
  ]);
  for (const [name, digest] of topicFiles) {
    const path = resolve(topicRoot, "scripts", name);
    const actual = createHash("sha256").update(await readFile(path)).digest("hex");
    if (actual !== digest) throw new Error(`topic runtime digest changed: ${name}`);
    await run(process.execPath, ["--check", path], repoRoot);
  }
  await run(process.execPath, ["--check", resolve(topicRoot, "scripts", "install.mjs")], repoRoot);

  // Keep external dataset intake and the one-script gate discoverable from the skill workflow.
  const datasetReference = await readFile(resolve(skillDir, "references", "evaluation-datasets.md"), "utf8");
  for (const required of [
    "## Intake Gate",
    "generated_script_count = 1",
    "Harbor 0.18.0",
    "Reject provider router aliases",
  ]) {
    if (!datasetReference.includes(required)) throw new Error(`dataset reference is missing ${required}`);
  }
  const generatedTopic = resolve(temporaryRoot, "topic-generated");
  await run(
    process.execPath,
    [resolve(topicRoot, "scripts", "scaffold-topic-knowledge.mjs"), generatedTopic],
    repoRoot,
  );
  const generatedNames = await readdir(generatedTopic);
  for (const required of ["codex.mjs", "copilot.mjs", "pi.mjs", "opencode.mjs", "topic.mjs"]) {
    if (!generatedNames.includes(required)) throw new Error(`topic scaffold is missing ${required}`);
    if ((await stat(resolve(generatedTopic, required))).size > 7000) {
      throw new Error(`topic scaffold exceeds the executable budget: ${required}`);
    }
  }

  // Import Harbor 0.18.0 and exercise exact prompt isolation, bundle rejection, and script execution.
  await run(
    "uv",
    ["run", "--with", "harbor==0.18.0", "python", resolve(skillDir, "scripts", "validate-agent.py")],
    resolve(skillDir, "scripts"),
    {
      LITELLM_LOCAL_MODEL_COST_MAP: "True",
      PYTHONDONTWRITEBYTECODE: "1",
      UV_CACHE_DIR: resolve(temporaryParent, "uv-cache"),
    },
  );

  // Parse the Harbor runner after the behavioral test so a broken delivery command also fails CI.
  await run(process.execPath, ["--check", resolve(skillDir, "scripts", "run-terminal-bench.mjs")], repoRoot);
  await run(process.execPath, [resolve(skillDir, "scripts", "run-terminal-bench.mjs"), "--self-test"], repoRoot);
  console.log("zx-prompt-solver validation passed.");
} finally {
  // Remove only this unique validation tree; shared uv cache and durable Harbor evidence remain untouched.
  await rm(temporaryRoot, { recursive: true, force: true });
}

async function run(command, args, cwd, extraEnv = {}) {
  // Pass every path and option as an argv element so validation never invokes a shell.
  return await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...extraEnv },
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
