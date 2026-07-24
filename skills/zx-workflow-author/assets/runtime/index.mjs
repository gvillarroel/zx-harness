#!/usr/bin/env zx

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

// Resolve the local runtime so the generated workflow never depends on the source skill.
const workflowDir = fileURLToPath(new URL(".", import.meta.url));
const tsxCli = resolve(workflowDir, "node_modules", "tsx", "dist", "cli.mjs");

// Fail with one actionable instruction instead of falling through to a module error.
if (!existsSync(tsxCli)) {
  throw new Error(`Run npm install in ${workflowDir} before executing this workflow.`);
}

// Forward arguments as an array so task data never enters a shell parser.
execFileSync(process.execPath, [tsxCli, resolve(workflowDir, "workflow.ts"), ...process.argv.slice(3)], {
  cwd: process.cwd(),
  stdio: "inherit",
});
