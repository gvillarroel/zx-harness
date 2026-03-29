#!/usr/bin/env zx

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

$.quote = quote;

// Keep the wrapper explicit: verify the runtime, then hand off to the local TypeScript entrypoint.
const exampleDir = fileURLToPath(new URL(".", import.meta.url));
const dependenciesDir = resolve(exampleDir, "node_modules");
const args = process.argv.slice(3).map((value) => value.trim()).filter(Boolean);

for (const command of ["node", "npm", "git"]) {
  try {
    await $`${command} --version`;
  } catch {
    throw new Error(`Required CLI not found: ${command}`);
  }
}

if (!existsSync(dependenciesDir)) {
  throw new Error(
    `Install example dependencies first: cd ${exampleDir.replaceAll("\\", "/")} && npm install`,
  );
}

await $({ cwd: exampleDir, stdio: "inherit" })`npm exec -- tsx summarize-repo.ts ${args}`;
