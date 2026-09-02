#!/usr/bin/env node

import { spawn } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, delimiter, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const skillDir = fileURLToPath(new URL("..", import.meta.url));
const repoRoot = resolve(skillDir, "..", "..");
const agentName = "zx-prompt-solver";
const modelProfiles = {
  luna: {
    identity: "gpt-5.6-luna",
    route: "openrouter/openai/gpt-5.6-luna",
    reasoningEffort: "medium",
    maxOutputTokens: 16000,
  },
  sol: {
    identity: "gpt-5.6-sol",
    route: "openrouter/openai/gpt-5.6-sol",
    reasoningEffort: "max",
    maxOutputTokens: 32000,
  },
  custom: {
    reasoningEffort: null,
    maxOutputTokens: 4096,
  },
};
const values = new Map();
const flags = new Set();
for (let index = 2; index < process.argv.length; index += 1) {
  // Parse a deliberately small CLI surface and reject ambiguous positional input.
  const name = process.argv[index];
  if (["--oracle", "--power", "--print-config", "--self-test", "--help"].includes(name)) {
    flags.add(name);
    continue;
  }
  if (!["--dataset", "--task", "--model", "--job-name"].includes(name) || index + 1 >= process.argv.length) {
    throw new Error(`Unknown or incomplete option: ${name}`);
  }
  values.set(name, process.argv[index + 1]);
  index += 1;
}
if (flags.has("--help")) {
  console.log(
    "Usage: node run-terminal-bench.mjs [--dataset package@version|path] [--task pattern] " +
      "[--oracle | --power | --model provider/model] [--job-name slug] [--print-config]",
  );
  process.exit(0);
}
if (flags.has("--self-test")) {
  // Cover Harbor's canonical package task IDs without resolving or downloading a dataset.
  const cases = [
    ["terminal-bench/terminal-bench@latest", "cli-2ph-simplex", "terminal-bench/cli-2ph-simplex"],
    ["terminal-bench/terminal-bench@latest", "terminal-bench/cli-2ph-simplex", "terminal-bench/cli-2ph-simplex"],
    ["benchflow/skillsbench@latest", "dialogue-parser", "benchflow/dialogue-parser"],
    ["terminal-bench-pro/terminal-bench-pro@latest", "polyglot-text-stats-script", "terminal-bench-pro/polyglot-text-stats-script"],
  ];
  for (const [datasetName, input, expected] of cases) {
    if (canonicalTaskName(datasetName, input) !== expected) throw new Error(`Task normalization failed for ${input}`);
  }
  const modelCases = [
    ["openrouter/openai/gpt-5.6-luna", "gpt-5.6-luna"],
    ["openrouter/openai/gpt-oss-120b:free", "gpt-oss-120b:free"],
    ["openrouter/minimax/minimax-m2.7:free", "minimax/minimax-m2.7:free"],
    ["openai/gpt-5.6-sol", "gpt-5.6-sol"],
    ["provider/custom-model", "provider/custom-model"],
  ];
  for (const [route, expected] of modelCases) {
    if (canonicalModelIdentity(route) !== expected) throw new Error(`Model normalization failed for ${route}`);
  }
  if (modelProfiles.luna.route !== "openrouter/openai/gpt-5.6-luna") throw new Error("Luna is not the default");
  if (modelProfiles.sol.route !== "openrouter/openai/gpt-5.6-sol") throw new Error("Sol escalation is missing");
  if (modelProfiles.luna.reasoningEffort !== "medium" || modelProfiles.luna.maxOutputTokens !== 16000) {
    throw new Error("Luna default profile drifted");
  }
  if (modelProfiles.sol.reasoningEffort !== "max" || modelProfiles.sol.maxOutputTokens !== 32000) {
    throw new Error("Sol power profile drifted");
  }
  if (modelProfiles.custom.reasoningEffort !== null || modelProfiles.custom.maxOutputTokens !== 4096) {
    throw new Error("Explicit model profile drifted");
  }
  if (
    ![
      "openrouter/free",
      "openrouter/auto",
      "openrouter/openrouter/free",
      "openrouter/openrouter/auto",
    ].every(isRouterAlias)
  ) {
    throw new Error("Unpinned OpenRouter aliases must be rejected");
  }
  if (isRouterAlias("openrouter/minimax/minimax-m2.7:free")) {
    throw new Error("Exact OpenRouter models must remain available");
  }
  const passingResult = summarizeResult({
    finished_at: "2026-09-02T00:00:00Z",
    n_total_trials: 1,
    stats: {
      n_completed_trials: 1,
      n_errored_trials: 0,
      n_running_trials: 0,
      n_pending_trials: 0,
      n_cancelled_trials: 0,
      evals: { smoke: { n_trials: 1, metrics: [{ mean: 1 }] } },
    },
  });
  if (passingResult.rewardMean !== 1 || passingResult.nEvaluableTrials !== 1) {
    throw new Error("Completed Harbor result summary failed");
  }
  const erroredResult = summarizeResult({
    finished_at: "2026-09-02T00:00:00Z",
    n_total_trials: 1,
    stats: {
      n_completed_trials: 1,
      n_errored_trials: 1,
      n_running_trials: 0,
      n_pending_trials: 0,
      n_cancelled_trials: 0,
      evals: { smoke: { n_trials: 0, metrics: [{ mean: 0 }] } },
    },
  });
  if (erroredResult.nErroredTrials !== 1 || erroredResult.rewardMean !== null) {
    throw new Error("Errored Harbor result must remain non-evaluable");
  }
  if (deliveryFailure(passingResult, true) || deliveryFailure({ ...passingResult, rewardMean: 0 }, false)) {
    throw new Error("Valid solver and oracle results must remain successful");
  }
  if (!deliveryFailure({ ...passingResult, rewardMean: 0 }, true) || !deliveryFailure(erroredResult, false)) {
    throw new Error("Errored trials and failed oracle preflights must fail delivery");
  }
  if (agentName !== "zx-prompt-solver") throw new Error("Harbor agent identity is unstable");
  const localInputs = workloadInputs("/tmp/local-task");
  if (!localInputs.tasks || localInputs.datasets) throw new Error("Local paths must use Harbor tasks");
  const remoteInputs = workloadInputs(null, { name: "org/dataset", version: "latest" });
  if (!remoteInputs.datasets || remoteInputs.tasks) throw new Error("Remote packages must use Harbor datasets");
  console.log("Harbor task and model profile normalization passed.");
  process.exit(0);
}

