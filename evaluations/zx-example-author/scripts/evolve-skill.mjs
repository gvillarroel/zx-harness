#!/usr/bin/env node

import { spawn } from "node:child_process";
import { access, cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { availableParallelism } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptFile = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(scriptFile);
const evaluationDir = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(evaluationDir, "..", "..");
const skillArenaRoot = path.resolve(repoRoot, "..", "skill-arena");
const baseSkillDir = path.resolve(repoRoot, "skills", "zx-example-author");
const tracedSkillDir = path.resolve(
  evaluationDir,
  "evolved-skills",
  "skill-traced-evolution-zx-example-author",
);
const baseComparePath = path.resolve(evaluationDir, "compare-evolved.yaml");
const logsDir = path.resolve(evaluationDir, "logs");
const generatedRoot = path.resolve(evaluationDir, "generated");
const npmBinDir = path.resolve(process.env.APPDATA ?? "", "npm");
const logicalProcessors = availableParallelism();
const suggestedParallelism = Math.max(2, Math.min(8, Math.floor(logicalProcessors * 0.75)));
const timestamp = new Date().toISOString().replaceAll(":", "-").replace(/\.\d+Z$/, "Z");

const args = process.argv.slice(2);
const options = {
  dryRun: false,
  mutateOnly: false,
  evaluateOnly: false,
  maxConcurrency: suggestedParallelism,
  mutators: ["codex", "copilot", "pi"],
  requests: 1,
  raiseRequestsTo: 3,
  repeats: 3,
  includeStabilizedCandidate: true,
  codexModel: "gpt-5.1-codex-mini",
  copilotModel: "gpt-5-mini",
  copilotEffort: "low",
  piThinking: "minimal",
  finalistCount: 3,
  playoffRepeats: 3,
  verificationRepeats: 1,
  promotionMargin: 1,
  promotionAverageMargin: 0.5,
  screeningVariants: ["codex-mini"],
  playoffVariants: ["codex-mini"],
  verificationVariants: ["codex-mini", "gpt-5-4"],
};

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];

  if (arg === "--dry-run") {
    options.dryRun = true;
    continue;
  }

  if (arg === "--mutate-only") {
    options.mutateOnly = true;
    continue;
  }

  if (arg === "--evaluate-only") {
    options.evaluateOnly = true;
    continue;
  }

  if (arg === "--mutators") {
    options.mutators = (args[index + 1] ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    index += 1;
    continue;
  }

  if (arg === "--requests") {
    options.requests = Number(args[index + 1] ?? options.requests);
    index += 1;
    continue;
  }

  if (arg === "--raise-requests-to") {
    options.raiseRequestsTo = Number(args[index + 1] ?? options.raiseRequestsTo);
    index += 1;
    continue;
  }

  if (arg === "--repeats") {
    options.repeats = Number(args[index + 1] ?? options.repeats);
    index += 1;
    continue;
  }

  if (arg === "--playoff-repeats") {
    options.playoffRepeats = Number(args[index + 1] ?? options.playoffRepeats);
    index += 1;
    continue;
  }

  if (arg === "--verification-repeats") {
    options.verificationRepeats = Number(args[index + 1] ?? options.verificationRepeats);
    index += 1;
    continue;
  }

  if (arg === "--finalist-count") {
    options.finalistCount = Number(args[index + 1] ?? options.finalistCount);
    index += 1;
    continue;
  }

  if (arg === "--promotion-margin") {
    options.promotionMargin = Number(args[index + 1] ?? options.promotionMargin);
    index += 1;
    continue;
  }

  if (arg === "--promotion-average-margin") {
    options.promotionAverageMargin = Number(args[index + 1] ?? options.promotionAverageMargin);
    index += 1;
    continue;
  }

  if (arg === "--screening-variants") {
    options.screeningVariants = parseCsvArg(args[index + 1], options.screeningVariants);
    index += 1;
    continue;
  }

  if (arg === "--playoff-variants") {
    options.playoffVariants = parseCsvArg(args[index + 1], options.playoffVariants);
    index += 1;
    continue;
  }

  if (arg === "--verification-variants") {
    options.verificationVariants = parseCsvArg(args[index + 1], options.verificationVariants);
    index += 1;
    continue;
  }

  if (arg === "--max-concurrency") {
    options.maxConcurrency = Number(args[index + 1] ?? options.maxConcurrency);
    index += 1;
    continue;
  }

  if (arg === "--no-stabilized-candidate") {
    options.includeStabilizedCandidate = false;
    continue;
  }

  if (arg === "--help") {
    printHelp();
    process.exit(0);
  }

  throw new Error(`Unsupported flag: ${arg}`);
}

const requestedMutators = [...new Set(options.mutators)];
const runDir = path.resolve(generatedRoot, timestamp);
const candidateRoot = path.resolve(runDir, "candidates");
const configRoot = path.resolve(runDir, "configs");
const reportPath = path.resolve(logsDir, `${timestamp}-evolution.md`);

