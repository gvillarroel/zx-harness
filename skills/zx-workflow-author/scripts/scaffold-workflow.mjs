#!/usr/bin/env node

import { cp, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  compileSkill,
  MAX_STAGE_SKILL_BYTES,
  scanSkillLibrary,
} from "./inspect-skill-library.mjs";

const [planInput, targetInput, ...options] = process.argv.slice(2);
let skillLibraryInput = "";

// Parse one optional library flag explicitly so unknown options cannot silently alter scaffolding.
for (let index = 0; index < options.length; index += 1) {
  if (options[index] !== "--skill-library" || !options[index + 1] || skillLibraryInput) {
    throw new Error(`Unknown or incomplete option: ${options[index]}`);
  }
  skillLibraryInput = options[index + 1];
  index += 1;
}

// Require explicit inputs because guessing either path can overwrite unrelated project files.
if (!planInput || !targetInput) {
  throw new Error(
    "Usage: node scaffold-workflow.mjs <plan.json> <target-directory> [--skill-library <directory>]",
  );
}

const skillDir = fileURLToPath(new URL("..", import.meta.url));
const runtimeDir = resolve(skillDir, "assets", "runtime");
const planFile = resolve(planInput);
const targetDir = resolve(targetInput);
const plan = JSON.parse(await readFile(planFile, "utf8"));

// Validate the plan before creating a target so an invalid request leaves no partial scaffold.
validatePlan(plan);

// Resolve stage-selected skills from descriptions the author reviewed; runtime never guesses routing.
const selectedSkillNames = [
  ...new Set(
    plan.stages.flatMap((stage) =>
      stage.kind === "agent"
        ? [...(stage.skills ?? []), ...(stage.reviewers ?? []).flatMap((reviewer) => reviewer.skills ?? [])]
        : [],
    ),
  ),
].sort();
const skillBundles = {};
if (selectedSkillNames.length && !skillLibraryInput) {
  throw new Error("Agent contexts select skills, but --skill-library was not provided.");
}
if (skillLibraryInput) {
  const { catalog } = await scanSkillLibrary(skillLibraryInput);
  const entries = new Map(catalog.map((entry) => [entry.name, entry]));
  for (const name of selectedSkillNames) {
    const entry = entries.get(name);
    if (!entry) {
      throw new Error(`Selected skill is not in the library: ${name}`);
    }
    skillBundles[name] = await compileSkill(entry);
    if (skillBundles[name].missingReferences.length) {
      console.warn(
        `Skill ${name} has unavailable Markdown references: ${skillBundles[name].missingReferences.join(", ")}`,
      );
    }
  }
  for (const stage of plan.stages.filter((value) => value.kind === "agent")) {
    const contexts = [
      { id: stage.id, skills: stage.skills ?? [] },
      ...(stage.reviewers ?? []).map((reviewer) => ({
        id: `${stage.id}:${reviewer.id}`,
        skills: reviewer.skills ?? [],
      })),
    ];
    for (const context of contexts) {
      const bytes = context.skills.reduce(
        (total, name) => total + Buffer.byteLength(skillBundles[name].instructions),
        0,
      );
      if (bytes > MAX_STAGE_SKILL_BYTES) {
        throw new Error(`Selected skills exceed the context budget: ${context.id}`);
      }
    }
  }
}

// Refuse to merge with an existing directory because generated runtimes must be auditable.
const targetStats = await stat(targetDir).catch(() => null);
if (targetStats && !targetStats.isDirectory()) {
  throw new Error(`Target is not a directory: ${targetDir}`);
}
if (targetStats && (await readdir(targetDir)).length > 0) {
  throw new Error(`Target directory must be empty: ${targetDir}`);
}

// Copy the complete local runtime so the generated workflow has no dependency on this skill.
await mkdir(targetDir, { recursive: true });
await cp(runtimeDir, targetDir, { recursive: true });
await writeFile(resolve(targetDir, "workflow.plan.json"), `${JSON.stringify(plan, null, 2)}\n`);
if (selectedSkillNames.length) {
  // Embed only selected prompt guidance and digests so the generated workflow is standalone.
  await writeFile(
    resolve(targetDir, "workflow.skills.json"),
    `${JSON.stringify({ version: 1, skills: skillBundles }, null, 2)}\n`,
  );
}

