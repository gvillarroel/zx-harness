#!/usr/bin/env zx

import { createHash } from "node:crypto";
import {
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

// Parse only the two explicit inputs so execution never inherits hidden behavior from ambient state.
const flags = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  flags.set(process.argv[index], process.argv[index + 1]);
}
if (!flags.get("--root") || !flags.get("--fixture")) {
  throw new Error("Usage: workflow.mjs --root <project-directory> --fixture <responses.json>");
}

const root = resolve(flags.get("--root"));
const fixturePath = resolve(flags.get("--fixture"));
const config = JSON.parse(await readFile(resolve(root, "workflow.config.json"), "utf8"));
const fixture = JSON.parse(await readFile(fixturePath, "utf8"));

// Reject unsafe or unbounded plans before creating operational state or touching the target.
for (const [name, value] of Object.entries({
  queryFile: config.queryFile,
  output: config.output,
  target: config.target,
  ...Object.fromEntries((config.corpusRoots ?? []).map((value, index) => [`corpusRoot${index}`, value])),
})) {
  if (typeof value !== "string" || !value || isAbsolute(value) || value.split(/[\\/]/).includes("..")) {
    throw new Error(`Unsafe project-relative path for ${name}`);
  }
}
for (const [name, value, maximum] of [
  ["maxFiles", config.maxFiles, 1000],
  ["maxBytesPerFile", config.maxBytesPerFile, 1_000_000],
  ["contextMaxBytes", config.contextMaxBytes, 2_000_000],
  ["topK", config.topK, 100],
  ["attempts", config.attempts, 4],
]) {
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw new Error(`${name} must be an integer from 1 to ${maximum}`);
  }
}
if (
  !Array.isArray(config.corpusRoots) ||
  config.corpusRoots.length === 0 ||
  !config.models?.fast ||
  !config.models?.strong ||
  !Array.isArray(config.targetGate?.contains) ||
  config.targetGate.contains.length === 0 ||
  !Array.isArray(fixture.responses)
) {
  throw new Error("Workflow config or fixture is incomplete");
}
if (typeof fixture.runId !== "string" || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(fixture.runId)) {
  throw new Error("Fixture runId must be a lowercase slug");
}

const inside = (path) => {
  const target = resolve(root, path);
  if (target === root || !target.startsWith(`${root}${sep}`)) {
    throw new Error(`Path escapes project root: ${path}`);
  }
  return target;
};
const queryPath = inside(config.queryFile);
const outputPath = inside(config.output);
const targetPath = inside(config.target);
const runDir = inside(`.zx-evolution/${fixture.runId}`);
if (await stat(runDir).catch(() => null)) {
  throw new Error(`Run already exists: ${fixture.runId}`);
}
await mkdir(runDir, { recursive: true });
const eventPath = resolve(runDir, "events.jsonl");
const events = [];
const record = async (event) => {
  events.push(event);
  await writeFile(eventPath, `${JSON.stringify(event)}\n`, { flag: "a" });
};
await record({ event: "workflow_started", runId: fixture.runId });

// Walk roots in lexical order and stop at the file cap so discovery is stable and bounded.
const files = [];
for (const corpusRoot of [...config.corpusRoots].sort()) {
  const pending = [inside(corpusRoot)];
  while (pending.length > 0 && files.length < config.maxFiles) {
    const current = pending.pop();
    const currentStat = await stat(current).catch(() => null);
    if (!currentStat) {
      continue;
    }
    if (currentStat.isFile()) {
      files.push(current);
      continue;
    }
    if (!currentStat.isDirectory()) {
      continue;
    }
    const entries = (await readdir(current, { withFileTypes: true }))
      .filter((entry) => ![".git", ".zx-evolution", "node_modules"].includes(entry.name))
      .sort((left, right) => right.name.localeCompare(left.name));
    for (const entry of entries) {
      if (!entry.isSymbolicLink()) {
        pending.push(resolve(current, entry.name));
      }
    }
  }
}

