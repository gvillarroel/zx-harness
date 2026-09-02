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
  ["discovery", "compact-topic-discovery-a", "graph neural network interpretability", "standard"],
  ["discovery", "compact-topic-discovery-b", "formal verification for autonomous agents", "standard"],
  ["development", "compact-topic-development-a", "naïve Bayes calibration", "unicode"],
  ["development", "compact-topic-development-b", "C++ supply-chain security", "punctuation"],
  ["validation", "compact-topic-validation-a", "release $(printf blocked); safety", "shell-metacharacters"],
  ["validation", "compact-topic-validation-b", "--help is research, not an option", "option-like"],
  ["holdout", "compact-topic-holdout-a", "../../private/secrets are out of scope", "path-like"],
  ["holdout", "compact-topic-holdout-b", "--version migration; $(echo inert)", "option-like"],
];
const harborPath = (path) => {
  const normalized = path.replaceAll("\\", "/");
  const drive = normalized.match(/^([A-Za-z]):\/(.*)$/);
  return drive ? `/mnt/${drive[1].toLowerCase()}/${drive[2]}` : normalized;
};

// Materialize disjoint task identities; the profile changes the hidden risk family, not only the topic.
for (const [cohort, id, topic, profile] of profiles) {
  const target = join(output, "tasks", cohort, id);
  await mkdir(target, { recursive: true });
  await cp(template, target, { recursive: true });
  for (const file of ["instruction.md", "task.toml"]) {
    const path = join(target, file);
    const text = (await readFile(path, "utf8"))
      .replaceAll("__TASK_ID__", id)
      .replaceAll("__TOPIC__", topic)
      .replaceAll("__MAX_SCRIPT_BYTES__", String(MAX_SCRIPT_BYTES))
      .replaceAll("__EVALUATION_PROFILE__", profile);
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

// Emit exact split-local replay contracts so no job can mix optimizer-visible and holdout tasks.
await mkdir(join(output, "jobs"), { recursive: true });
const jobs = [
  ["discovery-baseline.yaml", "topic-harness-discovery-baseline", baselineSkill, "discovery"],
  ["development-baseline.yaml", "topic-harness-development-baseline", baselineSkill, "development"],
  ["development-candidate.yaml", "topic-harness-development-candidate", candidateSkill, "development"],
  ["validation-baseline.yaml", "topic-harness-validation-baseline", baselineSkill, "validation"],
  ["validation-candidate.yaml", "topic-harness-validation-candidate", candidateSkill, "validation"],
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

// Publish the stage graph without task content so orchestration can enforce selection before holdout.
await writeFile(
  join(output, "evaluation-plan.json"),
  `${JSON.stringify(
    {
      schemaVersion: 1,
      comparisonProfile: "topic-harness-size-v1",
      datasets: [
        { id: "discovery-v1", split: "discovery", taskCount: 2 },
        { id: "development-v1", split: "development", taskCount: 2 },
        { id: "validation-v1", split: "validation", taskCount: 2 },
        { id: "holdout-v1", split: "holdout", taskCount: 2, sealedUntil: "candidate-selection" },
      ],
      stages: [
        {
          id: "trace-discovery",
          kind: "baseline",
          ownerSkill: "harbor-run-results",
          datasets: ["discovery-v1"],
          dependsOn: [],
        },
        {
          id: "candidate-development",
          kind: "evolution",
          ownerSkill: "harbor-trace-distillation",
          datasets: ["development-v1"],
          dependsOn: ["trace-discovery"],
        },
        {
          id: "candidate-validation",
          kind: "comparison",
          ownerSkill: "harbor-run-results",
          datasets: ["validation-v1"],
          dependsOn: ["candidate-development"],
        },
        {
          id: "candidate-selection",
          kind: "promotion",
          ownerSkill: "harbor-organize-evaluations",
          datasets: [],
          dependsOn: ["candidate-validation"],
        },
        {
          id: "holdout-gate",
          kind: "holdout",
          ownerSkill: "harbor-run-results",
          datasets: ["holdout-v1"],
          dependsOn: ["candidate-selection"],
        },
      ],
    },
    null,
    2,
  )}\n`,
);
console.log(output);
