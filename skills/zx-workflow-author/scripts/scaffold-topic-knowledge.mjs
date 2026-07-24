#!/usr/bin/env node

import { cp, mkdir, readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const [, , targetInput] = process.argv;

// Require an explicit empty destination so a scaffold cannot merge into unrelated knowledge state.
if (!targetInput) {
  throw new Error("Usage: node scaffold-topic-knowledge.mjs <target-directory>");
}
const skillDir = fileURLToPath(new URL("..", import.meta.url));
const sourceDir = resolve(skillDir, "assets", "topic-knowledge");
const targetDir = resolve(targetInput);
const targetStats = await stat(targetDir).catch(() => null);
if (targetStats && !targetStats.isDirectory()) {
  throw new Error(`Target is not a directory: ${targetDir}`);
}
if (targetStats && (await readdir(targetDir)).length > 0) {
  throw new Error(`Target directory must be empty: ${targetDir}`);
}

// Copy the full runtime so generated research workflows never reach back into this skill.
await mkdir(targetDir, { recursive: true });
await cp(sourceDir, targetDir, { recursive: true });
console.log(`Scaffolded topic knowledge workflow at ${targetDir}`);
