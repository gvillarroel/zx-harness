#!/usr/bin/env zx

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cp,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { delimiter, isAbsolute, relative, resolve, sep } from "node:path";

// Keep common agent CLIs usable without binding the workflow to their SDK implementation.
const BUILTIN_HARNESSES = {
  codex: {
    command: "codex",
    probeArgs: ["--version"],
    capabilityProbeArgs: ["exec", "--help"],
    capabilityContains: ["--ephemeral", "--skip-git-repo-check", "--sandbox"],
    args: [
      "exec",
      "--ephemeral",
      "--skip-git-repo-check",
      "--sandbox",
      "workspace-write",
      "--color",
      "never",
      "{promptText}",
    ],
  },
  copilot: {
    command: "copilot",
    probeArgs: ["--version"],
    capabilityProbeArgs: ["--help"],
    capabilityContains: ["--prompt", "--allow-all-tools", "--no-ask-user"],
    args: [
      "--no-auto-update",
      "--no-color",
      "--no-ask-user",
      "--allow-all-tools",
      "-p",
      "{promptText}",
    ],
  },
  pi: {
    command: "pi",
    probeArgs: ["--version"],
    capabilityProbeArgs: ["--help"],
    capabilityContains: ["--print", "--no-session", "--tools"],
    args: [
      "--print",
      "--no-session",
      "--no-context-files",
      "--tools",
      "read,write,edit",
      "--mode",
      "text",
      "{promptText}",
    ],
  },
  opencode: {
    command: "opencode",
    probeArgs: ["--version"],
    capabilityProbeArgs: ["run", "--help"],
    capabilityContains: ["--pure", "--dir", "--auto"],
    args: ["run", "--pure", "--auto", "--dir", "{candidate}", "{promptText}"],
  },
};
const BUILTIN_HARNESS_IDS = Object.keys(BUILTIN_HARNESSES);
const launchCache = new Map();

// Parse explicit flags while keeping the configuration file the reusable workflow contract.
const args = process.argv.slice(2);
const valueOf = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const dryRun = args.includes("--dry-run");
const probeHarnessesOnly = args.includes("--probe-harnesses");
const autoHarnessFlag = args.includes("--auto-harness");
const root = resolve(valueOf("--root") ?? process.cwd());
const configPath = resolve(root, valueOf("--config") ?? "knowledge.config.json");
if (configPath !== root && !configPath.startsWith(`${root}${sep}`)) {
  throw new Error("Configuration path must stay inside the workflow root");
}
const config = JSON.parse(await readFile(configPath, "utf8"));
const topic = String(valueOf("--topic") ?? config.topic ?? "").trim();
const topicSlug = String(config.topicSlug ?? slugify(topic));
const knowCommand = valueOf("--know") ?? config.know?.command ?? process.env.KNOW_COMMAND ?? "know";
const knowPrefix = Array.isArray(config.know?.args) ? config.know.args.map(String) : [];
const pythonCommand = valueOf("--python") ?? config.python ?? process.env.PYTHON_COMMAND ?? "python";
const okfSkillInput = valueOf("--okf-skill") ?? config.okfSkill ?? process.env.OKF_SKILL_PATH;
const okfSkill = okfSkillInput ? resolve(root, okfSkillInput) : undefined;
const enabledSources = (config.sources ?? []).filter((source) => source.enabled !== false);
const requestedHarnessInput = valueOf("--harness") ?? process.env.TOPIC_KNOWLEDGE_HARNESS;
const requestedHarness = requestedHarnessInput === "auto" ? undefined : requestedHarnessInput;
const processorConfig = config.processor ?? {};

// Reject ambiguous topic, source, and harness plans before creating state or making network calls.
if (!topic || !/^[a-z0-9][a-z0-9-]{1,62}$/.test(topicSlug)) {
  throw new Error("Topic is required and its slug must contain 2-63 lowercase letters, digits, or hyphens");
}
if (!Array.isArray(config.sources) || enabledSources.length === 0) {
  throw new Error("knowledge.config.json requires at least one enabled source");
}
for (const source of enabledSources) {
  if (!["arxiv-search", "arxiv", "site", "github-repo", "google-releases", "video"].includes(source.type)) {
    throw new Error(`Unsupported source type: ${source.type}`);
  }
  if (source.type === "arxiv-search") {
    const maximum = source.maxResults ?? 5;
    if (!Number.isInteger(maximum) || maximum < 1 || maximum > 50) {
      throw new Error("arxiv-search maxResults must be an integer from 1 to 50");
    }
  } else {
    assertSafeSource(source);
  }
}
if (
  typeof processorConfig !== "object" ||
  processorConfig === null ||
  Array.isArray(processorConfig) ||
  !Array.isArray(processorConfig.harnesses ?? [])
) {
  throw new Error("processor must be an object with a harnesses array");
}
if (processorConfig.required !== undefined && typeof processorConfig.required !== "boolean") {
  throw new Error("processor required must be a boolean");
}
if (processorConfig.autoDiscover !== undefined && typeof processorConfig.autoDiscover !== "boolean") {
  throw new Error("processor autoDiscover must be a boolean");
}
const processorTimeoutMs = boundedInteger(
  processorConfig.timeoutMs,
  900_000,
  1_000,
  3_600_000,
  "processor timeoutMs",
);
const processorProbeTimeoutMs = boundedInteger(
  processorConfig.probeTimeoutMs,
  5_000,
  100,
  60_000,
  "processor probeTimeoutMs",
);
const autoDiscover =
  processorConfig.autoDiscover === true || autoHarnessFlag || requestedHarnessInput === "auto";