// Keep the generated dependency surface fixed; agent CLIs are invoked through shell-free adapters.
const dependencies = {
  "@types/node": "26.1.1",
  tsx: "4.23.1",
  typescript: "7.0.2",
  zx: "8.8.5",
};

const packageJson = {
  name: plan.name,
  private: true,
  type: "module",
  scripts: {
    check: "tsc --noEmit",
    "dry-run": "zx solve.mjs --dry-run",
    start: "zx solve.mjs",
  },
  dependencies: Object.fromEntries(Object.entries(dependencies).sort(([left], [right]) => left.localeCompare(right))),
};
await writeFile(resolve(targetDir, "package.json"), `${JSON.stringify(packageJson, null, 2)}\n`);

console.log(
  `Scaffolded ${plan.name} at ${targetDir}; embedded skills: ${selectedSkillNames.join(", ") || "none"}`,
);

function validatePlan(plan) {
  if (!plan || !/^[a-z0-9][a-z0-9-]{1,62}$/.test(plan.name)) {
    throw new Error("Plan name must be a lowercase slug with 2-63 characters.");
  }
  if (
    !plan.description?.trim() ||
    !plan.agents ||
    typeof plan.agents !== "object" ||
    !Array.isArray(plan.stages) ||
    plan.stages.length === 0
  ) {
    throw new Error("Plan requires a description, agents, and at least one stage.");
  }
  if (plan.budgets !== undefined) {
    const allowed = new Set(["maxAgentCalls", "maxInputTokens", "maxOutputTokens", "maxWallTimeMs"]);
    const entries = Object.entries(plan.budgets);
    if (
      !plan.budgets ||
      typeof plan.budgets !== "object" ||
      Array.isArray(plan.budgets) ||
      entries.length === 0 ||
      entries.some(([key, amount]) => !allowed.has(key) || !Number.isSafeInteger(amount) || amount <= 0)
    ) {
      throw new Error("Plan budgets must contain only positive safe integer limits.");
    }
  }
  if (plan.controls !== undefined && (!Array.isArray(plan.controls) || plan.controls.length === 0)) {
    throw new Error("Plan controls must be a non-empty array when declared.");
  }
  const protectedPaths = [];
  const protectedPathKeys = new Set();
  for (const [index, control] of (plan.controls ?? []).entries()) {
    const keys = control && typeof control === "object" ? Object.keys(control).sort().join(",") : "";
    const normalizedPath = normalizeRepoRelativePath(control?.path);
    if (
      keys !== "path,sha256" ||
      !normalizedPath ||
      typeof control.sha256 !== "string" ||
      !/^sha256:[0-9a-f]{64}$/.test(control.sha256)
    ) {
      throw new Error(`Protected control is invalid: ${index}`);
    }
    const pathKey = normalizedPath.toLowerCase();
    if (protectedPathKeys.has(pathKey)) {
      throw new Error(`Protected control paths must be unique: ${normalizedPath}`);
    }
    protectedPathKeys.add(pathKey);
    protectedPaths.push(normalizedPath);
  }
  for (const [name, agent] of Object.entries(plan.agents)) {
    if (
      !/^[a-z0-9][a-z0-9-]{1,62}$/.test(name) ||
      !agent?.provider?.trim() ||
      !agent?.command?.trim() ||
      !Array.isArray(agent.args ?? []) ||
      !["stdin", "argument"].includes(agent.promptMode ?? "stdin") ||
      !["text", "codex-jsonl"].includes(agent.resultFormat ?? "text")
    ) {
      throw new Error(`Agent definition is incomplete: ${name}`);
    }
    if (agent.promptMode === "argument" && !(agent.args ?? []).some((argument) => argument.includes("{prompt}"))) {
      throw new Error(`Argument-mode agent must include {prompt}: ${name}`);
    }
    if (agent.resultFormat === "codex-jsonl") {
      const args = agent.args ?? [];
      const execIndex = args.indexOf("exec");
      const lastMessageIndex = args.indexOf("--output-last-message");
      if (
        agent.provider.toLowerCase() !== "codex" ||
        (agent.promptMode ?? "stdin") !== "stdin" ||
        execIndex < 0 ||
        args.filter((argument) => argument === "exec").length !== 1 ||
        args.indexOf("--json") < execIndex ||
        args.indexOf("--ephemeral") < execIndex ||
        args.indexOf("--ignore-user-config") < execIndex ||
        ["--json", "--ephemeral", "--ignore-user-config"].some(
          (flag) => args.filter((argument) => argument === flag).length !== 1,
        ) ||
        args.filter((argument) => argument === "--output-last-message").length !== 1 ||
        args.some((argument) => ["-o", "--experimental-json", "resume", "fork", "review"].includes(argument)) ||
        !args.includes("{model}") ||
        lastMessageIndex < execIndex ||
        args[lastMessageIndex + 1] !== "{lastMessage}"
      ) {
        throw new Error(
          `codex-jsonl agents require Codex, stdin, model routing, isolated config, ephemeral JSONL, and last-message evidence: ${name}`,
        );
      }
    } else if ((agent.args ?? []).some((argument) => argument.includes("{lastMessage}"))) {
      throw new Error(`Only codex-jsonl agents may use {lastMessage}: ${name}`);
    }
    rejectSecretEnv(agent.env, `agent ${name}`);
    if (agent.cwd && (isAbsolute(agent.cwd) || agent.cwd.split(/[\\/]/).includes(".."))) {
      throw new Error(`Agent cwd must be repository-relative: ${name}`);
    }
  }

  const ids = new Set();
  for (const stage of plan.stages) {
    if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(stage.id) || ids.has(stage.id)) {
      throw new Error(`Stage IDs must be unique lowercase slugs: ${stage.id}`);
    }
    ids.add(stage.id);

    const attempts = stage.attempts ?? 1;
    if (!Number.isInteger(attempts) || attempts < 1 || attempts > 4) {
      throw new Error(`Stage attempts must be 1-4: ${stage.id}`);
    }
    if (
      stage.mutates !== undefined &&
      (!Array.isArray(stage.mutates) ||
        stage.mutates.some((path) => !normalizeRepoRelativePath(path)) ||
        new Set(stage.mutates.map((path) => normalizeRepoRelativePath(path).toLowerCase())).size !==
          stage.mutates.length)
    ) {
      throw new Error(`Stage mutation paths must be unique and repository-relative: ${stage.id}`);
    }
    for (const mutation of stage.mutates ?? []) {
      const normalizedMutation = normalizeRepoRelativePath(mutation);
      if (protectedPaths.some((control) => planPathsOverlap(control, normalizedMutation))) {
        throw new Error(`Protected controls must not overlap stage mutations: ${stage.id}:${mutation}`);
      }
    }

    if (stage.skills !== undefined) {
      if (
        stage.kind !== "agent" ||
        !Array.isArray(stage.skills) ||
        stage.skills.length === 0 ||
        stage.skills.length > 3 ||
        new Set(stage.skills).size !== stage.skills.length ||
        stage.skills.some((name) => !/^[a-z0-9][a-z0-9._-]{0,127}$/.test(name))
      ) {
        throw new Error(`Stage skills must be 1-3 unique skill names on an agent stage: ${stage.id}`);
      }
    }

    if (stage.kind === "command") {
      if (!stage.command || !Array.isArray(stage.args ?? [])) {
        throw new Error(`Command stage is incomplete: ${stage.id}`);
      }
      if (stage.mutates?.length && !stage.gate) {
        throw new Error(`Mutating command requires a gate: ${stage.id}`);
      }
      rejectSecretEnv(stage.env, stage.id);
    } else if (stage.kind === "tfidf") {
      if (!stage.roots?.length || !stage.output) {
        throw new Error(`TF-IDF stage is incomplete: ${stage.id}`);
      }
    } else if (stage.kind === "agent") {
      if (
        !plan.agents[stage.agent] ||
        !stage.prompt ||
        !stage.output ||
        !stage.models?.fast ||
        !stage.models?.strong ||
        !stage.gate
      ) {
        throw new Error(`Agent stage requires agent, prompt, models, output, and gate: ${stage.id}`);
      }
      if (!Array.isArray(stage.reviewers ?? []) || (stage.reviewers ?? []).length > 3) {
        throw new Error(`Agent stage supports at most three reviewers: ${stage.id}`);
      }
      const reviewerIds = new Set();
      for (const reviewer of stage.reviewers ?? []) {
        if (
          !/^[a-z0-9][a-z0-9-]{1,62}$/.test(reviewer.id) ||
          reviewerIds.has(reviewer.id) ||
          !plan.agents[reviewer.agent] ||
          !reviewer.model?.trim() ||
          !reviewer.prompt?.trim()
        ) {
          throw new Error(`Reviewer is incomplete or duplicated: ${stage.id}:${reviewer.id}`);
        }
        reviewerIds.add(reviewer.id);
        if (
          reviewer.skills !== undefined &&
          (!Array.isArray(reviewer.skills) ||
            reviewer.skills.length === 0 ||
            reviewer.skills.length > 3 ||
            new Set(reviewer.skills).size !== reviewer.skills.length ||
            reviewer.skills.some((name) => !/^[a-z0-9][a-z0-9._-]{0,127}$/.test(name)))
        ) {
          throw new Error(`Reviewer skills must be 1-3 unique names: ${stage.id}:${reviewer.id}`);
        }
      }
    } else {
      throw new Error(`Unknown stage kind: ${stage.kind}`);
    }

    // Reject path traversal across every field that the runtime resolves against the project root.
    const paths = [
      stage.cwd,
      stage.stdout,
      stage.output,
      stage.queryFile,
      ...(stage.roots ?? []),
      ...(stage.mutates ?? []),
      ...(stage.inputs ?? []).map((input) => input.path),
      ...(stage.reviewers ?? []).flatMap((reviewer) =>
        (reviewer.inputs ?? []).map((input) => input.path),
      ),
      stage.gate?.path,
      stage.gate?.cwd,
    ].filter(Boolean);
    for (const path of paths) {
      if (isAbsolute(path) || path.split(/[\\/]/).includes("..")) {
        throw new Error(`Plan paths must be repository-relative: ${path}`);
      }
    }

    if (stage.gate?.kind === "command") {
      rejectSecretEnv(stage.gate.env, `${stage.id} gate`);
    }
  }
  if (plan.budgets?.maxInputTokens !== undefined || plan.budgets?.maxOutputTokens !== undefined) {
    const usedAgents = new Set(
      plan.stages.flatMap((stage) =>
        stage.kind === "agent"
          ? [stage.agent, ...(stage.reviewers ?? []).map((reviewer) => reviewer.agent)]
          : [],
      ),
    );
    if ([...usedAgents].some((name) => plan.agents[name].resultFormat !== "codex-jsonl")) {
      throw new Error("Token budgets require metered codex-jsonl for every used agent.");
    }
  }
}

function rejectSecretEnv(env, location) {
  for (const key of Object.keys(env ?? {})) {
    if (/(TOKEN|SECRET|PASSWORD|API_KEY)/i.test(key)) {
      throw new Error(`Do not store credential environment values in plans (${location}: ${key}).`);
    }
  }
}

function normalizeRepoRelativePath(value) {
  if (
    typeof value !== "string" ||
    !value ||
    value !== value.trim() ||
    value.includes("\0") ||
    isAbsolute(value) ||
    /^[a-zA-Z]:[\\/]/.test(value) ||
    value.startsWith("\\\\")
  ) {
    return null;
  }
  const segments = value.split(/[\\/]/);
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    return null;
  }
  return segments.join("/");
}

function planPathsOverlap(left, right) {
  const a = left.toLowerCase();
  const b = right.toLowerCase();
  return a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
}
