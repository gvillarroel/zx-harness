#!/usr/bin/env node

import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";

const args = process.argv.slice(2);
const valueOf = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

// Keep discovery side-effect free so the workflow can try later configured harnesses.
if (args.includes("--probe")) {
  process.stdout.write("fake-topic-harness 1.0\n");
  process.exit(0);
}
if (!args.includes("--run")) {
  throw new Error("fake harness requires --probe or --run");
}

// Verify both argument placeholders and the standard environment protocol reach the adapter.
const id = valueOf("--id") ?? "fixture";
const batchPath = resolve(valueOf("--batch") ?? process.env.TOPIC_KNOWLEDGE_BATCH_MANIFEST ?? "");
const candidate = resolve(valueOf("--candidate") ?? process.env.TOPIC_KNOWLEDGE_CANDIDATE ?? "");
const manifest = JSON.parse(await readFile(batchPath, "utf8"));
if (
  resolve(process.env.TOPIC_KNOWLEDGE_BATCH_MANIFEST ?? "") !== batchPath ||
  resolve(process.env.TOPIC_KNOWLEDGE_CANDIDATE ?? "") !== candidate ||
  manifest.candidateRoot !== candidate ||
  manifest.runId !== process.env.TOPIC_KNOWLEDGE_RUN_ID
) {
  throw new Error("harness protocol arguments and environment disagree");
}
const promptPath = valueOf("--prompt");
const promptText = promptPath ? await readFile(resolve(promptPath), "utf8") : valueOf("--prompt-text");
if (!promptText?.includes(manifest.topic) || !promptText.includes(batchPath)) {
  throw new Error("harness did not receive the stable batch prompt");
}

// The hostile mode proves the caller detects writes to concepts outside the pending manifest.
const pending = new Set(manifest.pending.map((item) => item.relativePath));
if (valueOf("--mode") === "mutator") {
  const prior = (await markdownFiles(candidate)).find((path) => {
    const name = relative(candidate, path).replaceAll("\\", "/");
    return !pending.has(name) && !["index.md", "log.md"].includes(name.split("/").at(-1));
  });
  if (!prior) {
    throw new Error("mutator fixture found no protected prior concept");
  }
  await writeFile(prior, `${await readFile(prior, "utf8")}\nUnsafe historical rewrite.\n`);
  process.stdout.write(`${JSON.stringify({ id, mutated: relative(candidate, prior) })}\n`);
  process.exit(0);
}

// Text-only harnesses can return one complete concept for the caller's configured stdoutPath.
if (valueOf("--mode") === "stdout") {
  process.stdout.write(
    [
      "---",
      "type: Knowledge Batch",
      `title: 'Processed ${manifest.runId} with ${id}'`,
      "source_type: harness-stdout",
      `source_id: ${id}`,
      "---",
      "",
      `# Processed ${manifest.topic}`,
      "",
      `Processed ${manifest.pending.length} new content version(s).`,
      "",
    ].join("\n"),
  );
  process.exit(0);
}

// A normal harness adds one derived OKF concept without rewriting any prior or reserved document.
const derived = resolve(candidate, "derived", `${manifest.runId}-${id}.md`);
if (!derived.startsWith(`${candidate}${sep}`)) {
  throw new Error("derived fixture path escaped the candidate");
}
await mkdir(resolve(derived, ".."), { recursive: true });
await writeFile(
  derived,
  [
    "---",
    "type: Knowledge Batch",
    `title: 'Processed ${manifest.runId} with ${id}'`,
    `source_type: harness`,
    `source_id: ${id}`,
    "---",
    "",
    `# Processed ${manifest.topic}`,
    "",
    `Processed ${manifest.pending.length} new content version(s).`,
    "",
  ].join("\n"),
);
process.stdout.write(`${JSON.stringify({ id, created: relative(candidate, derived) })}\n`);

async function markdownFiles(directory) {
  const files = [];
  const pendingDirectories = [directory];
  while (pendingDirectories.length > 0) {
    const current = pendingDirectories.pop();
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = resolve(current, entry.name);
      if (entry.isDirectory()) {
        pendingDirectories.push(path);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
        files.push(path);
      }
    }
  }
  return files.sort();
}