await mkdir(logsDir, { recursive: true });
await mkdir(candidateRoot, { recursive: true });
await mkdir(configRoot, { recursive: true });

await assertReadable(baseSkillDir);
await assertReadable(tracedSkillDir);
await assertReadable(baseComparePath);
await assertReadable(skillArenaRoot);

const mutatorCatalog = {
  codex: {
    command: path.resolve(npmBinDir, "codex.cmd"),
    buildArgs(promptText) {
      return [
        "exec",
        "--dangerously-bypass-approvals-and-sandbox",
        "--skip-git-repo-check",
        "--sandbox",
        "danger-full-access",
        "-C",
        repoRoot,
        "-m",
        options.codexModel,
        promptText,
      ];
    },
  },
  copilot: {
    command: path.resolve(npmBinDir, "copilot.cmd"),
    buildArgs(promptText) {
      return [
        "--yolo",
        "--no-ask-user",
        "--allow-all-tools",
        "--allow-all-paths",
        "--allow-all-urls",
        "--model",
        options.copilotModel,
        "--effort",
        options.copilotEffort,
        "--silent",
        "--add-dir",
        repoRoot,
        "-p",
        promptText,
      ];
    },
  },
  pi: {
    command: path.resolve(npmBinDir, "pi.cmd"),
    buildArgs(promptText) {
      return [
        "--no-session",
        "--tools",
        "read,bash,edit,write,grep,find,ls",
        "--thinking",
        options.piThinking,
        "-p",
        promptText,
      ];
    },
  },
};

const variantCatalog = {
  "codex-mini": [
    "    - id: codex-mini",
    "      description: Codex mini authoring variant.",
    "      agent:",
    "        adapter: codex",
    "        model: gpt-5.1-codex-mini",
    "        executionMethod: command",
    "        commandPath: codex",
    "        sandboxMode: danger-full-access",
    "        approvalPolicy: never",
    "        webSearchEnabled: false",
    "        networkAccessEnabled: true",
    "        reasoningEffort: low",
    "        additionalDirectories: []",
    "        cliEnv: {}",
    "        config: {}",
    "      output:",
    "        tags:",
    "          - codex",
    "          - mini",
    "        labels:",
    "          variantDisplayName: codex mini",
  ].join("\n"),
  "gpt-5-4": [
    "    - id: gpt-5-4",
    "      description: GPT-5.4 authoring variant.",
    "      agent:",
    "        adapter: codex",
    "        model: gpt-5.4",
    "        executionMethod: command",
    "        commandPath: codex",
    "        sandboxMode: danger-full-access",
    "        approvalPolicy: never",
    "        webSearchEnabled: false",
    "        networkAccessEnabled: true",
    "        reasoningEffort: low",
    "        additionalDirectories: []",
    "        cliEnv: {}",
    "        config: {}",
    "      output:",
    "        tags:",
    "          - gpt",
    "          - \"5.4\"",
    "        labels:",
    "          variantDisplayName: GPT-5.4",
  ].join("\n"),
};

for (const mutator of requestedMutators) {
  if (!mutatorCatalog[mutator]) {
    throw new Error(`Unsupported mutator: ${mutator}`);
  }
}

const plannedCandidates = [];
for (const mutator of requestedMutators) {
  const candidateDir = path.resolve(candidateRoot, `${mutator}-zx-example-author`);
  plannedCandidates.push({
    id: `candidate-${mutator}`,
    mutator,
    candidateDir,
    logPath: path.resolve(runDir, `${mutator}.log`),
  });
}

if (options.includeStabilizedCandidate) {
  plannedCandidates.push({
    id: "candidate-stabilized",
    mutator: "blend-stabilized",
    candidateDir: path.resolve(candidateRoot, "stabilized-zx-example-author"),
    logPath: path.resolve(runDir, "stabilized.log"),
    mutationStatus: "ok",
    mutationError: "",
  });
  plannedCandidates.push({
    id: "candidate-scaffold-traced",
    mutator: "blend-scaffold-traced",
    candidateDir: path.resolve(candidateRoot, "scaffold-traced-zx-example-author"),
    logPath: path.resolve(runDir, "scaffold-traced.log"),
    mutationStatus: "ok",
    mutationError: "",
  });
}

const promptText = [
  "Improve the zx-example-author skill bundle for the fixed benchmark at evaluations/zx-example-author/compare-evolved.yaml.",
  `Edit only files inside ${toForwardSlash(candidateRoot)} and only within the candidate folder assigned by the run.`,
  "Preserve English-only output, keep instructions dense, and prefer small attributable changes.",
  "Use the local scaffold and template strategy when it improves benchmark fidelity.",
  "Do not add benchmark-only victory notes to the skill.",
  "You may edit SKILL.md, scripts, and templates when the benchmark evidence justifies it.",
  "Before finishing, leave the candidate in a runnable state and summarize the mutation briefly.",
].join("\n");