const disabledHarnessIds = new Set(
  processorConfig.harnesses
    .filter((entry) => entry?.enabled === false)
    .map((entry) => entry?.id)
    .filter((id) => typeof id === "string"),
);
const configuredHarnesses = processorConfig.harnesses.filter((value) => value?.enabled !== false);
if (autoDiscover) {
  for (const preset of BUILTIN_HARNESS_IDS) {
    if (
      !disabledHarnessIds.has(preset) &&
      !configuredHarnesses.some((entry) => entry?.id === preset)
    ) {
      configuredHarnesses.push({ id: preset, preset });
    }
  }
}
if (
  requestedHarness &&
  BUILTIN_HARNESSES[requestedHarness] &&
  !configuredHarnesses.some((entry) => entry?.id === requestedHarness)
) {
  configuredHarnesses.push({ id: requestedHarness, preset: requestedHarness });
}
const harnesses = [];
const harnessIds = new Set();
for (const entry of configuredHarnesses) {
  if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
    throw new Error("Every processor harness must be an object");
  }
  const presetName = entry.preset;
  if (
    presetName !== undefined &&
    (typeof presetName !== "string" || !BUILTIN_HARNESSES[presetName])
  ) {
    throw new Error(`Unknown harness preset: ${presetName}`);
  }
  const preset = presetName ? BUILTIN_HARNESSES[presetName] : {};
  const id = entry.id ?? presetName ?? "";
  const command = entry.command ?? preset.command ?? "";
  const harnessArgs = entry.args ?? preset.args ?? [];
  const harnessProbeArgs = entry.probeArgs ?? preset.probeArgs ?? ["--version"];
  const capabilityProbeArgs =
    entry.capabilityProbeArgs ?? (entry.command === undefined ? preset.capabilityProbeArgs : []) ?? [];
  const capabilityContains =
    entry.capabilityContains ?? (entry.command === undefined ? preset.capabilityContains : []) ?? [];
  if (
    typeof id !== "string" ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(id) ||
    harnessIds.has(id)
  ) {
    throw new Error(`Harness id must be portable and unique: ${id}`);
  }
  if (
    typeof command !== "string" ||
    !command ||
    !Array.isArray(harnessArgs) ||
    !harnessArgs.every((value) => typeof value === "string") ||
    !Array.isArray(harnessProbeArgs) ||
    !harnessProbeArgs.every((value) => typeof value === "string") ||
    !Array.isArray(capabilityProbeArgs) ||
    !capabilityProbeArgs.every((value) => typeof value === "string") ||
    !Array.isArray(capabilityContains) ||
    !capabilityContains.every((value) => typeof value === "string") ||
    (capabilityContains.length > 0 && capabilityProbeArgs.length === 0)
  ) {
    throw new Error(`Harness ${id} requires a command and valid argument/probe arrays`);
  }
  if (
    entry.stdoutPath !== undefined &&
    (typeof entry.stdoutPath !== "string" ||
      !entry.stdoutPath ||
      isAbsolute(entry.stdoutPath) ||
      entry.stdoutPath.split(/[\\/]/).includes(".."))
  ) {
    throw new Error(`Harness ${id} stdoutPath must stay relative to the candidate`);
  }
  harnessIds.add(id);
  harnesses.push({
    id,
    preset: presetName ?? null,
    command,
    args: harnessArgs,
    probeArgs: harnessProbeArgs,
    capabilityProbeArgs,
    capabilityContains,
    stdoutPath: entry.stdoutPath,
    timeoutMs: boundedInteger(
      entry.timeoutMs,
      processorTimeoutMs,
      1_000,
      3_600_000,
      `Harness ${id} timeoutMs`,
    ),
    probeTimeoutMs: boundedInteger(
      entry.probeTimeoutMs,
      processorProbeTimeoutMs,
      100,
      60_000,
      `Harness ${id} probeTimeoutMs`,
    ),
  });
}
if (requestedHarness && !harnessIds.has(requestedHarness)) {
  throw new Error(`Requested harness is not configured: ${requestedHarness}`);
}
const harnessPlan = requestedHarness
  ? harnesses.filter((harness) => harness.id === requestedHarness)
  : harnesses;
const processorRequired = Boolean(processorConfig.required) || Boolean(requestedHarnessInput);