const datasetInput = values.get("--dataset") ?? "terminal-bench/terminal-bench-2@latest";
const oracleMode = flags.has("--oracle");
if (flags.has("--power") && values.has("--model")) {
  throw new Error("Use either --power or --model, not both");
}
if (oracleMode && (flags.has("--power") || values.has("--model"))) {
  throw new Error("Oracle preflight cannot select a generator model");
}
const profileName = values.has("--model") ? "custom" : flags.has("--power") ? "sol" : "luna";
const profile = modelProfiles[profileName];
const generatorModel = values.get("--model") ?? profile.route;
const modelIdentity = values.has("--model") ? canonicalModelIdentity(generatorModel) : profile.identity;
const generatedName = `zx-prompt-solver-${new Date().toISOString().replace(/\D/g, "").slice(0, 17)}-${process.pid}`;
const jobName = values.get("--job-name") ?? generatedName;
if (!/^[a-z0-9][a-z0-9-]{1,80}$/.test(jobName)) {
  throw new Error("Job name must be a 2-81 character lowercase slug");
}
if (!/^[a-z0-9][a-z0-9._/:-]*$/i.test(generatorModel)) {
  throw new Error("Model must be a provider/model identifier");
}
if (isRouterAlias(generatorModel)) {
  throw new Error("OpenRouter aliases are not reproducible; use an exact provider/model route");
}
if (!/^[a-z0-9][a-z0-9._/:-]*$/i.test(modelIdentity)) {
  throw new Error("Canonical model identity is invalid");
}

const temporaryRoot = resolve(repoRoot, ".tmp", "harbor");
const jobsRoot = resolve(temporaryRoot, "jobs");
const datasetsRoot = resolve(temporaryRoot, "datasets");
const configsRoot = resolve(temporaryRoot, "configs");
const jobDir = resolve(jobsRoot, jobName);
if (!flags.has("--print-config") && (await stat(jobDir).catch(() => null))) {
  throw new Error(`Harbor evidence directory already exists: ${jobDir}`);
}
await mkdir(configsRoot, { recursive: true });
await mkdir(datasetsRoot, { recursive: true });

