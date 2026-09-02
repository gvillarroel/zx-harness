#!/usr/bin/env node

import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const [evaluationInput, ...options] = process.argv.slice(2);
let selectedCandidate = "";
let developmentArchive = "";
for (let index = 0; index < options.length; index += 1) {
  if (options[index] === "--selected" && options[index + 1] && !selectedCandidate) {
    selectedCandidate = options[index + 1];
    index += 1;
  } else if (options[index] === "--development-archive" && options[index + 1] && !developmentArchive) {
    developmentArchive = resolve(options[index + 1]);
    index += 1;
  } else {
    throw new Error(`Unknown or incomplete option: ${options[index]}`);
  }
}
if (!evaluationInput) {
  throw new Error(
    "Usage: node configure-harbor-search.mjs <evaluation-root> [--selected baseline --development-archive <archive.json>]",
  );
}
if (Boolean(selectedCandidate) !== Boolean(developmentArchive)) {
  throw new Error("--selected and --development-archive must be provided together.");
}

const evaluation = resolve(evaluationInput);
const searchId = basename(evaluation);
if (!/^[a-z0-9][a-z0-9-]{1,80}$/.test(searchId)) throw new Error(`Evaluation directory is not a portable search ID: ${searchId}`);
const skillRoot = fileURLToPath(new URL("..", import.meta.url));
const developmentRoot = resolve(evaluation, "datasets", "development");
const validationRoot = resolve(evaluation, "datasets", "validation");
const configRoot = resolve(evaluation, "search-config");
const outputRoot = resolve(evaluation, "pareto-output");
const jobsRoot = resolve(evaluation, "native-jobs");
for (const path of [developmentRoot, validationRoot]) {
  if (!(await stat(path).catch(() => null))?.isDirectory()) throw new Error(`Dataset is missing: ${path}`);
}
await mkdir(configRoot, { recursive: true });

// Use generic registered directory IDs only; this script never opens sealed validation task content.
const taskPaths = async (root) =>
  (await readdir(root, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => resolve(root, entry.name))
    .sort();
const runtimePath = (path) => {
  const normalized = resolve(path).replaceAll("\\", "/");
  const drive = normalized.match(/^([A-Za-z]):\/(.*)$/);
  return process.platform === "win32" && drive
    ? `/mnt/${drive[1].toLowerCase()}/${drive[2]}`
    : normalized;
};

const agent = {
  name: "zx-repository-issue-workflow",
  import_path: "scripts.repository_issue_agent:RepositoryIssueWorkflowAgent",
  model_name: "fixture/runtime-pi",
  skills: [runtimePath(skillRoot)],
};
const job = (name, tasks) => ({
  job_name: name,
  jobs_dir: runtimePath(jobsRoot),
  n_attempts: 1,
  n_concurrent_trials: 1,
  quiet: false,
  retry: { max_retries: 0 },
  environment: { type: "docker", delete: true },
  agents: [agent],
  tasks: tasks.map((path) => ({ path: runtimePath(path) })),
});
const developmentJob = resolve(configRoot, "development-job.json");
const validationJob = resolve(configRoot, "validation-job.json");
await writeFile(
  developmentJob,
  `${JSON.stringify(job("repository-issue-development-template", await taskPaths(developmentRoot)), null, 2)}\n`,
);
await writeFile(
  validationJob,
  `${JSON.stringify(job("repository-issue-validation-template", await taskPaths(validationRoot)), null, 2)}\n`,
);

// JSON is valid YAML and keeps the search profile exact without adding a parser dependency.
const search = {
  schemaVersion: 1,
  search: {
    id: searchId,
    baselineSkill: runtimePath(skillRoot),
    baselineCandidate: "baseline",
    outputDir: runtimePath(outputRoot),
    generation: 0,
    ...(selectedCandidate
      ? {
          selectedCandidate,
          developmentArchive: runtimePath(developmentArchive),
        }
      : {}),
  },
  harbor: {
    developmentJob: runtimePath(developmentJob),
    holdoutJob: runtimePath(validationJob),
    rewardKey: "reward",
    passThreshold: 1,
    requiredRewards: {
      runtime_agent: 1,
      functional: 1,
      routing: 1,
      skill_selection: 1,
      isolation: 1,
    },
    requiredEnv: [],
  },
  candidates: [
    {
      id: "baseline",
      skill: runtimePath(skillRoot),
      parents: [],
      rationale: "Frozen generation-zero repository issue workflow.",
    },
  ],
  promotion: {
    minimumMeanGain: 0,
    allowCaseRegressions: false,
    requireNoErrors: true,
  },
};
const searchPath = resolve(configRoot, "search.json");
await writeFile(searchPath, `${JSON.stringify(search, null, 2)}\n`);
console.log(
  JSON.stringify(
    {
      search: searchPath,
      developmentJob,
      validationJob,
      selectedCandidate: selectedCandidate || null,
      validationContentRead: false,
    },
    null,
    2,
  ),
);