if (options.dryRun) {
  const comparePreview = await buildCompareConfig(plannedCandidates, options.requests, options.maxConcurrency);
  await writeFile(path.resolve(configRoot, "dry-run-compare.yaml"), comparePreview);
  console.log(JSON.stringify({
    logicalProcessors,
    suggestedParallelism,
    requestedMutators,
    requests: options.requests,
    raiseRequestsTo: options.raiseRequestsTo,
    maxConcurrency: options.maxConcurrency,
    comparePreview: toForwardSlash(path.resolve(configRoot, "dry-run-compare.yaml")),
  }, null, 2));
  process.exit(0);
}

const runNotes = [];
runNotes.push(`# zx-example-author evolution run`);
runNotes.push("");
runNotes.push(`- timestamp: \`${timestamp}\``);
runNotes.push(`- logical processors: \`${logicalProcessors}\``);
runNotes.push(`- chosen maxConcurrency: \`${options.maxConcurrency}\``);
runNotes.push(`- base requests: \`${options.requests}\``);
runNotes.push(`- repeats: \`${options.repeats}\``);
runNotes.push(`- playoff repeats: \`${options.playoffRepeats}\``);
runNotes.push(`- verification repeats: \`${options.verificationRepeats}\``);
runNotes.push(`- raise requests target: \`${options.raiseRequestsTo}\``);
runNotes.push(`- finalist count: \`${options.finalistCount}\``);
runNotes.push(`- promotion margin: \`${options.promotionMargin}\``);
runNotes.push(`- promotion average margin: \`${options.promotionAverageMargin}\``);
runNotes.push(`- mutators: \`${requestedMutators.join(", ")}\``);
runNotes.push(`- screening variants: \`${options.screeningVariants.join(", ")}\``);
runNotes.push(`- playoff variants: \`${options.playoffVariants.join(", ")}\``);
runNotes.push(`- verification variants: \`${options.verificationVariants.join(", ")}\``);
runNotes.push(`- mutator models: \`codex=${options.codexModel}, copilot=${options.copilotModel}/${options.copilotEffort}, pi=${options.piThinking}\``);

if (options.includeStabilizedCandidate) {
  for (const blendCandidate of plannedCandidates.filter((candidate) => candidate.id.startsWith("candidate-") && candidate.mutator.startsWith("blend-"))) {
    await rm(blendCandidate.candidateDir, { recursive: true, force: true });
    await cp(baseSkillDir, blendCandidate.candidateDir, { recursive: true });
    await materializeBlendedCandidate(blendCandidate);
    runNotes.push(`- mutator \`${blendCandidate.id}\`: \`ok\``);
  }
}

if (!options.evaluateOnly) {
  for (const candidate of plannedCandidates.filter((item) => !item.mutator.startsWith("blend-"))) {
    await rm(candidate.candidateDir, { recursive: true, force: true });
    await cp(baseSkillDir, candidate.candidateDir, { recursive: true });
  }

  // Launch mutators in a small pool so network-backed agents overlap without saturating the machine.
  const pending = plannedCandidates.filter((candidate) => !candidate.mutator.startsWith("blend-"));
  const active = [];

  while (pending.length || active.length) {
    while (pending.length && active.length < Math.min(requestedMutators.length, options.maxConcurrency)) {
      const candidate = pending.shift();
      const task = runMutator(candidate);
      active.push(task);
    }

    const finished = await Promise.race(active.map((task) => task.promise));
    const taskIndex = active.findIndex((task) => task.id === finished.id);
    active.splice(taskIndex, 1);
    const candidate = plannedCandidates.find((item) => item.id === finished.id);
    if (candidate) {
      candidate.mutationStatus = finished.status;
      candidate.mutationError = finished.error;
    }
    runNotes.push(`- mutator \`${finished.id}\`: \`${finished.status}\``);
    if (finished.error) {
      runNotes.push(`  reason: ${finished.error}`);
    }
  }
}

