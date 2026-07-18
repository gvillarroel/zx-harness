#!/usr/bin/env zx

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

// Keep the wrapper explicit: verify the runtime, then hand off to the local TypeScript entrypoint.
const exampleDir = fileURLToPath(new URL(".", import.meta.url));
const dependenciesDir = resolve(exampleDir, "node_modules");
const tsxCli = resolve(dependenciesDir, "tsx", "dist", "cli.mjs");
const args = process.argv.slice(3).map((value) => value.trim()).filter(Boolean);

for (const command of ["node", "git"]) {
  try {
    execFileSync(command, ["--version"], { stdio: "ignore" });
  } catch {
    throw new Error(`Required CLI not found: ${command}`);
  }
}

if (!existsSync(tsxCli)) {
  throw new Error(`Install dependencies in ${exampleDir} before running this command.`);
}

execFileSync(process.execPath, [tsxCli, resolve(exampleDir, "summarize-repo.ts"), ...args], {
  cwd: exampleDir,
  stdio: "inherit",
});
