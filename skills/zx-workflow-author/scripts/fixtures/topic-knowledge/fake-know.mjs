#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

// Parse know's global flags first so the fixture exercises the production command shape.
const raw = process.argv.slice(2);
const storeIndex = raw.indexOf("--store");
if (storeIndex < 0 || !raw[storeIndex + 1]) {
  throw new Error("fake know requires --store");
}
const store = resolve(raw[storeIndex + 1]);
const command = raw.filter((_, index) => ![storeIndex, storeIndex + 1].includes(index) && raw[index] !== "--json");
const verb = command[0];
const object = command[1];
const key = valueOf("--key");
const revision = process.env.FAKE_KNOW_REVISION ?? "1";

// Implement bounded arXiv discovery without network so repeated runs remain deterministic.
if (verb === "search" && object === "arxiv") {
  const entries = [
    arxivEntry("2501.00001v1", "Agentic Retrieval Foundations"),
    arxivEntry("2501.00002v1", "Reliable Retrieval Agents"),
  ];
  if (revision === "2") {
    entries.push(arxivEntry("2501.00003v1", "Incremental Knowledge Agents"));
  }
  if (revision === "3") {
    entries.push(
      arxivEntry("2501.00003v1", "Incremental Knowledge Agents"),
      arxivEntry("2501.00004v1", "Portable Harness Routing"),
    );
  }
  if (revision === "4") {
    entries.push(
      arxivEntry("2501.00003v1", "Incremental Knowledge Agents"),
      arxivEntry("2501.00004v1", "Portable Harness Routing"),
      arxivEntry("2501.00005v1", "Deterministic Knowledge Fallbacks"),
    );
  }
  output({ entries, total_results: entries.length });
  process.exit(0);
}

// Create the topic key metadata exactly once.
if (verb === "add" && object === "key") {
  const createdKey = command[2];
  await mkdir(resolve(store, createdKey), { recursive: true });
  await writeFile(resolve(store, createdKey, "metadata.yaml"), `key: ${createdKey}\n`);
  output({ created: createdKey });
  process.exit(0);
}

// Persist source registrations so the workflow can prove later runs do not add duplicates.
const sourceFile = key ? resolve(store, key, "sources.json") : null;
const sources = sourceFile ? await readJson(sourceFile, []) : [];
if (verb === "list" && object === "sources") {
  output({ sources });
  process.exit(0);
}
if (verb === "add" && object !== "key") {
  const url = command[2];
  const id =
    object === "site"
      ? valueOf("--source-id") ?? "site-topic"
      : object === "github-repo"
        ? `github-${url.split("/").filter(Boolean).at(-1)}`
        : `arxiv-${url.split("/").at(-1)}`;
  if (!sources.some((source) => source.type === object && source.config?.url === url)) {
    sources.push({ type: object, id, title: url, config: { url } });
    await writeJson(sourceFile, sources);
  }
  output({ key, source: { type: object, id, config: { url } } });
  process.exit(0);
}

// Materialize one stable OKF Markdown document for each synchronized connector.
if (verb === "sync") {
  const url = command[2];
  const source = sources.find((item) => item.type === object && item.config?.url === url);
  if (!source) {
    throw new Error(`source is not registered: ${object} ${url}`);
  }
  const destination =
    object === "arxiv"
      ? resolve(store, key, "arxiv", source.id, "paper.md")
      : object === "site"
        ? resolve(store, key, "site", source.id, "page.md")
        : resolve(store, key, "github-repo", source.id, "README.md");
  const title =
    object === "arxiv"
      ? arxivTitle(url.split("/").at(-1))
      : object === "site"
        ? "Topic Notes"
        : "Topic Repository";
  const type = object === "arxiv" ? "arXiv Paper" : object === "site" ? "Web Page" : "Repository Document";
  const titleMetadata =
    title === "Incremental Knowledge Agents"
      ? ["title: 'Incremental Knowledge", "  Agents'"]
      : [`title: '${title}'`];
  await mkdir(resolve(destination, ".."), { recursive: true });
  await writeFile(
    destination,
    [
      "---",
      `type: ${type}`,
      ...titleMetadata,
      `resource: ${url}`,
      `source_type: ${object}`,
      `source_id: ${source.id}`,
      "---",
      "",
      `# ${title}`,
      "",
      `Knowledge from ${object}.`,
      "",
    ].join("\n"),
  );
  output({ synced: [{ key, source: source.id, documents: 1 }] });
  process.exit(0);
}

// Produce a stable export receipt without testing archive implementation details.
if (verb === "export") {
  const archive = resolve(store, "exports", `${key}.zip`);
  await mkdir(resolve(archive, ".."), { recursive: true });
  await writeFile(archive, "fake archive");
  output({ archive, exported: [key] });
  process.exit(0);
}

throw new Error(`unsupported fake know command: ${command.join(" ")}`);

function valueOf(flag) {
  const index = command.indexOf(flag);
  return index >= 0 ? command[index + 1] : undefined;
}

function arxivEntry(id, title) {
  return {
    id: `http://arxiv.org/abs/${id}`,
    title,
    links: { alternate: `https://arxiv.org/abs/${id}` },
  };
}

function arxivTitle(id) {
  return {
    "2501.00001v1": "Agentic Retrieval Foundations",
    "2501.00002v1": "Reliable Retrieval Agents",
    "2501.00003v1": "Incremental Knowledge Agents",
    "2501.00004v1": "Portable Harness Routing",
    "2501.00005v1": "Deterministic Knowledge Fallbacks",
  }[id];
}

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    throw error;
  }
}

async function writeJson(path, value) {
  await mkdir(resolve(path, ".."), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

function output(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}