if (!options.mutateOnly) {
  const candidatesForEvaluation = options.evaluateOnly
    ? plannedCandidates
    : plannedCandidates.filter((candidate) => candidate.mutationStatus === "ok");
  const baseEvaluation = await evaluateProfiles(candidatesForEvaluation, {
    requests: options.requests,
    repeats: options.repeats,
    maxConcurrency: options.maxConcurrency,
    configPath: path.resolve(configRoot, `compare-${options.requests}r.yaml`),
    variantIds: options.screeningVariants,
  });
  const baseScoreboard = baseEvaluation.scoreboard;
  const winner = pickWinner(baseScoreboard);
  runNotes.push("");
  runNotes.push(`## Base evaluation`);
  runNotes.push("");
  for (let repeatIndex = 0; repeatIndex < baseEvaluation.runs.length; repeatIndex += 1) {
    runNotes.push(`- compare dir ${repeatIndex + 1}: \`${toForwardSlash(baseEvaluation.runs[repeatIndex].compareDir)}\``);
  }

  for (const [profileId, score] of Object.entries(baseScoreboard)) {
    runNotes.push(
      `- ${profileId}: \`majority ${score.majorityPasses}/${score.total}\`, \`avg ${score.averagePasses.toFixed(2)}/${score.total}\`, \`wins ${score.winCount}\`, \`agreement ${score.majorityAgreement.toFixed(2)}\``,
    );
  }

  if (winner) {
    runNotes.push(`- winner: \`${winner.profileId}\``);
  }

  // Re-run only the leaders so the expensive evidence is spent where it matters.
  const finalists = shortlistProfiles(baseScoreboard, options.finalistCount);
  const playoffCandidates = candidatesForEvaluation.filter((candidate) => finalists.includes(candidate.id));
  const playoffEvaluation = await evaluateProfiles(playoffCandidates, {
    requests: options.requests,
    repeats: Math.max(options.repeats, options.playoffRepeats),
    maxConcurrency: options.maxConcurrency,
    configPath: path.resolve(configRoot, `compare-${options.requests}r-playoff.yaml`),
    variantIds: options.playoffVariants,
  });
  const playoffWinner = pickWinner(playoffEvaluation.scoreboard);
  const bestIncumbent = bestIncumbentScore(playoffEvaluation.scoreboard);

  runNotes.push("");
  runNotes.push(`## Playoff`);
  runNotes.push("");
  runNotes.push(`- finalists: \`${finalists.join(", ")}\``);
  for (let repeatIndex = 0; repeatIndex < playoffEvaluation.runs.length; repeatIndex += 1) {
    runNotes.push(`- compare dir ${repeatIndex + 1}: \`${toForwardSlash(playoffEvaluation.runs[repeatIndex].compareDir)}\``);
  }
  for (const [profileId, score] of Object.entries(playoffEvaluation.scoreboard)) {
    runNotes.push(
      `- ${profileId}: \`majority ${score.majorityPasses}/${score.total}\`, \`avg ${score.averagePasses.toFixed(2)}/${score.total}\`, \`wins ${score.winCount}\`, \`agreement ${score.majorityAgreement.toFixed(2)}\``,
    );
  }
  if (playoffWinner) {
    runNotes.push(`- playoff winner: \`${playoffWinner.profileId}\``);
  }

  const promotionDecision = decidePromotion(playoffWinner, bestIncumbent, options);
  let verifiedPromotion = { promote: false, reason: promotionDecision.reason, winner: playoffWinner };
  if (promotionDecision.promote && playoffWinner?.profileId.startsWith("candidate-")) {
    const verificationCandidates = candidatesForEvaluation.filter((candidate) => [playoffWinner.profileId, bestIncumbent?.profileId].includes(candidate.id));
    const verificationEvaluation = await evaluateProfiles(verificationCandidates, {
      requests: options.requests,
      repeats: options.verificationRepeats,
      maxConcurrency: options.maxConcurrency,
      configPath: path.resolve(configRoot, `compare-${options.requests}r-verification.yaml`),
      variantIds: options.verificationVariants,
    });
    const verificationWinner = pickWinner(verificationEvaluation.scoreboard);
    const verificationIncumbent = bestIncumbentScore(verificationEvaluation.scoreboard);
    verifiedPromotion = {
      ...decidePromotion(verificationWinner, verificationIncumbent, {
        ...options,
        promotionMargin: 0,
        promotionAverageMargin: 0,
      }),
      winner: verificationWinner,
    };

    runNotes.push("");
    runNotes.push(`## Verification`);
    runNotes.push("");
    for (let repeatIndex = 0; repeatIndex < verificationEvaluation.runs.length; repeatIndex += 1) {
      runNotes.push(`- compare dir ${repeatIndex + 1}: \`${toForwardSlash(verificationEvaluation.runs[repeatIndex].compareDir)}\``);
    }
    for (const [profileId, score] of Object.entries(verificationEvaluation.scoreboard)) {
      runNotes.push(
        `- ${profileId}: \`majority ${score.majorityPasses}/${score.total}\`, \`avg ${score.averagePasses.toFixed(2)}/${score.total}\`, \`wins ${score.winCount}\`, \`agreement ${score.majorityAgreement.toFixed(2)}\``,
      );
    }
  }

  if (verifiedPromotion.promote && verifiedPromotion.winner?.profileId.startsWith("candidate-")) {
    const winningCandidate = plannedCandidates.find((candidate) => candidate.id === verifiedPromotion.winner.profileId);
    if (winningCandidate) {
      const changed = !(await directoriesMatch(winningCandidate.candidateDir, baseSkillDir));
      if (changed) {
        await rm(baseSkillDir, { recursive: true, force: true });
        await cp(winningCandidate.candidateDir, baseSkillDir, { recursive: true });
        runNotes.push(`- promoted: \`${winningCandidate.id}\` -> \`${toForwardSlash(baseSkillDir)}\``);
      } else {
        runNotes.push(`- promoted: \`none\` (winner matched the current skill bundle byte-for-byte)`);
      }
    }
  } else {
    runNotes.push(`- promoted: \`none\` (${verifiedPromotion.reason})`);
  }

  if (verifiedPromotion.winner && verifiedPromotion.winner.total > 0 && verifiedPromotion.winner.majorityPasses === verifiedPromotion.winner.total && options.raiseRequestsTo > options.requests) {
      const raisedConfigPath = path.resolve(configRoot, `compare-${options.raiseRequestsTo}r.yaml`);
    const raisedEvaluation = await evaluateProfiles(candidatesForEvaluation.filter((candidate) => [verifiedPromotion.winner.profileId, bestIncumbent?.profileId].includes(candidate.id)), {
      requests: options.raiseRequestsTo,
      repeats: options.verificationRepeats,
      maxConcurrency: options.maxConcurrency,
      configPath: raisedConfigPath,
      variantIds: options.verificationVariants,
    });
    const raisedScoreboard = raisedEvaluation.scoreboard;
    runNotes.push("");
    runNotes.push(`## Raised requests`);
    runNotes.push("");
    for (let repeatIndex = 0; repeatIndex < raisedEvaluation.runs.length; repeatIndex += 1) {
      runNotes.push(`- compare dir ${repeatIndex + 1}: \`${toForwardSlash(raisedEvaluation.runs[repeatIndex].compareDir)}\``);
    }
    for (const [profileId, score] of Object.entries(raisedScoreboard)) {
      runNotes.push(
        `- ${profileId}: \`majority ${score.majorityPasses}/${score.total}\`, \`avg ${score.averagePasses.toFixed(2)}/${score.total}\`, \`wins ${score.winCount}\`, \`agreement ${score.majorityAgreement.toFixed(2)}\``,
      );
    }
  } else {
    runNotes.push(`- raised requests: skipped`);
  }
}

