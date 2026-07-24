#!/usr/bin/env node

import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const [, , outputInput, baselineInput] = process.argv;
if (!outputInput || !baselineInput) {
  throw new Error(
    "Usage: node prepare-topic-harness-trace.mjs <output-directory> <baseline-skill>",
  );
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const template = resolve(scriptDir, "..", "assets", "harbor", "topic-harness-size");
const output = resolve(outputInput);
const baselineSkill = resolve(baselineInput);
const candidateSkill = join(output, "run", "candidate", "skills", "zx-workflow-author");
const jobsDir = join(output, "harbor-jobs");
const MAX_SCRIPT_BYTES = 7000;
const profiles = [
  ["discovery", "compact-topic-a", "graph neural network interpretability"],
  ["discovery", "compact-topic-b", "formal verification for autonomous agents"],
  ["holdout", "compact-topic-c", "retrieval augmented generation evaluation"],
  ["holdout", "compact-topic-d", "post-quantum cryptography migration"],
];
const harborPath = (path) => {
  const normalized = path.replaceAll("\\", "/");
  const drive = normalized.match(/^([A-Za-z]):\/(.*)$/);
  return drive ? `/mnt/${drive[1].toLowerCase()}/${drive[2]}` : normalized;
};

// Materialize four immutable task identities from one reviewed template.
for (const [cohort, id, topic] of profiles) {
  const target = join(output, "tasks", cohort, id);
  await mkdir(target, { recursive: true });
  await cp(template, target, { recursive: true });
  for (const file of ["instruction.md", "task.toml"]) {
    const path = join(target, file);
    const text = (await readFile(path, "utf8"))
      .replaceAll("__TASK_ID__", id)
      .replaceAll("__TOPIC__", topic)
      .replaceAll("__MAX_SCRIPT_BYTES__", String(MAX_SCRIPT_BYTES));
    await writeFile(path, text);
  }
}

const retry = `retry:
  max_retries: 0
  include_exceptions: []
  exclude_exceptions:
    - ApiUsageLimitError
    - VerifierTimeoutError
    - AgentTimeoutError
    - RewardFileNotFoundError
    - RewardFileEmptyError
    - VerifierOutputParseError
  wait_multiplier: 1
  min_wait_sec: 1
  max_wait_sec: 60`;
const taskLines = (cohort) =>
  profiles
    .filter(([group]) => group === cohort)
    .map(([, id]) => `  - path: "${harborPath(join(output, "tasks", cohort, id))}"`)
    .join("\n");
const job = (name, skill, cohort) => `job_name: "${name}"
jobs_dir: "${harborPath(jobsDir)}"
n_attempts: 1
n_concurrent_trials: 2
quiet: false
${retry}
environment:
  type: docker
  delete: true
agents:
  - name: oracle
    n_concurrent: 2
    skills:
      - "${harborPath(skill)}"
tasks:
${taskLines(cohort)}
`;

// Emit exact baseline/candidate replay contracts; only the injected skill and job identity differ.
await mkdir(join(output, "jobs"), { recursive: true });
const jobs = [
  ["discovery-baseline.yaml", "topic-harness-discovery-baseline", baselineSkill, "discovery"],
  ["development-candidate.yaml", "topic-harness-development-candidate", candidateSkill, "discovery"],
  ["holdout-baseline.yaml", "topic-harness-holdout-baseline", baselineSkill, "holdout"],
  ["holdout-candidate.yaml", "topic-harness-holdout-candidate", candidateSkill, "holdout"],
];
for (const [file, name, skill, cohort] of jobs) {
  await writeFile(join(output, "jobs", file), job(name, skill, cohort));
}

// Publish the measured byte cap for proposal authors and audit tooling.
await writeFile(
  join(output, "objective.json"),
  `${JSON.stringify(
    {
      MAX_SCRIPT_BYTES,
      rewardKey: "script_size_negative",
      definition: "script_size_negative = -script_size_bytes",
    },
    null,
    2,
  )}\n`,
);
console.log(output);