// Read bounded byte prefixes, then compute TF-IDF only for query terms to avoid model-token waste.
const query = await readBounded(queryPath, config.maxBytesPerFile);
const queryTerms = [...new Set(tokenize(query))];
const documents = [];
const documentFrequency = new Map();
for (const file of files) {
  const content = await readBounded(file, config.maxBytesPerFile);
  const terms = tokenize(content);
  const counts = new Map();
  for (const term of terms) {
    counts.set(term, (counts.get(term) ?? 0) + 1);
  }
  for (const term of new Set(terms)) {
    documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
  }
  documents.push({
    path: relative(root, file).replaceAll("\\", "/"),
    content,
    counts,
    length: Math.max(1, terms.length),
  });
}
const ranked = documents
  .map((document) => {
    let score = 0;
    for (const term of queryTerms) {
      const tf = (document.counts.get(term) ?? 0) / document.length;
      const idf = Math.log((documents.length + 1) / ((documentFrequency.get(term) ?? 0) + 1)) + 1;
      score += tf * idf;
    }
    return { ...document, score: Number(score.toFixed(8)) };
  })
  .filter((document) => document.score > 0)
  .sort((left, right) => right.score - left.score || left.path.localeCompare(right.path));

// Fill the context in score order without exceeding either top-K or the aggregate byte budget.
const selected = [];
let contextBytes = 0;
for (const document of ranked) {
  if (selected.length >= config.topK || contextBytes >= config.contextMaxBytes) {
    break;
  }
  const remaining = config.contextMaxBytes - contextBytes;
  const content = truncateUtf8(document.content, remaining);
  const bytes = Buffer.byteLength(content);
  if (bytes === 0) {
    continue;
  }
  selected.push({
    path: document.path,
    score: document.score,
    bytes,
    sha256: digest(content),
    content,
  });
  contextBytes += bytes;
}
const context = {
  querySha256: digest(query),
  scannedFiles: files.length,
  totalBytes: contextBytes,
  selected,
};
await writeJson(resolve(runDir, "context.json"), context);
await record({
  event: "context_built",
  scannedFiles: files.length,
  selectedFiles: selected.length,
  totalBytes: contextBytes,
});

// Route deterministic fixture completions through the same bounded retry and feedback state machine.
let accepted;
let acceptedAttempt = 0;
const attempts = [];
let feedback = "";
for (let attempt = 1; attempt <= config.attempts; attempt += 1) {
  const model = attempt === 1 ? config.models.fast : config.models.strong;
  const response = fixture.responses[attempt - 1];
  await record({ event: "model_selected", attempt, model, feedback });
  if (!response || typeof response.content !== "string") {
    feedback = "Fixture response is missing";
  } else {
    const candidatePath = resolve(runDir, "candidates", `candidate-${attempt}.json`);
    await mkdir(resolve(candidatePath, ".."), { recursive: true });
    await writeFile(candidatePath, response.content);
    const result = validateCandidate(response.content);
    if (result.passed) {
      accepted = result.value;
      acceptedAttempt = attempt;
      attempts.push({ attempt, model, candidateSha256: digest(response.content), passed: true });
      await record({ event: "candidate_accepted", attempt, model });
      break;
    }
    feedback = result.feedback;
    if (typeof response.diagnostic === "string" && response.diagnostic) {
      feedback = `${feedback}\n${response.diagnostic}`;
    }
  }
  feedback = redact(feedback);
  attempts.push({
    attempt,
    model,
    candidateSha256: response?.content ? digest(response.content) : null,
    passed: false,
    feedback,
  });
  await record({ event: "attempt_failed", attempt, model, feedback });
}
if (!accepted) {
  await record({ event: "workflow_failed", reason: "candidate_gate", feedback });
  throw new Error(redact(`Candidate gate failed after ${config.attempts} attempt(s): ${feedback}`));
}