await writeFile(reportPath, `${runNotes.join("\n")}\n`);
console.log(`Wrote ${reportPath}`);

function printHelp() {
  console.log(`
Usage: node evaluations/zx-example-author/scripts/evolve-skill.mjs [options]

Options:
  --dry-run
  --mutate-only
  --evaluate-only
  --mutators codex,copilot,pi
  --requests <n>
  --raise-requests-to <n>
  --repeats <n>
  --playoff-repeats <n>
  --verification-repeats <n>
  --finalist-count <n>
  --promotion-margin <n>
  --promotion-average-margin <n>
  --screening-variants codex-mini
  --playoff-variants codex-mini
  --verification-variants codex-mini,gpt-5-4
  --max-concurrency <n>
  --no-stabilized-candidate
  --help
`.trim());
}

function toForwardSlash(value) {
  return value.replaceAll("\\", "/");
}

function parseCsvArg(value, fallback) {
  const items = (value ?? "").split(",").map((item) => item.trim()).filter(Boolean);
  return items.length ? items : fallback;
}

async function assertReadable(targetPath) {
  await access(targetPath, constants.R_OK);
}

function buildMutationPrompt(candidate) {
  return [
    promptText,
    "",
    `Assigned candidate folder: ${toForwardSlash(candidate.candidateDir)}`,
    `Mutator id: ${candidate.id}`,
  ]
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function runMutator(candidate) {
  const { command, buildArgs } = mutatorCatalog[candidate.mutator];
  const prompt = buildMutationPrompt(candidate);
  const argsForRun = buildArgs(prompt);
  const outputChunks = [];
  const errorChunks = [];

  const commandLine = [`& ${escapePowerShellArgument(command)}`, ...argsForRun.map(escapePowerShellArgument)].join(" ");
  const child = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", commandLine], {
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
  });

  child.stdout.on("data", (chunk) => outputChunks.push(chunk));
  child.stderr.on("data", (chunk) => errorChunks.push(chunk));

  const promise = new Promise((resolve) => {
    child.on("exit", async (code) => {
      const stdoutText = Buffer.concat(outputChunks).toString("utf8");
      const stderrText = Buffer.concat(errorChunks).toString("utf8");
      await writeFile(
        candidate.logPath,
        [
          `# ${candidate.id}`,
          ``,
          `## command`,
          ``,
          `- exe: powershell.exe`,
          `- args: ${JSON.stringify(["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", commandLine])}`,
          ``,
          `## stdout`,
          ``,
          stdoutText || "(empty)",
          ``,
          `## stderr`,
          ``,
          stderrText || "(empty)",
          ``,
        ].join("\n"),
      );

      resolve({
        id: candidate.id,
        status: code === 0 ? "ok" : "failed",
        error: code === 0 ? "" : `exit ${code}`,
      });
    });
  });

  return { id: candidate.id, promise };
}