const insideRoot = (...parts) => {
  const target = resolve(root, ...parts);
  if (target === root || !target.startsWith(`${root}${sep}`)) {
    throw new Error(`Path escapes workflow root: ${parts.join("/")}`);
  }
  return target;
};
const topicDir = insideRoot("topics", topicSlug);
const storeDir = resolve(topicDir, "store");
const keyDir = resolve(storeDir, topicSlug);
const libraryDir = resolve(topicDir, "okf");
const statePath = resolve(topicDir, "state.json");
const runId = String(
  process.env.TOPIC_KNOWLEDGE_RUN_ID ??
    new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 17),
);
if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,80}$/.test(runId)) {
  throw new Error("TOPIC_KNOWLEDGE_RUN_ID is not a portable run identifier");
}
const runDir = resolve(topicDir, "runs");
const reportPath = resolve(runDir, `${runId}.json`);
const batchPath = resolve(runDir, `${runId}.batch.json`);
const promptPath = resolve(runDir, `${runId}.prompt.md`);

// Probe every planned harness without synchronization, credentials disclosure, or a model request.
if (probeHarnessesOnly) {
  const probeVariables = {
    batch: batchPath,
    candidate: libraryDir,
    sourceRoot: keyDir,
    prompt: promptPath,
    promptText: "",
    runId,
    topic,
    topicSlug,
  };
  const probeEnv = {
    ...process.env,
    TOPIC_KNOWLEDGE_BATCH_MANIFEST: batchPath,
    TOPIC_KNOWLEDGE_CANDIDATE: libraryDir,
    TOPIC_KNOWLEDGE_SOURCE_ROOT: keyDir,
    TOPIC_KNOWLEDGE_PROMPT: promptPath,
    TOPIC_KNOWLEDGE_RUN_ID: runId,
    TOPIC_KNOWLEDGE_TOPIC: topic,
    TOPIC_KNOWLEDGE_TOPIC_SLUG: topicSlug,
  };
  const probeResults = [];
  for (const harness of harnessPlan) {
    try {
      const result = await probeHarness(harness, probeVariables, root, probeEnv);
      probeResults.push({
        id: harness.id,
        preset: harness.preset,
        command: harness.command,
        available: true,
        version: firstOutputLine(result.stdout || result.stderr),
      });
    } catch {
      probeResults.push({
        id: harness.id,
        preset: harness.preset,
        command: harness.command,
        available: false,
        version: null,
      });
    }
  }
  const available = probeResults.filter((result) => result.available).length;
  console.log(
    JSON.stringify(
      {
        schemaVersion: 1,
        requested: requestedHarnessInput ?? null,
        autoDiscover,
        available,
        harnesses: probeResults,
      },
      null,
      2,
    ),
  );
  process.exit(processorRequired && available === 0 ? 1 : 0);
}

