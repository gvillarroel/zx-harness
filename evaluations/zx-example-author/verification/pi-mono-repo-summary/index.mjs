#!/usr/bin/env zx

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

$.quote = quote;

// Keep the wrapper explicit so the example stays easy to inspect and debug.
const exampleDir = fileURLToPath(new URL(".", import.meta.url));
const dependenciesDir = resolve(exampleDir, "node_modules");
const args = process.argv.slice(3).map((value) => value.trim()).filter(Boolean);

// Verify the runtime CLIs up front so failures are actionable before the heavy work starts.
for (const command of ["node", "npm", "git"]) {
  try {
    await $`${command} --version`;
  } catch {
    throw new Error(`Required CLI not found: ${command}`);
  }
}

// Require local installs so the entrypoint does not hide missing setup behind module errors.
if (!existsSync(dependenciesDir)) {
  throw new Error(
    `Install example dependencies first: cd ${exampleDir.replaceAll("\\", "/")} && npm install`,
  );
}

// Hand off to the local TypeScript summarizer once the wrapper checks are done.
await $({ cwd: exampleDir, stdio: "inherit" })`npm exec -- tsx summarize-repo.ts ${args}`;