async function buildCompareConfig(candidates, requests, maxConcurrency, variantIds = options.verificationVariants) {
  let yamlText = await readFile(baseComparePath, "utf8");

  // Keep the benchmark shape fixed and only swap the load settings for this run.
  yamlText = yamlText.replace(/^  requests: \d+/m, `  requests: ${requests}`);
  yamlText = yamlText.replace(/^  maxConcurrency: \d+/m, `  maxConcurrency: ${maxConcurrency}`);

  const candidateProfiles = candidates
    .map((candidate) => [
      `    - id: ${candidate.id}`,
      `      description: Workspace overlay with ${candidate.mutator} mutated zx-example-author skill.`,
      `      isolation:`,
      `        inheritSystem: false`,
      `      capabilities:`,
      `        skills:`,
      `          - source:`,
      `              type: local-path`,
      `              path: ${toForwardSlash(candidate.candidateDir)}`,
      `              skillId: zx-example-author`,
      `            install:`,
      `              strategy: workspace-overlay`,
      `      output:`,
      `        tags:`,
      `          - skill`,
      `          - evolved`,
      `          - ${candidate.mutator}`,
      `        labels:`,
      `          skill_state: ${candidate.id}`,
    ].join("\n"))
    .join("\n");

  yamlText = yamlText.replace(/^  variants:\n/m, `${candidateProfiles}\n  variants:\n`);
  const selectedVariants = variantIds.map((variantId) => {
    if (!variantCatalog[variantId]) {
      throw new Error(`Unsupported variant: ${variantId}`);
    }
    return variantCatalog[variantId];
  }).join("\n");
  yamlText = yamlText.replace(/  variants:\n[\s\S]*$/m, `  variants:\n${selectedVariants}\n`);
  return yamlText;
}

async function materializeBlendedCandidate(candidate) {
  const currentSkillText = await readFile(path.resolve(baseSkillDir, "SKILL.md"), "utf8");
  const tracedSkillText = await readFile(path.resolve(tracedSkillDir, "SKILL.md"), "utf8");
  const stabilizedSkillText = candidate.id === "candidate-scaffold-traced"
    ? buildScaffoldTracedBlend(currentSkillText, tracedSkillText)
    : buildStabilizedSkillText(currentSkillText, tracedSkillText);
  await writeFile(path.resolve(candidate.candidateDir, "SKILL.md"), stabilizedSkillText);
  await writeFile(
    candidate.logPath,
    [
      `# ${candidate.id}`,
      ``,
      `## strategy`,
      ``,
      candidate.id === "candidate-scaffold-traced"
        ? `Merged scaffold-first defaults with traced guardrails and explicit anti-drift checks.`
        : `Merged current skill bundle with traced-evolution guardrails to reduce literal drift while keeping scaffold-first behavior stable.`,
      ``,
    ].join("\n"),
  );
}

async function evaluateProfiles(candidates, evaluationOptions) {
  const compareConfig = await buildCompareConfig(candidates, evaluationOptions.requests, evaluationOptions.maxConcurrency, evaluationOptions.variantIds);
  await writeFile(evaluationOptions.configPath, compareConfig);
  const runs = [];

  for (let repeatIndex = 0; repeatIndex < evaluationOptions.repeats; repeatIndex += 1) {
    runs.push(await runEvaluation(evaluationOptions.configPath));
  }

  const parsedRuns = await Promise.all(
    runs.map(async (run) => ({
      compareDir: run.compareDir,
      ...(await readMatrixResults(run.compareDir)),
    })),
  );

  return {
    runs: parsedRuns,
    scoreboard: aggregateScoreboards(parsedRuns),
  };
}

async function runEvaluation(compareConfigPath) {
  const before = new Set(await currentCompareRuns());
  const commandLine = [
    "& npx",
    escapePowerShellArgument("."),
    escapePowerShellArgument("evaluate"),
    escapePowerShellArgument(compareConfigPath),
  ].join(" ");
  const child = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", commandLine], {
    cwd: skillArenaRoot,
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
  });

  const outputChunks = [];
  const errorChunks = [];
  child.stdout.on("data", (chunk) => outputChunks.push(chunk));
  child.stderr.on("data", (chunk) => errorChunks.push(chunk));

  const exitCode = await new Promise((resolve) => child.on("exit", resolve));
  const stdoutText = Buffer.concat(outputChunks).toString("utf8");
  const stderrText = Buffer.concat(errorChunks).toString("utf8");

  if (exitCode !== 0) {
    throw new Error(`Evaluation failed for ${compareConfigPath}\n${stdoutText}\n${stderrText}`);
  }

  const after = await currentCompareRuns();
  const newRuns = after.filter((runPath) => !before.has(runPath)).sort();
  const compareDir = newRuns.find((runPath) => runPath.endsWith("-compare"));

  if (!compareDir) {
    throw new Error(`Unable to locate compare directory for ${compareConfigPath}`);
  }

  return { compareDir, stdoutText, stderrText };
}

async function currentCompareRuns() {
  const resultsRoot = path.resolve(skillArenaRoot, "results", "zx-example-author-compare");
  const entries = await readdir(resultsRoot, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.resolve(resultsRoot, entry.name));
}

