#!/usr/bin/env node

import { copyFile, lstat, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const PLAN_LIMITS = Object.freeze({
  maxPlanBytes: 2_000_000,
  maxCriteria: 32,
  maxCriterionDescriptionBytes: 1_000,
  maxGateDepth: 8,
  maxGateLeaves: 64,
  maxStages: 128,
  maxAgents: 32,
  maxReviewers: 3,
  maxInputs: 32,
  maxInputBytes: 1_000_000,
  defaultInputBytes: 12_000,
  maxContextBytes: 2_000_000,
  maxPromptComponentBytes: 1_000_000,
  maxCandidateBytes: 1_000_000,
  maxFeedbackBytes: 12_000,
  maxArgv: 256,
  maxArgumentBytes: 256_000,
  maxEnvironmentEntries: 128,
  maxArtifactSinks: 16,
  maxArtifactSinkBytesPerCall: 1_000_000,
  maxArtifactSinkBytesPerRun: 16_000_000,
  maxTimeoutMs: 86_400_000,
  maxTfidfRoots: 32,
  maxTfidfExtensions: 128,
  maxTfidfLimit: 1_000,
  maxTfidfFiles: 100_000,
  maxTfidfBytesPerFile: 1_000_000,
  maxJsonlBytes: 16_000_000,
  maxJsonlLineBytes: 1_000_000,
  maxJsonlEvents: 100_000,
  maxJsonlEventTypes: 256,
});

const RUNTIME_FILES = Object.freeze(["solve.mjs", "tsconfig.json", "workflow.ts"]);
// Bound generated roots without constraining valid plans or multi-context skill bundles.
const MAX_GENERATED_ROOT_FILE_BYTES = 64_000_000;

async function scaffoldWorkflow() {
const { compileSkill, MAX_STAGE_SKILL_BYTES, scanSkillLibrary } = await import("./inspect-skill-library.mjs");
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

const scaffoldSourcePath = fileURLToPath(import.meta.url);
const skillDir = fileURLToPath(new URL("..", import.meta.url));
const runtimeDir = resolve(skillDir, "assets", "runtime");
const planFile = resolve(planInput);
const targetDir = resolve(targetInput);
const planBytes = await readFile(planFile);
if (planBytes.length > PLAN_LIMITS.maxPlanBytes) {
  throw new Error(`Plan exceeds ${PLAN_LIMITS.maxPlanBytes} bytes.`);
}
const plan = JSON.parse(planBytes.toString("utf8"));

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

// Fail before target creation if authored runtime assets drift from the closed public ABI.
const runtimeEntries = await readdir(runtimeDir, { withFileTypes: true });
if (
  runtimeEntries.some((entry) => !entry.isFile()) ||
  runtimeEntries.map((entry) => entry.name).sort().join(",") !== [...RUNTIME_FILES].sort().join(",")
) {
  throw new Error(`Runtime asset inventory must contain only: ${RUNTIME_FILES.join(", ")}`);
}
for (const name of RUNTIME_FILES) {
  const source = await lstat(resolve(runtimeDir, name));
  if (!source.isFile() || source.isSymbolicLink() || source.nlink !== 1 || source.size > MAX_GENERATED_ROOT_FILE_BYTES) {
    throw new Error(`Runtime asset must be one bounded ordinary file: ${name}`);
  }
}

// Refuse to merge with an existing directory because generated runtimes must be auditable.
const targetStats = await lstat(targetDir).catch(() => null);
if (targetStats && !targetStats.isDirectory()) {
  throw new Error(`Target is not a directory: ${targetDir}`);
}
if (targetStats && (await readdir(targetDir)).length > 0) {
  throw new Error(`Target directory must be empty: ${targetDir}`);
}

// Copy only the preflighted runtime ABI so ambient assets cannot leak into generated workflows.
await mkdir(targetDir, { recursive: true });
for (const name of RUNTIME_FILES) {
  await copyFile(resolve(runtimeDir, name), resolve(targetDir, name));
}
// Embed this exact module in workflow.ts so schema parity does not require a public sidecar file.
const runtimePath = resolve(targetDir, "workflow.ts");
const runtimeSource = await readFile(runtimePath, "utf8");
const validatorMarker = '"__ZX_WORKFLOW_PLAN_VALIDATOR_DATA_URL__"';
if (runtimeSource.split(validatorMarker).length !== 2) {
  throw new Error("Runtime validator marker is missing or duplicated.");
}
const scaffoldSource = await readFile(scaffoldSourcePath);
const validatorDataUrl = `data:text/javascript;base64,${scaffoldSource.toString("base64")}`;
await writeFile(runtimePath, runtimeSource.replace(validatorMarker, JSON.stringify(validatorDataUrl)));
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

// Verify the feature-derived manifest before claiming a successful standalone scaffold.
const expectedFiles = [
  ...RUNTIME_FILES,
  "workflow.plan.json",
  "package.json",
  ...(selectedSkillNames.length ? ["workflow.skills.json"] : []),
].sort();
const outputEntries = await readdir(targetDir, { withFileTypes: true });
if (
  outputEntries.some((entry) => !entry.isFile()) ||
  outputEntries.map((entry) => entry.name).sort().join(",") !== expectedFiles.join(",")
) {
  throw new Error(`Generated root inventory differs from its closed manifest: ${expectedFiles.join(", ")}`);
}
for (const name of expectedFiles) {
  const output = await lstat(resolve(targetDir, name));
  if (!output.isFile() || output.isSymbolicLink() || output.nlink !== 1 || output.size > MAX_GENERATED_ROOT_FILE_BYTES) {
    throw new Error(`Generated root entry must be one bounded ordinary file: ${name}`);
  }
}

console.log(
  `Scaffolded ${plan.name} at ${targetDir}; embedded skills: ${selectedSkillNames.join(", ") || "none"}`,
);
}

export function validatePlan(plan) {
  assertRecordKeys(plan, ["agents", "budgets", "controls", "criteria", "description", "family", "name", "stages"], "Plan");
  if (!plan || !/^[a-z0-9][a-z0-9-]{1,62}$/.test(plan.name)) {
    throw new Error("Plan name must be a lowercase slug with 2-63 characters.");
  }
  if (plan.family !== undefined && !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(plan.family)) {
    throw new Error("Plan family must be a lowercase slug with 1-63 characters.");
  }
  if (
    !plan.description?.trim() ||
    !isRecord(plan.agents) ||
    !Array.isArray(plan.stages) ||
    plan.stages.length === 0 ||
    plan.stages.length > PLAN_LIMITS.maxStages ||
    Object.keys(plan.agents).length > PLAN_LIMITS.maxAgents ||
    Buffer.byteLength(plan.description) > PLAN_LIMITS.maxPromptComponentBytes
  ) {
    throw new Error("Plan requires a description, agents, and at least one stage.");
  }
  const criteriaMode = plan.criteria !== undefined;
  const criterionIds = new Set();
  const coveredCriteria = new Set();
  if (criteriaMode) {
    if (!Array.isArray(plan.criteria) || plan.criteria.length < 1 || plan.criteria.length > PLAN_LIMITS.maxCriteria) {
      throw new Error(`Plan criteria must contain 1-${PLAN_LIMITS.maxCriteria} entries.`);
    }
    for (const [index, criterion] of plan.criteria.entries()) {
      const keys = criterion && typeof criterion === "object" ? Object.keys(criterion).sort().join(",") : "";
      if (
        keys !== "description,id" ||
        !isAcceptanceSlug(criterion?.id) ||
        criterionIds.has(criterion.id) ||
        typeof criterion.description !== "string" ||
        !criterion.description.trim() ||
        Buffer.byteLength(criterion.description) > PLAN_LIMITS.maxCriterionDescriptionBytes
      ) {
        throw new Error(`Acceptance criterion is invalid or duplicated: ${index}`);
      }
      criterionIds.add(criterion.id);
    }
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
    assertRecordKeys(
      agent,
      ["args", "authEnv", "command", "cwd", "env", "promptMode", "provider", "resultFormat", "timeoutMs"],
      `Agent ${name}`,
    );
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
    validateArgv(agent.args ?? [], `agent ${name}`, ["{lastMessage}", "{model}", "{prompt}", "{root}", "{runDir}"]);
    validateEnvironment(agent.env, `agent ${name}`, ["{model}", "{root}", "{runDir}"]);
    inspectArtifactSinks(agent.env, `agent ${name}`);
    validateAuthEnvironment(agent.authEnv, `agent ${name}`);
    validateOptionalTimeout(agent.timeoutMs, `agent ${name}`);
    if (agent.cwd !== undefined && !normalizeRepoRelativePath(agent.cwd)) {
      throw new Error(`Agent cwd must be repository-relative: ${name}`);
    }
    const promptOccurrences = countPlaceholder(agent.args ?? [], "{prompt}");
    if ((agent.promptMode ?? "stdin") === "argument" && promptOccurrences !== 1) {
      throw new Error(`Argument-mode agent must include {prompt}: ${name}`);
    }
    if ((agent.promptMode ?? "stdin") === "stdin" && promptOccurrences !== 0) {
      throw new Error(`Stdin-mode agent must not include {prompt} in argv: ${name}`);
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
  }

  const ids = new Set();
  for (const stage of plan.stages) {
    const commonKeys = ["attempts", "gate", "id", "kind", "mutates"];
    const stageKeys =
      stage?.kind === "command"
        ? [...commonKeys, "args", "command", "cwd", "env", "stdout", "timeoutMs"]
        : stage?.kind === "tfidf"
          ? [
              ...commonKeys,
              "extensions",
              "limit",
              "maxBytesPerFile",
              "maxFiles",
              "output",
              "query",
              "queryFile",
              "roots",
            ]
          : stage?.kind === "agent"
            ? [
                ...commonKeys,
                "agent",
                "inputs",
                "maxContextBytes",
                "models",
                "output",
                "prompt",
                "reviewers",
                "skills",
              ]
            : commonKeys;
    assertRecordKeys(stage, stageKeys, `Stage ${String(stage?.id ?? "unknown")}`);
    if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(stage.id) || ids.has(stage.id)) {
      throw new Error(`Stage IDs must be unique lowercase slugs: ${stage.id}`);
    }
    ids.add(stage.id);
    const gateRouteIds = new Set();
    const gateLeaves = stage.gate
      ? inspectGate(stage.gate, stage.id, criteriaMode, criterionIds, gateRouteIds)
      : [];
    for (const { gate } of gateLeaves) {
      for (const criterionId of gate.covers ?? []) {
        coveredCriteria.add(criterionId);
      }
    }

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
      if (typeof stage.command !== "string" || !stage.command.trim() || !Array.isArray(stage.args ?? [])) {
        throw new Error(`Command stage is incomplete: ${stage.id}`);
      }
      validateArgv(stage.args ?? [], stage.id, ["{problem}", "{root}", "{runDir}"]);
      validateEnvironment(stage.env, stage.id, []);
      validateOptionalTimeout(stage.timeoutMs, stage.id);
      if (stage.mutates?.length && !stage.gate) {
        throw new Error(`Mutating command requires a gate: ${stage.id}`);
      }
    } else if (stage.kind === "tfidf") {
      if (
        !Array.isArray(stage.roots) ||
        !stage.roots.length ||
        stage.roots.length > PLAN_LIMITS.maxTfidfRoots ||
        stage.roots.some((path) => !normalizeRepoRelativePath(path)) ||
        !normalizeRepoRelativePath(stage.output) ||
        (stage.query !== undefined && (typeof stage.query !== "string" || Buffer.byteLength(stage.query) > PLAN_LIMITS.maxPromptComponentBytes)) ||
        (stage.queryFile !== undefined && !normalizeRepoRelativePath(stage.queryFile)) ||
        (stage.query !== undefined && stage.queryFile !== undefined) ||
        (stage.extensions !== undefined &&
          (!Array.isArray(stage.extensions) ||
            stage.extensions.length > PLAN_LIMITS.maxTfidfExtensions ||
            stage.extensions.some((value) => typeof value !== "string" || !/^\.[a-zA-Z0-9_-]{1,31}$/.test(value)))) ||
        !validOptionalCap(stage.limit, PLAN_LIMITS.maxTfidfLimit) ||
        !validOptionalCap(stage.maxFiles, PLAN_LIMITS.maxTfidfFiles) ||
        !validOptionalCap(stage.maxBytesPerFile, PLAN_LIMITS.maxTfidfBytesPerFile)
      ) {
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
      assertRecordKeys(stage.models, ["fast", "strong"], `Models ${stage.id}`);
      if (
        typeof stage.prompt !== "string" ||
        !stage.prompt.trim() ||
        Buffer.byteLength(stage.prompt) > PLAN_LIMITS.maxPromptComponentBytes ||
        !normalizeRepoRelativePath(stage.output) ||
        typeof stage.models.fast !== "string" ||
        !stage.models.fast.trim() ||
        typeof stage.models.strong !== "string" ||
        !stage.models.strong.trim()
      ) {
        throw new Error(`Agent stage has invalid prompt, models, or output: ${stage.id}`);
      }
      if (!Array.isArray(stage.reviewers ?? []) || (stage.reviewers ?? []).length > PLAN_LIMITS.maxReviewers) {
        throw new Error(`Agent stage supports at most three reviewers: ${stage.id}`);
      }
      if (
        (criteriaMode && stage.maxContextBytes === undefined) ||
        !validOptionalCap(stage.maxContextBytes, PLAN_LIMITS.maxContextBytes)
      ) {
        throw new Error(`Agent maxContextBytes must be a positive safe integer: ${stage.id}`);
      }
      validateInputReferences(stage.inputs ?? [], `${stage.id} producer inputs`);
      const reviewerIds = new Set();
      for (const reviewer of stage.reviewers ?? []) {
        assertRecordKeys(
          reviewer,
          ["agent", "covers", "id", "inheritProducerInputs", "inputs", "maxContextBytes", "model", "prompt", "skills"],
          `Reviewer ${stage.id}:${String(reviewer?.id ?? "unknown")}`,
        );
        if (
          !/^[a-z0-9][a-z0-9-]{1,62}$/.test(reviewer.id) ||
          reviewerIds.has(reviewer.id) ||
          !plan.agents[reviewer.agent] ||
          !reviewer.model?.trim() ||
          !reviewer.prompt?.trim() ||
          Buffer.byteLength(reviewer.prompt) > PLAN_LIMITS.maxPromptComponentBytes
        ) {
          throw new Error(`Reviewer is incomplete or duplicated: ${stage.id}:${reviewer.id}`);
        }
        reviewerIds.add(reviewer.id);
        if (
          (criteriaMode && reviewer.maxContextBytes === undefined) ||
          !validOptionalCap(reviewer.maxContextBytes, PLAN_LIMITS.maxContextBytes)
        ) {
          throw new Error(`Reviewer maxContextBytes must be a positive safe integer: ${stage.id}:${reviewer.id}`);
        }
        if (criteriaMode) {
          if (!Object.hasOwn(reviewer, "covers") || !Object.hasOwn(reviewer, "inputs")) {
            throw new Error(`Criteria-aware reviewer requires explicit covers and inputs: ${stage.id}:${reviewer.id}`);
          }
          if (
            Object.hasOwn(reviewer, "inheritProducerInputs") &&
            reviewer.inheritProducerInputs !== false
          ) {
            throw new Error(`Criteria-aware reviewer cannot inherit producer inputs: ${stage.id}:${reviewer.id}`);
          }
          validateCovers(reviewer.covers, `${stage.id}:${reviewer.id}`, criterionIds);
          validateInputReferences(reviewer.inputs, `${stage.id}:${reviewer.id} inputs`);
          for (const criterionId of reviewer.covers ?? []) {
            coveredCriteria.add(criterionId);
          }
        } else if (Object.hasOwn(reviewer, "covers")) {
          throw new Error(`Reviewer covers require plan criteria: ${stage.id}:${reviewer.id}`);
        } else if (Object.hasOwn(reviewer, "inheritProducerInputs")) {
          throw new Error(`inheritProducerInputs requires plan criteria: ${stage.id}:${reviewer.id}`);
        }
        if (!criteriaMode) {
          validateInputReferences(reviewer.inputs ?? [], `${stage.id}:${reviewer.id} inputs`);
        }
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

    // Reject every non-canonical path through the same cross-platform parser used at runtime.
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
      ...gateLeaves.flatMap(({ gate }) => [gate.path, gate.cwd]),
    ].filter(Boolean);
    for (const path of paths) {
      if (!normalizeRepoRelativePath(path)) {
        throw new Error(`Plan paths must be repository-relative: ${path}`);
      }
    }

  }
  if (criteriaMode) {
    const uncovered = [...criterionIds].filter((criterionId) => !coveredCriteria.has(criterionId));
    if (uncovered.length) {
      throw new Error(`Acceptance criteria lack a gate or reviewer route: ${uncovered.join(", ")}`);
    }
  }
  const happyPathAgentCalls = minimumAgentCalls(plan);
  if (plan.budgets?.maxAgentCalls !== undefined && plan.budgets.maxAgentCalls < happyPathAgentCalls) {
    throw new Error(
      `maxAgentCalls cannot complete the happy path: configured=${plan.budgets.maxAgentCalls}, required=${happyPathAgentCalls}`,
    );
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

export function inspectGate(rawGate, stageId, criteriaMode, criterionIds, explicitRouteIds = new Set()) {
  // Flatten the bounded tree deterministically so nested leaves cannot bypass plan validation.
  const pending = [{ gate: rawGate, routeId: `${stageId}.gate`, depth: 1 }];
  const leaves = [];
  while (pending.length) {
    const current = pending.pop();
    const gate = current.gate;
    if (!gate || typeof gate !== "object" || Array.isArray(gate) || typeof gate.kind !== "string") {
      throw new Error(`Gate is invalid: ${current.routeId}`);
    }
    if (current.depth > PLAN_LIMITS.maxGateDepth) {
      throw new Error(`Gate tree exceeds depth ${PLAN_LIMITS.maxGateDepth}: ${current.routeId}`);
    }
    if (gate.kind === "all") {
      if (Object.hasOwn(gate, "id")) {
        throw new Error(`All gate may not declare an ID: ${current.routeId}`);
      }
      if (Object.hasOwn(gate, "covers")) {
        throw new Error(`All gate may not declare covers: ${current.routeId}`);
      }
      assertRecordKeys(gate, ["gates", "kind"], `All gate ${current.routeId}`);
      if (!Array.isArray(gate.gates) || gate.gates.length === 0) {
        throw new Error(`All gate must be non-empty within depth ${MAX_GATE_DEPTH}: ${current.routeId}`);
      }
      for (let index = gate.gates.length - 1; index >= 0; index -= 1) {
        pending.push({ gate: gate.gates[index], routeId: `${current.routeId}.${index}`, depth: current.depth + 1 });
      }
      continue;
    }
    if (!["contains", "json", "command"].includes(gate.kind)) {
      throw new Error(`Unknown gate kind: ${current.routeId}:${String(gate.kind)}`);
    }
    assertRecordKeys(
      gate,
      gate.kind === "contains"
        ? ["covers", "id", "kind", "path", "values"]
        : gate.kind === "json"
          ? ["covers", "id", "kind", "path", "required"]
          : ["args", "command", "covers", "cwd", "env", "id", "kind", "timeoutMs"],
      `Leaf gate ${current.routeId}`,
    );
    let stableRouteId = current.routeId;
    if (Object.hasOwn(gate, "id")) {
      if (!isAcceptanceSlug(gate.id) || explicitRouteIds.has(gate.id)) {
        throw new Error(`Leaf gate ID is invalid or duplicated: ${current.routeId}`);
      }
      explicitRouteIds.add(gate.id);
      stableRouteId = gate.id;
    }
    if (criteriaMode) {
      validateCovers(gate.covers, stableRouteId, criterionIds);
    } else if (Object.hasOwn(gate, "covers")) {
      throw new Error(`Gate covers require plan criteria: ${current.routeId}`);
    }
    if (
      gate.kind === "contains" &&
      (!Array.isArray(gate.values) ||
        (criteriaMode && gate.values.length === 0) ||
        gate.values.length > PLAN_LIMITS.maxInputs ||
        gate.values.some(
          (value) => typeof value !== "string" || Buffer.byteLength(value) > PLAN_LIMITS.maxPromptComponentBytes,
        ))
    ) {
      throw new Error(`Contains gate requires non-empty string values: ${current.routeId}`);
    }
    if (
      gate.kind === "json" &&
      (!Array.isArray(gate.required) ||
        (criteriaMode && gate.required.length === 0) ||
        gate.required.length > PLAN_LIMITS.maxInputs ||
        gate.required.some(
          (value) =>
            typeof value !== "string" ||
            (criteriaMode && !value) ||
            Buffer.byteLength(value) > PLAN_LIMITS.maxPromptComponentBytes,
        ))
    ) {
      throw new Error(`JSON gate requires non-empty paths: ${current.routeId}`);
    }
    if (gate.kind === "command") {
      if (
        typeof gate.command !== "string" ||
        !gate.command.trim() ||
        !Array.isArray(gate.args ?? []) ||
        (gate.args ?? []).some((value) => typeof value !== "string") ||
        !validOptionalCap(gate.timeoutMs, PLAN_LIMITS.maxTimeoutMs)
      ) {
        throw new Error(`Command gate is incomplete: ${current.routeId}`);
      }
      validateArgv(gate.args ?? [], `${current.routeId} gate`, ["{candidate}", "{root}", "{runDir}"]);
      validateEnvironment(gate.env, `${current.routeId} gate`, ["{candidate}", "{root}", "{runDir}"]);
      if (gate.cwd !== undefined && !normalizeRepoRelativePath(gate.cwd)) {
        throw new Error(`Plan paths must be repository-relative: ${gate.cwd}`);
      }
    }
    leaves.push({ gate, routeId: stableRouteId });
    if (leaves.length > PLAN_LIMITS.maxGateLeaves) {
      throw new Error(`Gate tree exceeds ${PLAN_LIMITS.maxGateLeaves} leaves: ${stageId}`);
    }
  }
  return leaves;
}

function validateCovers(value, location, criterionIds) {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    new Set(value).size !== value.length ||
    value.some((criterionId) => typeof criterionId !== "string" || !criterionIds.has(criterionId))
  ) {
    throw new Error(`Coverage must contain unique known criterion IDs: ${location}`);
  }
}

export function validateInputReferences(value, location) {
  if (!Array.isArray(value) || value.length > PLAN_LIMITS.maxInputs) {
    throw new Error(`Inputs must be an explicit array: ${location}`);
  }
  const normalizedPaths = new Set();
  for (const [index, input] of value.entries()) {
    const keys = input && typeof input === "object" ? Object.keys(input).sort().join(",") : "";
    const normalizedPath = normalizeRepoRelativePath(input?.path);
    if (
      !["path", "maxBytes,path"].includes(keys) ||
      !normalizedPath ||
      !validOptionalCap(input.maxBytes, PLAN_LIMITS.maxInputBytes)
    ) {
      throw new Error(`Input reference is invalid: ${location}:${index}`);
    }
    const identity = normalizedPath.toLowerCase();
    if (identity === ".zx-reviewer-context" || identity.startsWith(".zx-reviewer-context/")) {
      throw new Error(`Input reference uses the reserved reviewer projection path: ${location}:${normalizedPath}`);
    }
    if (normalizedPaths.has(identity)) {
      throw new Error(`Input reference is duplicated: ${location}:${normalizedPath}`);
    }
    normalizedPaths.add(identity);
  }
}

export function minimumAgentCalls(plan) {
  return plan.stages.reduce(
    (total, stage) => total + (stage.kind === "agent" ? 1 + (stage.reviewers?.length ?? 0) : 0),
    0,
  );
}

function isAcceptanceSlug(value) {
  // One alphanumeric is valid; longer IDs must also end alphanumeric and remain within 63 bytes.
  return typeof value === "string" && /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(value);
}

export function isPositiveSafeInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

export function normalizeRepoRelativePath(value) {
  if (
    typeof value !== "string" ||
    !value ||
    value !== value.trim() ||
    value.includes("\0") ||
    /^(?:[a-zA-Z]:|[\\/])/.test(value) ||
    /[<>:"|?*]/.test(value)
  ) {
    return null;
  }
  const segments = value.split(/[\\/]/);
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    return null;
  }
  return segments.join("/");
}

export function inspectArtifactSinks(env, location = "agent") {
  const prefix = "{runDir}/";
  const reserved = new Set([
    ".authority",
    ".zx-reviewer-context",
    "agents",
    "checkpoints",
    "codex-home",
    "events.jsonl",
    "home",
    "model-calls.jsonl",
    "sqlite-home",
    "work",
  ]);
  const sinks = [];
  const paths = new Set();
  for (const [environment, value] of Object.entries(env ?? {})) {
    // Only a complete canonical runDir/file value grants publication; `{runDir}` alone remains a private view.
    if (typeof value !== "string" || !value.startsWith(prefix)) continue;
    const path = normalizeRepoRelativePath(value.slice(prefix.length));
    if (!path || value !== `${prefix}${path}` || /[{}]/.test(path)) {
      throw new Error(`Artifact sink must be an exact canonical {runDir}/relative/path: ${location}:${environment}`);
    }
    if (
      path.split("/").some(
        (segment) =>
          /[. ]$/.test(segment) ||
          /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(segment),
      )
    ) {
      throw new Error(`Artifact sink path is not portable across supported platforms: ${location}:${environment}`);
    }
    const pathKey = path.toLowerCase();
    if (reserved.has(pathKey.split("/", 1)[0])) {
      throw new Error(`Artifact sink targets a reserved runtime path: ${location}:${environment}:${path}`);
    }
    if (paths.has(pathKey)) {
      throw new Error(`Artifact sink paths must be unique per agent: ${location}:${path}`);
    }
    paths.add(pathKey);
    sinks.push({ environment, path, maxBytesPerCall: PLAN_LIMITS.maxArtifactSinkBytesPerCall });
  }
  if (sinks.length > PLAN_LIMITS.maxArtifactSinks) {
    throw new Error(`Artifact sinks exceed ${PLAN_LIMITS.maxArtifactSinks}: ${location}`);
  }
  return sinks;
}

function planPathsOverlap(left, right) {
  const a = left.toLowerCase();
  const b = right.toLowerCase();
  return a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
}

export function worstCaseAgentCalls(plan) {
  return plan.stages.reduce(
    (total, stage) =>
      total +
      (stage.kind === "agent" ? (stage.attempts ?? 1) * (1 + (stage.reviewers?.length ?? 0)) : 0),
    0,
  );
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertRecordKeys(value, allowed, location) {
  if (!isRecord(value)) {
    throw new Error(`${location} must be an object.`);
  }
  const unexpected = Object.keys(value).filter((key) => !allowed.includes(key)).sort();
  if (unexpected.length) {
    throw new Error(`${location} contains unknown fields: ${unexpected.join(", ")}`);
  }
}

function validOptionalCap(value, maximum) {
  return value === undefined || (Number.isSafeInteger(value) && value > 0 && value <= maximum);
}

function validateOptionalTimeout(value, location) {
  if (!validOptionalCap(value, PLAN_LIMITS.maxTimeoutMs)) {
    throw new Error(`Timeout must be a positive safe integer at most ${PLAN_LIMITS.maxTimeoutMs}: ${location}`);
  }
}

function validateArgv(argv, location, placeholders) {
  if (
    !Array.isArray(argv) ||
    argv.length > PLAN_LIMITS.maxArgv ||
    argv.some(
      (value) =>
        typeof value !== "string" ||
        value.includes("\0") ||
        Buffer.byteLength(value) > PLAN_LIMITS.maxArgumentBytes,
    )
  ) {
    throw new Error(`Argv is invalid or exceeds its cap: ${location}`);
  }
  for (const value of argv) {
    validatePlaceholders(value, placeholders, `${location} argv`);
  }
}

function validateEnvironment(env, location, placeholders) {
  if (env === undefined) {
    return;
  }
  if (!isRecord(env) || Object.keys(env).length > PLAN_LIMITS.maxEnvironmentEntries) {
    throw new Error(`Environment is invalid or exceeds its cap: ${location}`);
  }
  for (const [key, value] of Object.entries(env)) {
    if (
      !/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(key) ||
      typeof value !== "string" ||
      value.includes("\0") ||
      Buffer.byteLength(value) > PLAN_LIMITS.maxArgumentBytes
    ) {
      throw new Error(`Environment entry is invalid: ${location}:${key}`);
    }
    if (/(TOKEN|SECRET|PASSWORD|API_KEY)/i.test(key)) {
      throw new Error(`Do not store credential environment values in plans (${location}: ${key}).`);
    }
    validatePlaceholders(value, placeholders, `${location} environment`);
  }
}

function validateAuthEnvironment(value, location) {
  const supported = new Set([
    "ANTHROPIC_API_KEY",
    "GEMINI_API_KEY",
    "GOOGLE_API_KEY",
    "OPENAI_API_KEY",
    "XAI_API_KEY",
  ]);
  if (
    value !== undefined &&
    (!Array.isArray(value) ||
      value.length === 0 ||
      value.length > 5 ||
      new Set(value).size !== value.length ||
      value.some((name) => typeof name !== "string" || !supported.has(name)))
  ) {
    throw new Error(`Agent authEnv must contain only unique supported credential names: ${location}`);
  }
}

function validatePlaceholders(value, allowed, location) {
  const tokens = value.match(/\{[A-Za-z][A-Za-z0-9]*\}/g) ?? [];
  const unknown = tokens.filter((token) => !allowed.includes(token));
  if (unknown.length) {
    throw new Error(`Prompt placeholder is invalid: ${location}`);
  }
}

function countPlaceholder(values, placeholder) {
  return values.reduce((total, value) => total + value.split(placeholder).length - 1, 0);
}

// A data-URL import exposes only validator exports and must never enter scaffolding mode.
const invokedPath = process.argv[1] ? resolve(process.argv[1]).toLowerCase() : "";
const modulePath = import.meta.url.startsWith("file:") ? fileURLToPath(import.meta.url).toLowerCase() : "";
if (modulePath && invokedPath === modulePath) {
  await scaffoldWorkflow();
}