// Resolve Windows paths before writing the config because Harbor and Docker run inside WSL there.
const harborPath = (path) => {
  const normalized = path.replaceAll("\\", "/");
  const drive = normalized.match(/^([A-Za-z]):\/(.*)$/);
  return drive ? `/mnt/${drive[1].toLowerCase()}/${drive[2]}` : normalized;
};
const runtimePath = process.platform === "win32" ? harborPath : (path) => path;
const localRoot = resolve(process.cwd(), datasetInput);
const localDataset = await stat(localRoot).catch(() => null);
let workload;
if (localDataset?.isDirectory()) {
  // Harbor 0.18 resolves local task paths through `tasks`, not dataset descriptors.
  let taskPath = localRoot;
  if (values.has("--task")) {
    const leaf = values.get("--task").split("/").at(-1);
    if (basename(localRoot) !== leaf) {
      const nested = resolve(localRoot, leaf);
      if (!(await stat(nested).catch(() => null))?.isDirectory()) {
        throw new Error(`Local task not found: ${nested}`);
      }
      taskPath = nested;
    }
  }
  workload = workloadInputs(runtimePath(taskPath));
} else {
  const marker = datasetInput.lastIndexOf("@");
  const slash = datasetInput.lastIndexOf("/");
  const name = marker > slash ? datasetInput.slice(0, marker) : datasetInput;
  const version = marker > slash ? datasetInput.slice(marker + 1) : undefined;
  if (!name.includes("/") || !version) {
    throw new Error("Remote dataset must use the package@version form");
  }
  const dataset = {
    name,
    version,
    download_dir: runtimePath(datasetsRoot),
  };
  if (values.has("--task")) dataset.task_names = [canonicalTaskName(datasetInput, values.get("--task"))];
  else dataset.n_tasks = 1;
  workload = workloadInputs(null, dataset);
}

// Freeze one task, one attempt, one model call, zero Harbor retries, and repository-local evidence paths.
const configPath = resolve(configsRoot, `${jobName}.json`);
const config = {
  job_name: jobName,
  jobs_dir: runtimePath(jobsRoot),
  n_attempts: 1,
  n_concurrent_trials: 1,
  quiet: false,
  retry: { max_retries: 0 },
  environment: { type: "docker", delete: true },
  // Omitting agents invokes the task-owned oracle before any prompt-solver evaluation spends tokens.
  ...(oracleMode
    ? {}
    : {
        agents: [
          {
            name: agentName,
            import_path: "scripts.prompt_skill_agent:PromptSkillAgent",
            model_name: modelIdentity,
            // Bind the exact compiler bundle into Harbor's lock and inject its contract into the task image.
            skills: [runtimePath(skillDir)],
            kwargs: {
              generator_model_name: generatorModel,
              max_output_tokens: profile.maxOutputTokens,
              max_script_bytes: 8192,
              generator_timeout_sec: 1800,
              script_timeout_sec: 600,
              reasoning_effort: profile.reasoningEffort,
            },
          },
        ],
      }),
  ...workload,
};
await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, { flag: "wx" });

// Select one pinned Harbor executable; Windows reuses the repository's existing WSL Docker runtime.
let command = "uvx";
let prefix = ["--from", "harbor==0.18.0", "harbor"];
let cwd = skillDir;
let childEnv = {
  ...process.env,
  PYTHONDONTWRITEBYTECODE: "1",
  PYTHONPATH: [skillDir, process.env.PYTHONPATH].filter(Boolean).join(delimiter),
};
if (process.platform === "win32") {
  const linuxSkillDir = runtimePath(skillDir);
  const linuxUvx = (await run("wsl.exe", ["--exec", "sh", "-lc", "command -v uvx"], repoRoot)).stdout.trim();
  if (!linuxUvx) throw new Error("WSL must expose uvx and Docker");
  command = "wsl.exe";
  prefix = [
    "--cd",
    linuxSkillDir,
    "--exec",
    "env",
    "PYTHONDONTWRITEBYTECODE=1",
    `PYTHONPATH=${linuxSkillDir}`,
    linuxUvx,
    "--from",
    "harbor==0.18.0",
    "harbor",
  ];
  cwd = repoRoot;
  // Forward credential names through WSL without placing any secret value in argv or Harbor agent env.
  const forwarded = ["OPENROUTER_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY"].filter(
    (name) => process.env[name],
  );
  const inherited = (process.env.WSLENV ?? "").split(":").filter(Boolean);
  childEnv = { ...process.env, WSLENV: [...new Set([...inherited, ...forwarded])].join(":") };
}