async function readMatrixResults(compareDir) {
  const reportPath = path.resolve(compareDir, "merged", "report.md");
  const reportText = await readFile(reportPath, "utf8");
  const lines = reportText.split(/\r?\n/);
  const headerLine = lines.find((line) => line.startsWith("| Prompt | Agent/Config |"));

  if (!headerLine) {
    throw new Error(`Unable to parse report header from ${reportPath}`);
  }

  const columns = headerLine
    .split("|")
    .slice(1, -1)
    .map((value) => value.trim());
  const profileIds = columns.slice(2);
  const scoreboard = Object.fromEntries(profileIds.map((profileId) => [profileId, { passes: 0, total: 0 }]));
  const cellResults = Object.fromEntries(profileIds.map((profileId) => [profileId, {}]));

  for (const line of lines) {
    if (!line.startsWith("| Create ")) {
      continue;
    }

    const cells = line
      .split("|")
      .slice(1, -1)
      .map((value) => value.trim());
    const rowKey = `${cells[0]} || ${cells[1]}`;

    for (let index = 2; index < cells.length; index += 1) {
      const match = cells[index].match(/(\d+)\/(\d+)/);
      if (!match) {
        continue;
      }

      const profileId = profileIds[index - 2];
      const passes = Number(match[1]);
      const total = Number(match[2]);
      scoreboard[profileId].passes += passes;
      scoreboard[profileId].total += total;
      cellResults[profileId][rowKey] = passes === total && total > 0;
    }
  }

  return { scoreboard, cellResults };
}

function pickWinner(scoreboard) {
  const ordered = Object.entries(scoreboard)
    .map(([profileId, score]) => ({ profileId, ...score }))
    .sort((left, right) => {
      if (right.majorityPasses !== left.majorityPasses) return right.majorityPasses - left.majorityPasses;
      if (right.averagePasses !== left.averagePasses) return right.averagePasses - left.averagePasses;
      return right.winCount - left.winCount;
    });

  return ordered[0] ?? null;
}

function aggregateScoreboards(parsedRuns) {
  const profileIds = Object.keys(parsedRuns[0]?.scoreboard ?? {});
  const aggregate = Object.fromEntries(
    profileIds.map((profileId) => [
      profileId,
      {
        majorityPasses: 0,
        averagePasses: 0,
        total: parsedRuns[0].scoreboard[profileId].total,
        winCount: 0,
        majorityAgreement: 0,
      },
    ]),
  );

  const rowKeys = new Set();
  for (const run of parsedRuns) {
    for (const profileId of profileIds) {
      for (const rowKey of Object.keys(run.cellResults[profileId])) {
        rowKeys.add(rowKey);
      }
    }
  }

  for (const profileId of profileIds) {
    let totalPasses = 0;
    for (const run of parsedRuns) {
      totalPasses += run.scoreboard[profileId].passes;
    }
    aggregate[profileId].averagePasses = totalPasses / parsedRuns.length;

    for (const rowKey of rowKeys) {
      let positiveCount = 0;
      for (const run of parsedRuns) {
        if (run.cellResults[profileId][rowKey]) {
          positiveCount += 1;
        }
      }
      if (positiveCount > parsedRuns.length / 2) {
        aggregate[profileId].majorityPasses += 1;
      }
      aggregate[profileId].majorityAgreement += Math.abs((positiveCount / parsedRuns.length) - 0.5) * 2;
    }
    aggregate[profileId].majorityAgreement /= Math.max(1, rowKeys.size);
  }

  for (const run of parsedRuns) {
    const roundWinner = Object.entries(run.scoreboard)
      .map(([profileId, score]) => ({ profileId, ...score }))
      .sort((left, right) => {
        if (right.passes !== left.passes) return right.passes - left.passes;
        return right.total - left.total;
      })[0];

    if (roundWinner) {
      aggregate[roundWinner.profileId].winCount += 1;
    }
  }

  return aggregate;
}

function shortlistProfiles(scoreboard, finalistCount) {
  return Object.entries(scoreboard)
    .map(([profileId, score]) => ({ profileId, ...score }))
    .sort((left, right) => {
      if (right.majorityPasses !== left.majorityPasses) return right.majorityPasses - left.majorityPasses;
      if (right.averagePasses !== left.averagePasses) return right.averagePasses - left.averagePasses;
      if (right.winCount !== left.winCount) return right.winCount - left.winCount;
      return right.majorityAgreement - left.majorityAgreement;
    })
    .slice(0, finalistCount)
    .map((entry) => entry.profileId);
}

function bestIncumbentScore(scoreboard) {
  return ["skill", "skill-evolution", "skill-traced-evolution"]
    .filter((profileId) => scoreboard[profileId])
    .map((profileId) => ({ profileId, ...scoreboard[profileId] }))
    .sort((left, right) => {
      if (right.majorityPasses !== left.majorityPasses) return right.majorityPasses - left.majorityPasses;
      if (right.averagePasses !== left.averagePasses) return right.averagePasses - left.averagePasses;
      if (right.winCount !== left.winCount) return right.winCount - left.winCount;
      return right.majorityAgreement - left.majorityAgreement;
    })[0] ?? null;
}