// Snapshot exact target bytes, apply the accepted patch, and restore on a terminal post-apply failure.
const original = await readFile(targetPath).catch(() => null);
await mkdir(resolve(targetPath, ".."), { recursive: true });
await writeFile(targetPath, accepted.patch);
const targetContent = await readFile(targetPath, "utf8");
const missingTargetEvidence = config.targetGate.contains.filter((value) => !targetContent.includes(value));
if (missingTargetEvidence.length > 0) {
  if (original === null) {
    await rm(targetPath, { force: true });
  } else {
    await writeFile(targetPath, original);
  }
  const rollbackFeedback = redact(`Missing target evidence: ${missingTargetEvidence.join(", ")}`);
  await record({ event: "stage_rolled_back", target: config.target, feedback: rollbackFeedback });
  throw new Error(rollbackFeedback);
}
await record({ event: "target_gate_passed", target: config.target });

// Promote with an atomic rename only after every candidate and target gate passes.
await mkdir(resolve(outputPath, ".."), { recursive: true });
const temporaryOutput = `${outputPath}.staged-${process.pid}`;
await writeJson(temporaryOutput, accepted);
await rename(temporaryOutput, outputPath);
const manifest = {
  schemaVersion: 1,
  runId: fixture.runId,
  configSha256: digest(JSON.stringify(config)),
  querySha256: digest(query),
  scannedFiles: files.length,
  contextBytes,
  selected: selected.map(({ path, score, bytes, sha256 }) => ({ path, score, bytes, sha256 })),
  attempts,
  acceptedAttempt,
  outputSha256: digest(await readFile(outputPath)),
  targetSha256: digest(await readFile(targetPath)),
};
await writeJson(resolve(runDir, "manifest.json"), manifest);
await record({ event: "workflow_passed", acceptedAttempt });
console.log(`Workflow passed after ${acceptedAttempt} attempt(s)`);

async function readBounded(path, maximumBytes) {
  const handle = await open(path, "r");
  try {
    const buffer = Buffer.alloc(maximumBytes);
    const { bytesRead } = await handle.read(buffer, 0, maximumBytes, 0);
    return buffer.subarray(0, bytesRead).toString("utf8");
  } finally {
    await handle.close();
  }
}

function tokenize(value) {
  return (
    value
      .toLowerCase()
      .normalize("NFKD")
      .replace(/\p{Mark}/gu, "")
      .match(/[\p{Letter}\p{Number}_-]{2,}/gu) ?? []
  );
}

function truncateUtf8(value, maximumBytes) {
  const bytes = Buffer.from(value);
  if (bytes.length <= maximumBytes) {
    return value;
  }
  return bytes.subarray(0, maximumBytes).toString("utf8").replace(/\uFFFD$/u, "");
}

function validateCandidate(content) {
  try {
    const value = JSON.parse(content);
    const missing = [];
    if (typeof value.summary !== "string" || !value.summary.trim()) missing.push("summary");
    if (!["low", "medium", "high"].includes(value.risk)) missing.push("risk");
    if (!Array.isArray(value.tests) || value.tests.length === 0 || value.tests.some((test) => typeof test !== "string")) {
      missing.push("tests");
    }
    if (typeof value.patch !== "string" || !value.patch) missing.push("patch");
    return missing.length
      ? { passed: false, feedback: `Missing or invalid JSON fields: ${missing.join(", ")}` }
      : { passed: true, value };
  } catch (error) {
    return { passed: false, feedback: `Invalid JSON: ${error instanceof Error ? error.message : String(error)}` };
  }
}

function redact(value) {
  return String(value)
    .replace(/(authorization\s*:\s*bearer\s+)[^\s]+/gi, "$1[REDACTED]")
    .replace(/((?:api[_-]?key|token|secret|password)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]")
    .slice(0, 12000);
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function writeJson(path, value) {
  await mkdir(resolve(path, ".."), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}
