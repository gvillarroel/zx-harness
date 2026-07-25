#!/usr/bin/env zx

import { cp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { run, soft } from "./command-runtime.mjs";

export async function runHarness({ harness, prompt, command }) {
  // One topic is the interface; dry-run stays local.
  const topic = argv._.join(" ").trim();
  if (!topic) throw new Error("Usage: <script> <topic> [--dry-run]");
  const slug = topic
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  if (!slug) throw new Error("Topic must contain letters or numbers");
  const root = resolve("topics", slug);
  const plan = {
    topic,
    harness,
    prompt,
    root,
    command: command({ root, prompt, manifest: "MANIFEST" })[0],
  };
  if (argv["dry-run"] || process.env.TOPIC_DRY_RUN === "1") {
    console.log(JSON.stringify(plan));
    return;
  }

  // know owns source adapters; jq parses their stable JSON without model tokens.
  const store = join(root, ".know");
  const key = `topic-${slug}`;
  const sourcesFile = resolve(process.env.TOPIC_SOURCES ?? "sources.json");
  await mkdir(root, { recursive: true });
  await soft("know", ["--store", store, "add", "key", key]);
  const arxiv = await run("know", [
    "search",
    "arxiv",
    topic,
    "--format",
    "json",
    "--max-results",
    process.env.ARXIV_LIMIT ?? "5",
  ]);
  const arxivFile = join(root, "arxiv.json");
  await writeFile(arxivFile, arxiv.stdout);
  const urls = (
    await run("jq", ["-r", "..|objects|.url? //.links?.alternate? //.id? //empty", arxivFile])
  ).stdout
    .trim()
    .split(/\r?\n/)
    .filter(Boolean);
  for (const url of [...new Set(urls)]) {
    await soft("know", ["--store", store, "add", "arxiv", url, "--key", key]);
  }
  const rows = (
    await run("jq", [
      "-r",
      '.[] | select(.enabled == true) | [.type,.url,(.branch // "")] | @tsv',
      sourcesFile,
    ])
  ).stdout
    .trim()
    .split(/\r?\n/)
    .filter(Boolean);
  for (const row of rows) {
    const [type, url, branch] = row.split("\t");
    if (!["site", "video", "github-repo", "google-releases"].includes(type)) {
      throw new Error(`Unsupported source type: ${type}`);
    }
    const args = ["--store", store, "add", type, url, "--key", key];
    if (type === "github-repo" && branch) args.push("--branch", branch);
    await soft("know", args);
  }
  await run("know", ["--store", store, "sync", "--key", key]);
  await run("know", ["--store", store, "export", "--key", key]);

  // git hashes and a harness-local ledger select only unseen content versions.
  const stateFile = join(root, `state-${harness}.json`);
  const state = JSON.parse(await readFile(stateFile, "utf8").catch(() => "{}"));
  await writeFile(stateFile, `${JSON.stringify(state)}\n`);
  const files = (
    await run("fd", ["--absolute-path", "--type", "f", "--extension", "md", ".", store])
  ).stdout
    .trim()
    .split(/\r?\n/)
    .filter(Boolean);
  const fresh = [];
  for (const file of files) {
    const hash = (await run("git", ["hash-object", file])).stdout.trim();
    if (!state[hash]) fresh.push({ file, hash });
  }
  if (fresh.length === 0) {
    console.log(JSON.stringify({ topic, harness, status: "unchanged" }));
    return;
  }
  const manifest = join(root, `manifest-${harness}.json`);
  await writeFile(manifest, `${JSON.stringify(fresh, null, 2)}\n`);

  // The harness sees only the new manifest and returns one staged concept body.
  const fullPrompt = `${prompt}
  Topic: ${topic}
Read only files listed in ${manifest}. Return concise Markdown with citations; no frontmatter.`;
  const [bin, ...args] = command({ root, prompt: fullPrompt, manifest });
  const response = await run(bin, args, { cwd: root });
  const runHash = (await run("git", ["hash-object", manifest])).stdout.trim();
  const pending = join(root, `.pending-${harness}-${runHash.slice(0, 12)}`);
  const candidate = join(pending, "okf");
  const library = join(root, "okf");
  await cp(library, candidate, { recursive: true }).catch(async (error) => {
    if (error.code !== "ENOENT") throw error;
    await mkdir(candidate, { recursive: true });
  });
  const conceptName = `${harness}-${runHash.slice(0, 12)}.md`;
  await writeFile(
    join(candidate, conceptName),
    `---
type: research-note
title: ${JSON.stringify(`${topic}: ${harness}`)}
resource: ${JSON.stringify(`arxiv:${topic}`)}
tags: [research, ${harness}]
---

${response.stdout.trim()}
`,
  );

  // fd enumerates concepts and rg extracts titles before the OKF skill validates.
  const concepts = (
    await run("fd", [
      "--absolute-path",
      "--type",
      "f",
      "--extension",
      "md",
      "--exclude",
      "index.md",
      "--exclude",
      "log.md",
      ".",
      candidate,
    ])
  ).stdout
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .sort();
  const links = [];
  for (const file of concepts) {
    const title = (
      await soft("rg", ["--max-count", "1", "^title:", file])
    ).stdout
      .replace(/^title:\s*/, "")
      .trim();
    const link = relative(candidate, file).replaceAll("\\", "/");
    links.push(`* [${title || link}](${link})`);
  }
  await writeFile(join(candidate, "index.md"), `# ${topic}\n\n${links.join("\n")}\n`);
  const okfSkill = process.env.OPEN_KNOWLEDGE_FORMAT_SKILL;
  if (!okfSkill) throw new Error("Set OPEN_KNOWLEDGE_FORMAT_SKILL");
  await run("python", [join(okfSkill, "scripts", "validate_okf_bundle.py"), candidate]);

  // Swap only the validated directory, restore on failure, then commit the ledger.
  const backup = join(pending, "previous");
  let hadLibrary = false;
  await rename(library, backup)
    .then(() => {
      hadLibrary = true;
    })
    .catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
  try {
    await rename(candidate, library);
  } catch (error) {
    if (hadLibrary) await rename(backup, library);
    throw error;
  }
  if (hadLibrary) await rm(backup, { recursive: true });
  const delta = join(root, `state-delta-${harness}.json`);
  await writeFile(
    delta,
    `${JSON.stringify(Object.fromEntries(fresh.map(({ hash }) => [hash, true])))}\n`,
  );
  const merged = await run("jq", ["-s", ".[0] * .[1]", stateFile, delta]);
  await writeFile(stateFile, merged.stdout);
  await rm(pending, { recursive: true, force: true });
  console.log(
    JSON.stringify({
      topic,
      harness,
      status: "published",
      concept: join(library, conceptName),
    }),
  );
}
