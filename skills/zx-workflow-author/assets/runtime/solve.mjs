#!/usr/bin/env zx

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Resolve only generated-local files so the workflow remains standalone after scaffolding.
const workflowDir = fileURLToPath(new URL(".", import.meta.url));
const tsxCli = resolve(workflowDir, "node_modules", "tsx", "dist", "cli.mjs");
if (!existsSync(tsxCli)) {
  throw new Error(`Run npm install in ${workflowDir} before executing this workflow.`);
}

// zx retains the source path at argv[2]; forward only the runtime problem and workflow options.
execFileSync(
  process.execPath,
  [tsxCli, resolve(workflowDir, "workflow.ts"), ...process.argv.slice(3)],
  { cwd: process.cwd(), stdio: "inherit" },
);