// Pin-check before resolution, then either print the native config or execute a new append-only job.
const version = await run(command, [...prefix, "--version"], cwd, childEnv);
if (!version.stdout.trim().endsWith("0.18.0")) {
  throw new Error(`Expected Harbor 0.18.0, received: ${version.stdout.trim()}`);
}
const configArg = runtimePath(configPath);
if (flags.has("--print-config")) {
  const resolved = await run(command, [...prefix, "run", "--config", configArg, "--print-config"], cwd, childEnv);
  process.stdout.write(resolved.stdout);
} else {
  await run(command, [...prefix, "run", "--config", configArg, "--yes"], cwd, childEnv, true);
  // Harbor may exit zero after trial exceptions, so classify the native result before reporting success.
  const resultPath = resolve(jobDir, "result.json");
  const result = JSON.parse(await readFile(resultPath, "utf8"));
  const summary = summarizeResult(result);
  const report = {
    jobName,
    jobDir,
    resultPath,
    dataset: datasetInput,
    mode: oracleMode ? "oracle-preflight" : "prompt-solver",
    ...summary,
  };
  if (!oracleMode) Object.assign(report, { profile: profileName, modelIdentity, generatorModel });
  console.log(JSON.stringify(report, null, 2));
  const failure = deliveryFailure(summary, oracleMode);
  if (failure) {
    console.error(`${failure}; evidence: ${jobDir}`);
    process.exitCode = 1;
  }
}

async function run(executable, args, directory, env = process.env, stream = false) {
  // Preserve argv boundaries and redact credentials by keeping them solely in the child environment.
  return await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(executable, args, {
      cwd: directory,
      env,
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
      if (stream) process.stdout.write(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
      if (stream) process.stderr.write(chunk);
    });
    child.on("error", rejectPromise);
    child.on("close", (code) => {
      if (code === 0) resolvePromise({ stdout, stderr });
      else rejectPromise(new Error(`${executable} exited ${code}\n${stdout}\n${stderr}`));
    });
  });
}

function canonicalTaskName(datasetName, taskName) {
  // Hub task IDs inherit the dataset organization even when humans provide only the folder name.
  if (taskName.includes("/")) return taskName;
  const organization = datasetName.match(/^([^/]+)\//)?.[1];
  if (!organization) throw new Error(`Cannot infer the task organization from dataset: ${datasetName}`);
  return `${organization}/${taskName}`;
}

function workloadInputs(localTaskPath, remoteDataset) {
  // Keep the mutually exclusive Harbor inputs explicit so local paths cannot be silently ignored.
  return localTaskPath ? { tasks: [{ path: localTaskPath }] } : { datasets: [remoteDataset] };
}

function canonicalModelIdentity(route) {
  // Keep Harbor's observed identity stable while LiteLLM retains the provider-qualified inference route.
  if (route.startsWith("openrouter/openai/")) return route.slice("openrouter/openai/".length);
  if (route.startsWith("openrouter/")) return route.slice("openrouter/".length);
  if (route.startsWith("openai/")) return route.slice("openai/".length);
  return route;
}

function isRouterAlias(route) {
  // Router-selected endpoints can disappear between preflight and execution, breaking model provenance.
  return [
    "openrouter/free",
    "openrouter/auto",
    "openrouter/openrouter/free",
    "openrouter/openrouter/auto",
  ].includes(route.toLowerCase());
}

function summarizeResult(result) {
  // A one-task job is valid only when Harbor settled exactly one trial and exposed an evaluable reward.
  const stats = result?.stats;
  if (
    !result?.finished_at ||
    result.n_total_trials !== 1 ||
    stats?.n_completed_trials !== 1 ||
    stats.n_running_trials !== 0 ||
    stats.n_pending_trials !== 0 ||
    stats.n_cancelled_trials !== 0 ||
    !Number.isInteger(stats.n_errored_trials)
  ) {
    throw new Error("Harbor result is missing a settled one-trial summary");
  }
  const evaluations = Object.values(stats.evals ?? {});
  const nEvaluableTrials = evaluations.reduce((total, evaluation) => total + (evaluation.n_trials ?? 0), 0);
  const rewardMeans = evaluations
    .filter((evaluation) => evaluation.n_trials > 0)
    .flatMap((evaluation) => evaluation.metrics ?? [])
    .map((metric) => metric.mean)
    .filter(Number.isFinite);
  if (stats.n_errored_trials === 0 && (nEvaluableTrials !== 1 || rewardMeans.length !== 1)) {
    throw new Error("Harbor result has no unique evaluable reward");
  }
  return {
    nCompletedTrials: stats.n_completed_trials,
    nErroredTrials: stats.n_errored_trials,
    nEvaluableTrials,
    rewardMean: stats.n_errored_trials === 0 ? rewardMeans[0] : null,
  };
}

function deliveryFailure(summary, oracleMode) {
  // Solver reward zero is evaluable; oracle reward zero invalidates task admission.
  if (summary.nErroredTrials > 0) return `Harbor completed with ${summary.nErroredTrials} errored trial`;
  if (oracleMode && summary.rewardMean !== 1) return `Oracle preflight returned reward ${summary.rewardMean}`;
  return null;
}