// A dry run exposes every connector and publication boundary without creating the topic folder.
if (dryRun) {
  console.log(
    JSON.stringify(
      {
        topic,
        topicSlug,
        topicDir,
        know: { command: knowCommand, prefix: knowPrefix },
        sources: enabledSources.map((source) => ({
          type: source.type,
          query: source.query ? expandTopic(source.query) : undefined,
          url: source.url,
        })),
        okfValidator: okfSkill
          ? resolve(okfSkill, "scripts", "validate_okf_bundle.py")
          : "<required --okf-skill>",
        processor: {
          required: processorRequired,
          requested: requestedHarnessInput ?? null,
          autoDiscover,
          selection: "first available in configured order",
          fallback: processorRequired ? "fail" : "validated passthrough",
          harnesses: harnessPlan.map((harness) => ({
            id: harness.id,
            preset: harness.preset,
            command: harness.command,
            argumentCount: harness.args.length,
            probeArgumentCount: harness.probeArgs.length,
            capabilityProbeArgumentCount: harness.capabilityProbeArgs.length,
            stdoutPath: harness.stdoutPath ?? null,
          })),
        },
        publication: "hash-incremental staged OKF library",
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

// Require the OKF skill resource explicitly so the generated workflow stays standalone and auditable.
if (!okfSkill) {
  throw new Error("Provide --okf-skill or OKF_SKILL_PATH");
}
const okfValidator = resolve(okfSkill, "scripts", "validate_okf_bundle.py");
if (!(await stat(okfValidator).catch(() => null))) {
  throw new Error(`Open Knowledge Format validator not found: ${okfValidator}`);
}
if (await stat(reportPath).catch(() => null)) {
  throw new Error(`Run report already exists: ${reportPath}`);
}
if ((await stat(batchPath).catch(() => null)) || (await stat(promptPath).catch(() => null))) {
  throw new Error(`Run batch artifacts already exist for: ${runId}`);
}
await mkdir(topicDir, { recursive: true });

// Initialize one know key per topic; later runs preserve its registered source metadata.
if (!(await stat(resolve(keyDir, "metadata.yaml")).catch(() => null))) {
  await runKnow(["add", "key", topicSlug]);
}
const listed = JSON.parse((await runKnow(["list", "sources", "--key", topicSlug, "--format", "json"])).stdout);
const registered = new Set(
  (listed.sources ?? []).map((source) => `${source.type}|${sourceUrl(source)}`).filter((value) => !value.endsWith("|")),
);
const synchronized = [];

// Discover bounded arXiv results and synchronize every configured source through one connector loop.
for (const source of enabledSources) {
  const concreteSources = [];
  if (source.type === "arxiv-search") {
    const query = expandTopic(source.query ?? "{topic}");
    const search = JSON.parse(
      (
        await runKnow([
          "search",
          "arxiv",
          query,
          "--format",
          "json",
          "--max-results",
          String(source.maxResults ?? 5),
          "--sort-by",
          source.sortBy ?? "relevance",
          "--sort-order",
          source.sortOrder ?? "descending",
        ])
      ).stdout,
    );
    for (const entry of (search.entries ?? []).slice(0, source.maxResults ?? 5)) {
      const url = entry.links?.alternate ?? entry.id;
      if (typeof url === "string" && url) {
        concreteSources.push({ type: "arxiv", url });
      }
    }
  } else {
    concreteSources.push(source);
  }

  for (const concrete of concreteSources) {
    assertSafeSource(concrete);
    const identity = `${concrete.type}|${concrete.url}`;
    if (!registered.has(identity)) {
      await runKnow(addArguments(concrete));
      registered.add(identity);
    }
    await runKnow(syncArguments(concrete));
    synchronized.push({ type: concrete.type, url: concrete.url });
  }
}

// Hash current Markdown sources and select only content versions absent from the committed state ledger.
const state = await readJson(statePath, {
  schemaVersion: 1,
  topic,
  topicSlug,
  processed: {},
});
if (state.schemaVersion !== 1 || state.topicSlug !== topicSlug || typeof state.processed !== "object") {
  throw new Error("Existing topic state is incompatible");
}
const sourceFiles = await markdownFiles(keyDir);
const inventory = [];
for (const path of sourceFiles) {
  const content = await readFile(path);
  inventory.push({
    path,
    relativePath: relative(keyDir, path).replaceAll("\\", "/"),
    sha256: digest(content),
  });
}
const pending = inventory.filter((item) => state.processed[item.relativePath]?.sha256 !== item.sha256);
const report = {
  schemaVersion: 1,
  runId,
  topic,
  topicSlug,
  synchronized,
  sourceFiles: inventory.length,
  newContentVersions: pending.map(({ relativePath, sha256 }) => ({ relativePath, sha256 })),
  processor: {
    required: processorRequired,
    requested: requestedHarnessInput ?? null,
    autoDiscover,
    candidates: harnessPlan.map((harness) => harness.id),
    probes: [],
    selected: null,
    selectedPreset: null,
    status: pending.length === 0 ? "skipped-empty-batch" : "pending",
  },
  validationPassed: false,
  published: false,
  exported: false,
};

// Stop cleanly when synchronization produced no new hashes; unchanged files receive no OKF work.
if (pending.length === 0) {
  if (await stat(libraryDir).catch(() => null)) {
    await run(pythonCommand, [okfValidator, libraryDir], root);
    report.validationPassed = true;
  }
  await mkdir(runDir, { recursive: true });
  await writeJson(reportPath, report);
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const candidateDir = resolve(topicDir, `.okf-candidate-${process.pid}`);
const backupDir = resolve(topicDir, `.okf-backup-${process.pid}`);
const stateCandidate = resolve(topicDir, `.state-candidate-${process.pid}.json`);
const stateBackup = resolve(topicDir, `.state-backup-${process.pid}.json`);
if (
  (await stat(candidateDir).catch(() => null)) ||
  (await stat(backupDir).catch(() => null)) ||
  (await stat(stateCandidate).catch(() => null)) ||
  (await stat(stateBackup).catch(() => null))
) {
  throw new Error("A publication candidate or backup already exists for this process");
}

let activeStage = "candidate";
try {
  // Freeze every published byte except paths whose source digest is in this exact incremental batch.
  const publishedDigests = await fileDigests(libraryDir);
  const protectedDigests = { ...publishedDigests };
  for (const item of pending) {
    delete protectedDigests[item.relativePath];
  }

  // Copy the published library once, then add only pending source documents to its isolated candidate.
  if (await stat(libraryDir).catch(() => null)) {
    await cp(libraryDir, candidateDir, { recursive: true });
  } else {
    await mkdir(candidateDir, { recursive: true });
  }
  for (const item of pending) {
    if (["index.md", "log.md"].includes(item.relativePath.split("/").at(-1))) {
      throw new Error(`Source uses a reserved OKF filename: ${item.relativePath}`);
    }
    const content = await readFile(item.path, "utf8");
    const metadata = frontmatter(content);
    if (!metadata.type) {
      throw new Error(`New concept has no non-empty OKF type: ${item.relativePath}`);
    }
    const destination = candidatePath(candidateDir, item.relativePath);
    await mkdir(resolve(destination, ".."), { recursive: true });
    await writeFile(destination, content);
  }

  // Persist the exact batch and prompt so any command, CLI, or SDK wrapper receives one stable protocol.
  const promptText = [
    "Process this incremental topic knowledge batch.",
    `Topic: ${topic}`,
    `Batch manifest: ${batchPath}`,
    `Candidate root: ${candidateDir}`,
    "",
    "Read only the pending paths declared in the manifest as new knowledge.",
    "Work only inside the candidate root.",
    "You may refine pending documents and add derived OKF Markdown concepts.",
    "Do not change or delete prior concepts, index.md, or log.md.",
    "Every concept must start with YAML frontmatter containing a non-empty type.",
    "Do not rebuild index.md; the caller rebuilds and validates it.",
    "Exit nonzero if processing cannot be completed safely.",
    "",
  ].join("\n");
  const batchManifest = {
    schemaVersion: 1,
    runId,
    topic,
    topicSlug,
    sourceRoot: keyDir,
    candidateRoot: candidateDir,
    promptPath,
    pending: pending.map(({ relativePath, sha256 }) => ({ relativePath, sha256 })),
    constraints: {
      mutableExistingPaths: pending.map((item) => item.relativePath),
      reservedNames: ["index.md", "log.md"],
      outputFormat: "Open Knowledge Format Markdown",
    },
  };
  await mkdir(runDir, { recursive: true });
  await writeFile(promptPath, promptText);
  await writeJson(batchPath, batchManifest);
  const harnessVariables = {
    batch: batchPath,
    candidate: candidateDir,
    sourceRoot: keyDir,
    prompt: promptPath,
    promptText,
    runId,
    topic,
    topicSlug,
  };
  const harnessEnv = {
    ...process.env,
    TOPIC_KNOWLEDGE_BATCH_MANIFEST: batchPath,
    TOPIC_KNOWLEDGE_CANDIDATE: candidateDir,
    TOPIC_KNOWLEDGE_SOURCE_ROOT: keyDir,
    TOPIC_KNOWLEDGE_PROMPT: promptPath,
    TOPIC_KNOWLEDGE_RUN_ID: runId,
    TOPIC_KNOWLEDGE_TOPIC: topic,
    TOPIC_KNOWLEDGE_TOPIC_SLUG: topicSlug,
  };

  // Probe in declared order and select the first available adapter, unless the caller requested one.
  activeStage = "processor-probe";
  let selectedHarness;
  for (const harness of harnessPlan) {
    try {
      await probeHarness(harness, harnessVariables, candidateDir, harnessEnv);
      report.processor.probes.push({ id: harness.id, available: true });
      selectedHarness = harness;
      break;
    } catch {
      report.processor.probes.push({ id: harness.id, available: false });
    }
  }
  if (!selectedHarness) {
    if (processorRequired) {
      report.processor.status = "unavailable";
      throw new Error("No required knowledge processor harness is available");
    }
    report.processor.status = "passthrough";
  } else {
    report.processor.selected = selectedHarness.id;
    report.processor.selectedPreset = selectedHarness.preset;
    report.processor.status = "running";
    activeStage = "processor-run";
    const startedAt = Date.now();
    const result = await run(
      selectedHarness.command,
      selectedHarness.args.map((argument) => expandHarnessArgument(argument, harnessVariables)),
      candidateDir,
      { env: harnessEnv, timeoutMs: selectedHarness.timeoutMs },
    );
    if (selectedHarness.stdoutPath) {
      if (result.stdoutTruncated) {
        throw new Error(`Harness ${selectedHarness.id} stdout exceeded the capture limit`);
      }
      const stdoutDestination = candidatePath(
        candidateDir,
        expandHarnessArgument(selectedHarness.stdoutPath, harnessVariables),
      );
      const stdoutName = relative(candidateDir, stdoutDestination).replaceAll("\\", "/");
      if (protectedDigests[stdoutName] || ["index.md", "log.md"].includes(stdoutName.split("/").at(-1))) {
        throw new Error(`Harness ${selectedHarness.id} stdoutPath is protected or reserved: ${stdoutName}`);
      }
      await mkdir(resolve(stdoutDestination, ".."), { recursive: true });
      await writeFile(stdoutDestination, result.stdout);
    }
    report.processor.status = "passed";
    report.processor.durationMs = Date.now() - startedAt;
    report.processor.stdout = outputEvidence(result, "stdout");
    report.processor.stderr = outputEvidence(result, "stderr");
  }

  // Reject a harness that crossed the incremental boundary before rebuilding any shared artifact.
  activeStage = "processor-isolation";
  const candidateDigests = await fileDigests(candidateDir);
  for (const [name, sha256] of Object.entries(protectedDigests)) {
    if (candidateDigests[name] !== sha256) {
      throw new Error(`Harness changed or removed protected published file: ${name}`);
    }
  }
  for (const reserved of ["index.md", "log.md"]) {
    if (!publishedDigests[reserved] && candidateDigests[reserved]) {
      throw new Error(`Harness created reserved file: ${reserved}`);
    }
  }
  for (const item of pending) {
    if (!(await stat(candidatePath(candidateDir, item.relativePath)).catch(() => null))?.isFile()) {
      throw new Error(`Harness removed pending source concept: ${item.relativePath}`);
    }
  }

  // Rebuild the reserved index from the complete candidate after the processor has passed isolation.
  activeStage = "index";
  const concepts = [];
  for (const path of await markdownFiles(candidateDir)) {
    const name = relative(candidateDir, path).replaceAll("\\", "/");
    const basename = name.split("/").at(-1);
    if (["index.md", "log.md"].includes(basename)) {
      if (name !== basename) {
        throw new Error(`Reserved OKF filename must stay at the bundle root: ${name}`);
      }
      continue;
    }
    const metadata = frontmatter(await readFile(path, "utf8"));
    if (!metadata.type) {
      throw new Error(`Published concept has no non-empty OKF type: ${name}`);
    }
    concepts.push({ name, title: metadata.title || name });
  }
  concepts.sort((left, right) => left.title.localeCompare(right.title) || left.name.localeCompare(right.name));
  const indexText = [
    `# ${topic}`,
    "",
    ...concepts.map((concept) => `* [${escapeMarkdown(concept.title)}](${concept.name})`),
    "",
  ].join("\n");
  await writeFile(resolve(candidateDir, "index.md"), indexText);

  // Keep the requested OKF skill as the final authority before any candidate can be published.
  activeStage = "okf-validation";
  await run(pythonCommand, [okfValidator, candidateDir], root);
  report.validationPassed = true;

  // Export the know key only for a non-empty batch; packaging unchanged state would create noise.
  activeStage = "know-export";
  if (config.export !== false) {
    await runKnow(["export", "--key", topicSlug]);
    report.exported = true;
  }

  // Materialize the next state before promotion so the library and ledger move transactionally.
  const nextState = {
    ...state,
    topic,
    topicSlug,
    processed: { ...state.processed },
  };
  for (const item of pending) {
    nextState.processed[item.relativePath] = {
      sha256: item.sha256,
      publishedPath: item.relativePath,
      processedInRun: runId,
    };
  }
  await writeJson(stateCandidate, nextState);

  // Promote both artifacts or restore both prior versions if a rename or report write fails.
  activeStage = "promotion";
  const hadLibrary = Boolean(await stat(libraryDir).catch(() => null));
  const hadState = Boolean(await stat(statePath).catch(() => null));
  let libraryBackedUp = false;
  let stateBackedUp = false;
  let libraryPromoted = false;
  let statePromoted = false;
  try {
    if (hadLibrary) {
      await rename(libraryDir, backupDir);
      libraryBackedUp = true;
    }
    if (hadState) {
      await rename(statePath, stateBackup);
      stateBackedUp = true;
    }
    await rename(candidateDir, libraryDir);
    libraryPromoted = true;
    await rename(stateCandidate, statePath);
    statePromoted = true;
    report.published = true;
    await writeJson(reportPath, report);
  } catch (error) {
    report.published = false;
    if (libraryPromoted) {
      await rm(libraryDir, { recursive: true, force: true });
    }
    if (statePromoted) {
      await rm(statePath, { force: true });
    }
    if (libraryBackedUp && (await stat(backupDir).catch(() => null))) {
      await rename(backupDir, libraryDir);
    }
    if (stateBackedUp && (await stat(stateBackup).catch(() => null))) {
      await rename(stateBackup, statePath);
    }
    throw error;
  }
  await rm(backupDir, { recursive: true, force: true }).catch(() => {});
  await rm(stateBackup, { force: true }).catch(() => {});
} catch (error) {
  // Preserve a terse failure receipt without persisting harness output or environment secrets.
  if (activeStage === "processor-isolation") {
    report.processor.status = "rejected";
  } else if (["pending", "running"].includes(report.processor.status)) {
    report.processor.status = "failed";
  }
  report.failure = { stage: activeStage, name: error?.name ?? "Error" };
  report.validationPassed = false;
  report.published = false;
  await rm(candidateDir, { recursive: true, force: true });
  await rm(stateCandidate, { force: true });
  await mkdir(runDir, { recursive: true });
  if (!(await stat(reportPath).catch(() => null))) {
    await writeJson(reportPath, report);
  }
  throw error;
}

console.log(JSON.stringify(report, null, 2));

function addArguments(source) {
  const result = ["add", source.type, source.url, "--key", topicSlug];
  if (source.type === "site") {
    if (source.sourceId) result.push("--source-id", String(source.sourceId));
    if (source.maxDepth !== undefined) result.push("--max-depth", String(source.maxDepth));
    if (source.maxPages !== undefined) result.push("--max-pages", String(source.maxPages));
  }
  if (source.type === "github-repo") {
    for (const branch of source.branches ?? []) result.push("--branch", String(branch));
  }
  if (source.type === "video") {
    for (const language of source.languages ?? []) result.push("--language", String(language));
  }
  return result;
}

function syncArguments(source) {
  const result = ["sync", source.type, source.url, "--key", topicSlug];
  if (source.type === "github-repo") {
    for (const branch of source.branches ?? []) result.push("--branch", String(branch));
  }
  return result;
}

function assertSafeSource(source) {
  if (typeof source.url !== "string" || !source.url) {
    throw new Error(`${source.type} requires a URL or path`);
  }
  if (source.type === "video" && !/^[a-zA-Z][a-zA-Z+.-]*:/.test(source.url)) {
    const localVideo = resolve(root, source.url);
    if (localVideo !== root && !localVideo.startsWith(`${root}${sep}`)) {
      throw new Error(`Local video path escapes workflow root: ${source.url}`);
    }
  } else {
    const parsed = new URL(source.url);
    if (!["https:", "http:"].includes(parsed.protocol) || parsed.username || parsed.password) {
      throw new Error(`Unsafe source URL: ${source.url}`);
    }
  }
}

function sourceUrl(source) {
  return source.config?.url ?? source.config?.repo_url ?? source.config?.repoUrl ?? source.title ?? "";
}

function expandTopic(value) {
  return String(value).replaceAll("{topic}", topic);
}

function slugify(value) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{Mark}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function boundedInteger(value, fallback, minimum, maximum, label) {
  const result = value ?? fallback;
  if (!Number.isInteger(result) || result < minimum || result > maximum) {
    throw new Error(`${label} must be an integer from ${minimum} to ${maximum}`);
  }
  return result;
}

function candidatePath(base, name) {
  const target = resolve(base, String(name));
  if (target === base || !target.startsWith(`${base}${sep}`)) {
    throw new Error(`Path escapes candidate root: ${name}`);
  }
  return target;
}

function expandHarnessArgument(value, variables) {
  let result = String(value);
  for (const [name, replacement] of Object.entries(variables)) {
    result = result.replaceAll(`{${name}}`, String(replacement));
  }
  return result;
}

function outputEvidence(result, stream) {
  const value = result[stream];
  const truncated = result[`${stream}Truncated`];
  return {
    bytes: result[`${stream}Bytes`],
    sha256: truncated ? null : digest(value),
    truncated,
  };
}

function firstOutputLine(value) {
  const normalized = stripAnsi(value)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  return normalized ? normalized.slice(0, 200) : null;
}

function stripAnsi(value) {
  return String(value).replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "");
}

function frontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) {
    return {};
  }
  const result = {};
  const lines = match[1].split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const field = line.match(/^([a-zA-Z][a-zA-Z0-9_-]*):\s*(.*?)\s*$/);
    if (field && ["type", "title"].includes(field[1])) {
      let value = field[2].trim();
      const quote = value.startsWith("'") ? "'" : value.startsWith('"') ? '"' : "";
      while (
        quote &&
        !value.endsWith(quote) &&
        index + 1 < lines.length &&
        /^\s+/.test(lines[index + 1])
      ) {
        index += 1;
        value = `${value} ${lines[index].trim()}`;
      }
      if (quote && value.endsWith(quote)) {
        value = value.slice(1, -1);
      }
      result[field[1]] = quote === "'" ? value.replaceAll("''", "'").trim() : value.trim();
    }
  }
  return result;
}

function escapeMarkdown(value) {
  return String(value).replace(/([\\[\]])/g, "\\$1");
}

async function fileDigests(directory) {
  const result = {};
  const pendingDirectories = [directory];
  while (pendingDirectories.length > 0) {
    const current = pendingDirectories.pop();
    const entries = await readdir(current, { withFileTypes: true }).catch((error) => {
      if (error?.code === "ENOENT") return [];
      throw error;
    });
    entries.sort((left, right) => right.name.localeCompare(left.name));
    for (const entry of entries) {
      const path = resolve(current, entry.name);
      if (entry.isSymbolicLink()) {
        throw new Error(`Symbolic links are not allowed in an OKF candidate: ${path}`);
      }
      if (entry.isDirectory()) {
        pendingDirectories.push(path);
      } else if (entry.isFile()) {
        const name = relative(directory, path).replaceAll("\\", "/");
        result[name] = digest(await readFile(path));
      }
    }
  }
  return Object.fromEntries(Object.entries(result).sort(([left], [right]) => left.localeCompare(right)));
}

async function markdownFiles(directory) {
  const files = [];
  const pendingDirectories = [directory];
  while (pendingDirectories.length > 0) {
    const current = pendingDirectories.pop();
    const entries = await readdir(current, { withFileTypes: true }).catch(() => []);
    entries.sort((left, right) => right.name.localeCompare(left.name));
    for (const entry of entries) {
      const path = resolve(current, entry.name);
      if (entry.isDirectory()) {
        pendingDirectories.push(path);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
        files.push(path);
      }
    }
  }
  return files.sort();
}

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") {
      return fallback;
    }
    throw error;
  }
}

