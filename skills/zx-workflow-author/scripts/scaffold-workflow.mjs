#!/usr/bin/env node

import { cp, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const [, , planInput, targetInput] = process.argv;

// Require explicit inputs because guessing either path can overwrite unrelated project files.
if (!planInput || !targetInput) {
  throw new Error("Usage: node scaffold-workflow.mjs <plan.json> <target-directory>");
}

const skillDir = fileURLToPath(new URL("..", import.meta.url));
const runtimeDir = resolve(skillDir, "assets", "runtime");
const planFile = resolve(planInput);
const targetDir = resolve(targetInput);
const plan = JSON.parse(await readFile(planFile, "utf8"));

// Validate the plan before creating a target so an invalid request leaves no partial scaffold.
validatePlan(plan);

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

// Install only the harness SDKs named by the plan, keeping each generated workflow minimal.
const dependencies = {
  "@types/node": "26.1.1",
  tsx: "4.23.1",
  typescript: "7.0.2",
  zx: "8.8.5",
};
const usesCopilot = plan.stages.some((stage) => stage.kind === "harness" && stage.provider === "copilot");
const usesPi = plan.stages.some((stage) => stage.kind === "harness" && stage.provider === "pi");
if (usesCopilot) {
  dependencies["@github/copilot-sdk"] = "1.0.7";
}
if (usesPi) {
  dependencies["@earendil-works/pi-ai"] = "0.80.10";
}

// Declare only an absent optional SDK so TypeScript still validates the provider actually installed.
const optionalTypes = [
  usesCopilot
    ? ""
    : 'declare module "@github/copilot-sdk" {\n  export const CopilotClient: any;\n}\n',
  usesPi
    ? ""
    : 'declare module "@earendil-works/pi-ai/providers/all" {\n  export function builtinModels(): any;\n}\n',
]
  .filter(Boolean)
  .join("\n");
await writeFile(resolve(targetDir, "optional-sdk.d.ts"), optionalTypes);

const packageJson = {
  name: plan.name,
  private: true,
  type: "module",
  scripts: {
    check: "tsc --noEmit",
    "dry-run": "tsx workflow.ts --dry-run",
    start: "zx index.mjs",
  },
  dependencies: Object.fromEntries(Object.entries(dependencies).sort(([left], [right]) => left.localeCompare(right))),
};
await writeFile(resolve(targetDir, "package.json"), `${JSON.stringify(packageJson, null, 2)}\n`);

console.log(`Scaffolded ${plan.name} at ${targetDir}`);

function validatePlan(plan) {
  if (!plan || !/^[a-z0-9][a-z0-9-]{1,62}$/.test(plan.name)) {
    throw new Error("Plan name must be a lowercase slug with 2-63 characters.");
  }
  if (!plan.description?.trim() || !Array.isArray(plan.stages) || plan.stages.length === 0) {
    throw new Error("Plan requires a description and at least one stage.");
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

    if (stage.kind === "command") {
      if (!stage.command || !Array.isArray(stage.args ?? [])) {
        throw new Error(`Command stage is incomplete: ${stage.id}`);
      }
      if (stage.mutates?.length && !stage.gate) {
        throw new Error(`Mutating command requires a gate: ${stage.id}`);
      }
      rejectSecretEnv(stage.env, stage.id);
    } else if (stage.kind === "tfidf") {
      if ((!stage.query && !stage.queryFile) || !stage.roots?.length || !stage.output) {
        throw new Error(`TF-IDF stage is incomplete: ${stage.id}`);
      }
    } else if (stage.kind === "harness") {
      if (
        !["copilot", "pi"].includes(stage.provider) ||
        !stage.prompt ||
        !stage.output ||
        !stage.models?.fast ||
        !stage.models?.strong ||
        !stage.gate
      ) {
        throw new Error(`Harness stage requires provider, prompt, models, output, and gate: ${stage.id}`);
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
}

function rejectSecretEnv(env, location) {
  for (const key of Object.keys(env ?? {})) {
    if (/(TOKEN|SECRET|PASSWORD|API_KEY)/i.test(key)) {
      throw new Error(`Do not store credential environment values in plans (${location}: ${key}).`);
    }
  }
}