function decidePromotion(winner, incumbent, decisionOptions) {
  if (!winner) {
    return { promote: false, reason: "no playoff winner" };
  }

  if (!winner.profileId.startsWith("candidate-")) {
    return { promote: false, reason: `incumbent ${winner.profileId} stayed on top` };
  }

  if (!incumbent) {
    return { promote: true, reason: "no incumbent score available" };
  }

  const majorityDelta = winner.majorityPasses - incumbent.majorityPasses;
  const averageDelta = winner.averagePasses - incumbent.averagePasses;

  if (majorityDelta < decisionOptions.promotionMargin) {
    if (majorityDelta === 0 && averageDelta >= decisionOptions.promotionAverageMargin && winner.majorityAgreement > incumbent.majorityAgreement) {
      return { promote: true, reason: "candidate won on average score and agreement after a majority tie" };
    }
    return {
      promote: false,
      reason: `candidate stayed too close to incumbent ${incumbent.profileId} (majority delta ${majorityDelta}, avg delta ${averageDelta.toFixed(2)})`,
    };
  }

  return { promote: true, reason: `candidate cleared incumbent ${incumbent.profileId}` };
}

function buildStabilizedSkillText(currentSkillText, tracedSkillText) {
  let merged = tracedSkillText;

  merged = merged.replace(
    /- `hello-cop`\r?\n- `gh-involved-repos`/,
    "- `hello-name`\n- `hello-cop`\n- `gh-involved-repos`",
  );

  merged = merged.replace(
    "Use this shape when the example needs user input or a tiny argument-driven flow.\n",
    [
      "Use this shape when the example needs user input or a tiny argument-driven flow.",
      "",
      "- Prefer the local scaffold at `scripts/scaffold-example.mjs` for supported variants such as `hello-name`.",
      "- Preserve the scaffolded `process.argv.slice(3)`, `question(\"Name: \")`, and `echo hello ${name}` shape unless the prompt explicitly changes it.",
      "",
    ].join("\n"),
  );

  merged = merged.replace(
    "- If the prompt implies `tool -p ... --model ...`, do not replace it with another CLI form unless the user explicitly requests the change.",
    "- When the request names a literal command shape, keep that command shape instead of swapping to a nearby equivalent subcommand.",
  );

  merged = merged.replace(
    "- For Copilot or similar assistant CLIs, keep the example as a minimal wrapper around one prompt command, usually `tool -p <short prompt> --model <model>`.",
    "- For Copilot or similar assistant CLIs, keep the example as a minimal wrapper around one prompt command, usually `tool -p <short prompt> --model <model>`, and do not replace that with a different subcommand unless the request explicitly does so.",
  );

  // Keep the current metadata exactly as installed while using the traced guardrails as the body.
  return merged.replace(
    /^---[\s\S]*?---/,
    currentSkillText.match(/^---[\s\S]*?---/)?.[0] ?? tracedSkillText.match(/^---[\s\S]*?---/)?.[0] ?? "",
  );
}

function buildScaffoldTracedBlend(currentSkillText, tracedSkillText) {
  let merged = buildStabilizedSkillText(currentSkillText, tracedSkillText);

  merged = merged.replace(
    "3. If the request matches a supported scaffold, run the local scaffold immediately and treat its output as the default answer shape.",
    "3. If the request matches a supported scaffold, run the local scaffold immediately and treat its output as a locked draft unless the prompt clearly requires a delta.",
  );

  merged = merged.replace(
    "- preserve scaffolded helper names and import paths",
    [
      "- preserve scaffolded helper names and import paths",
      "- after editing a scaffolded file, re-check the named literals before finishing",
    ].join("\n"),
  );

  merged = merged.replace(
    "Reject the draft and rewrite it when any of these appear:",
    "Reject the draft and rewrite it when any of these appear. Treat this as a reflection pass before finishing:",
  );

  return merged;
}

function escapePowerShellArgument(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

async function directoriesMatch(leftDir, rightDir) {
  const leftEntries = await listFiles(leftDir);
  const rightEntries = await listFiles(rightDir);

  if (leftEntries.length !== rightEntries.length) {
    return false;
  }

  for (let index = 0; index < leftEntries.length; index += 1) {
    if (leftEntries[index] !== rightEntries[index]) {
      return false;
    }

    const leftContent = await readFile(path.resolve(leftDir, leftEntries[index]), "utf8");
    const rightContent = await readFile(path.resolve(rightDir, rightEntries[index]), "utf8");

    if (leftContent !== rightContent) {
      return false;
    }
  }

  return true;
}

async function listFiles(rootDir) {
  const files = [];
  const queue = [rootDir];

  while (queue.length) {
    const currentDir = queue.pop();
    const entries = await readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const absolutePath = path.resolve(currentDir, entry.name);
      const relativePath = path.relative(rootDir, absolutePath).replaceAll("\\", "/");

      if (entry.isDirectory()) {
        queue.push(absolutePath);
        continue;
      }

      files.push(relativePath);
    }
  }

  return files.sort();
}