async function writeJson(path, value) {
  await mkdir(resolve(path, ".."), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function probeHarness(harness, variables, cwd, env) {
  const version = await run(
    harness.command,
    harness.probeArgs.map((argument) => expandHarnessArgument(argument, variables)),
    cwd,
    { env, timeoutMs: harness.probeTimeoutMs },
  );
  if (harness.capabilityProbeArgs.length > 0) {
    const capability = await run(
      harness.command,
      harness.capabilityProbeArgs.map((argument) => expandHarnessArgument(argument, variables)),
      cwd,
      { env, timeoutMs: harness.probeTimeoutMs },
    );
    const output = stripAnsi(`${capability.stdout}\n${capability.stderr}`);
    for (const required of harness.capabilityContains) {
      if (!output.includes(required)) {
        throw new Error(`Harness ${harness.id} capability probe lacks: ${required}`);
      }
    }
  }
  return version;
}

async function runKnow(commandArguments) {
  return await run(
    knowCommand,
    [...knowPrefix, "--store", storeDir, "--json", ...commandArguments],
    root,
  );
}

async function run(command, commandArguments, cwd, options = {}) {
  // Run every tool without a shell so topics, URLs, and paths never become command syntax.
  const launch = await resolveLaunch(command, commandArguments);
  return await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(launch.command, launch.arguments, {
      cwd,
      env: options.env ?? process.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    const captureLimit = 2_000_000;
    const stdoutChunks = [];
    const stderrChunks = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let stdoutCaptured = 0;
    let stderrCaptured = 0;
    let settled = false;
    let timer;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      callback(value);
    };
    child.stdout.on("data", (chunk) => {
      const buffer = Buffer.from(chunk);
      stdoutBytes += buffer.length;
      if (stdoutCaptured < captureLimit) {
        const captured = buffer.subarray(0, captureLimit - stdoutCaptured);
        stdoutChunks.push(captured);
        stdoutCaptured += captured.length;
      }
    });
    child.stderr.on("data", (chunk) => {
      const buffer = Buffer.from(chunk);
      stderrBytes += buffer.length;
      if (stderrCaptured < captureLimit) {
        const captured = buffer.subarray(0, captureLimit - stderrCaptured);
        stderrChunks.push(captured);
        stderrCaptured += captured.length;
      }
    });
    child.on("error", (error) => finish(rejectPromise, error));
    child.on("close", (code) => {
      const stdout = Buffer.concat(stdoutChunks).toString("utf8");
      const stderr = Buffer.concat(stderrChunks).toString("utf8");
      const result = {
        stdout,
        stderr,
        stdoutBytes,
        stderrBytes,
        stdoutTruncated: stdoutBytes > stdoutCaptured,
        stderrTruncated: stderrBytes > stderrCaptured,
      };
      if (code === 0) {
        finish(resolvePromise, result);
      } else {
        finish(rejectPromise, new Error(`${command} exited ${code}\n${stdout}\n${stderr}`));
      }
    });
    if (options.timeoutMs) {
      timer = setTimeout(() => {
        child.kill();
        finish(rejectPromise, new Error(`${command} timed out after ${options.timeoutMs}ms`));
      }, options.timeoutMs);
      timer.unref?.();
    }
  });
}

async function resolveLaunch(command, commandArguments) {
  if (process.platform !== "win32") {
    return { command, arguments: commandArguments };
  }
  let cached = launchCache.get(command);
  if (!cached) {
    const found = await findWindowsCommand(command);
    const extension = found?.toLowerCase().match(/\.(ps1|cmd|bat)$/)?.[1];
    let script = found;
    if (["cmd", "bat"].includes(extension)) {
      const powershellSibling = found.replace(/\.(cmd|bat)$/i, ".ps1");
      script = (await stat(powershellSibling).catch(() => null))?.isFile()
        ? powershellSibling
        : undefined;
      if (!script) {
        throw new Error(
          `Command ${command} resolves only to a shell script; configure an executable or PowerShell adapter`,
        );
      }
    }
    if (script?.toLowerCase().endsWith(".ps1")) {
      const systemPowerShell = resolve(
        process.env.SystemRoot ?? "C:\\Windows",
        "System32",
        "WindowsPowerShell",
        "v1.0",
        "powershell.exe",
      );
      cached = {
        command: (await stat(systemPowerShell).catch(() => null)) ? systemPowerShell : "powershell.exe",
        prefix: [
          "-NoLogo",
          "-NoProfile",
          "-NonInteractive",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          script,
        ],
      };
    } else {
      cached = { command: found ?? command, prefix: [] };
    }
    launchCache.set(command, cached);
  }
  return {
    command: cached.command,
    arguments: [...cached.prefix, ...commandArguments],
  };
}

async function findWindowsCommand(command) {
  const explicit = isAbsolute(command) || command.includes("\\") || command.includes("/");
  const suffixes = /\.(exe|com|ps1|cmd|bat)$/i.test(command)
    ? [""]
    : [".exe", ".com", ".ps1", ".cmd", ".bat", ""];
  const directories = explicit
    ? [resolve(command, "..")]
    : String(process.env.PATH ?? "")
        .split(delimiter)
        .map((value) => value.trim().replace(/^"(.*)"$/, "$1"))
        .filter(Boolean);
  const basename = explicit ? resolve(command).split(/[\\/]/).at(-1) : command;
  for (const directory of directories) {
    for (const suffix of suffixes) {
      const candidate = resolve(directory, `${basename}${suffix}`);
      if ((await stat(candidate).catch(() => null))?.isFile()) {
        return candidate;
      }
    }
  }
  return null;
}
