#!/usr/bin/env node

import { spawn } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const skillDir = fileURLToPath(new URL("..", import.meta.url));
const scaffold = resolve(skillDir, "scripts", "scaffold-topic-knowledge.mjs");
const temporaryRoot = await mkdtemp(resolve(tmpdir(), "compact-topic-harness-"));
const target = resolve(temporaryRoot, "workflow");
const okfSkill = resolve(temporaryRoot, "okf-skill");
const fakeCli = resolve(temporaryRoot, "fake-cli.cjs");
const topic = "agentic retrieval evaluation";
const harnesses = ["codex", "copilot", "pi", "opencode"];

try {
  // Scaffold and install only the generated standalone dependency.
  await run(process.execPath, [scaffold, target], skillDir);
  await runNpm(target, ["install", "--ignore-scripts", "--no-audit", "--no-fund"]);
  const zxCli = resolve(target, "node_modules", "zx", "build", "cli.js");

  // Enforce the byte objective and prove each wrapper carries a distinct prompt simulation.
  const moduleSizes = {};
  const plans = [];
  for (const name of (await readdir(target)).filter((value) => value.endsWith(".mjs"))) {
    moduleSizes[name] = (await stat(resolve(target, name))).size;
  }
  assert(Math.max(...Object.values(moduleSizes)) <= 7000, "an executable exceeds 7000 bytes");
  for (const harness of harnesses) {
    const result = await run(
      process.execPath,
      [zxCli, resolve(target, `${harness}.mjs`), topic, "--dry-run"],
      target,
    );
    plans.push(JSON.parse(lastLine(result.stdout)));
  }
  assert(new Set(plans.map(({ prompt }) => prompt)).size === 4, "harness prompts are aliases");

  // A fifth wrapper exercises the exported command adapter without changing the shared runtime.
  await writeFile(
    resolve(target, "custom.mjs"),
    '#!/usr/bin/env zx\nimport { runHarness } from "./topic.mjs";\nawait runHarness({ harness: "custom", prompt: "Custom simulation.", command: ({ prompt }) => ["custom-cli", prompt] });\n',
  );
  const custom = JSON.parse(
    lastLine(
      (
        await run(
          process.execPath,
          [zxCli, resolve(target, "custom.mjs"), topic, "--dry-run"],
          target,
        )
      ).stdout,
    ),
  );
  assert(custom.command === "custom-cli", "arbitrary harness adapter was not preserved");

  // Prove argv-only harness execution closes stdin instead of waiting for hidden interactive input.
  const commandRuntime = await import(pathToFileURL(resolve(target, "command-runtime.mjs")));
  const eof = await commandRuntime.run(
    process.execPath,
    ["-e", 'process.stdin.resume();process.stdin.on("end",()=>console.log("EOF"))'],
    { timeout: 5000 },
  );
  assert(eof.stdout.trim() === "EOF", "the command runtime left harness stdin open");

  // Route every external CLI through one argument-array fake; Python remains the real OKF gate.
  await writeFile(fakeCli, buildFakeCliSource());
  const commands = Object.fromEntries(
    [...harnesses, "know", "jq", "rg", "fd", "git"].map((name) => [
      name,
      [process.execPath, fakeCli, name],
    ]),
  );
  await mkdir(resolve(okfSkill, "scripts"), { recursive: true });
  await writeFile(
    resolve(okfSkill, "scripts", "validate_okf_bundle.py"),
    "from pathlib import Path\nimport sys\nroot=Path(sys.argv[1])\nindex=(root/'index.md').read_text(encoding='utf-8')\nassert all(not line or line.startswith('# ') or line.startswith('* [') for line in index.splitlines())\nfor p in root.rglob('*.md'):\n    if p.name not in {'index.md','log.md'}:\n        assert p.read_text(encoding='utf-8').startswith('---\\ntype:')\n",
  );

  // Enable two non-arXiv source adapters while keeping one topic as the only CLI input.
  const sourcesPath = resolve(target, "sources.json");
  const sources = JSON.parse(await readFile(sourcesPath, "utf8"));
  sources[0].enabled = true;
  sources[1].enabled = true;
  await writeFile(sourcesPath, `${JSON.stringify(sources, null, 2)}\n`);
  const env = {
    FAKE_REVISION: "1",
    OPEN_KNOWLEDGE_FORMAT_SKILL: okfSkill,
    TOPIC_COMMANDS_JSON: JSON.stringify(commands),
  };

  // Run all four harnesses; their independent ledgers may process the same initial source batch.
  for (const harness of harnesses) {
    const result = await run(
      process.execPath,
      [zxCli, resolve(target, `${harness}.mjs`), topic],
      target,
      env,
    );
    assert(JSON.parse(lastLine(result.stdout)).status === "published", `${harness} did not publish`);
  }
  const topicRoot = resolve(target, "topics", topic.replaceAll(" ", "-"));
  assert(
    await stat(resolve(topicRoot, ".know", ".fake-source-arxiv")).catch(() => null),
    "the real arXiv response shape did not register a source",
  );
  const firstConcept = (await readdir(resolve(topicRoot, "okf")))
    .filter((name) => name.startsWith("codex-"))[0];
  const firstBytes = await readFile(resolve(topicRoot, "okf", firstConcept));

  // An unchanged rerun must skip the harness and preserve every published concept byte.
  const unchanged = await run(
    process.execPath,
    [zxCli, resolve(target, "codex.mjs"), topic],
    target,
    env,
  );
  assert(JSON.parse(lastLine(unchanged.stdout)).status === "unchanged", "unchanged files reprocessed");
  assert(
    Buffer.compare(firstBytes, await readFile(resolve(topicRoot, "okf", firstConcept))) === 0,
    "unchanged run rewrote a concept",
  );

  // A changed source version must add one concept and rebuild a valid deterministic index.
  const changed = await run(
    process.execPath,
    [zxCli, resolve(target, "codex.mjs"), topic],
    target,
    { ...env, FAKE_REVISION: "2" },
  );
  assert(JSON.parse(lastLine(changed.stdout)).status === "published", "new source version was skipped");
  const index = await readFile(resolve(topicRoot, "okf", "index.md"), "utf8");
  assert((index.match(/^\* \[/gm) ?? []).length === 5, "index does not list five concepts");
  assert(
    Buffer.compare(firstBytes, await readFile(resolve(topicRoot, "okf", firstConcept))) === 0,
    "incremental run rewrote historical bytes",
  );
  console.log(
    JSON.stringify({
      moduleSizes,
      harnesses,
      customHarness: custom.command,
      incremental: true,
      okfValidated: true,
    }),
  );
} finally {
  // Remove isolated stores, fake credentials, and generated projects after every outcome.
  await rm(temporaryRoot, { recursive: true, force: true });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function lastLine(text) {
  return text.trim().split(/\r?\n/).filter(Boolean).at(-1);
}

async function runNpm(cwd, args) {
  // Prefer npm's active JavaScript entrypoint because npx-provided Node binaries have no adjacent npm.
  const bundled = resolve(process.execPath, "..", "node_modules", "npm", "bin", "npm-cli.js");
  const active = process.env.npm_execpath ?? "";
  for (const npmCli of [active, bundled].filter(Boolean)) {
    if (await stat(npmCli).catch(() => null)) {
      return await run(process.execPath, [npmCli, ...args], cwd);
    }
  }
  return await run("npm", args, cwd);
}

async function run(command, args, cwd, env = {}) {
  // Pass every dynamic value as an argument and capture a complete reproducible receipt.
  return await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
      shell: false,
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", rejectPromise);
    child.on("close", (code) => {
      if (code === 0) resolvePromise({ stdout, stderr });
      else rejectPromise(new Error(`${command} exited ${code}\n${stdout}\n${stderr}`));
    });
  });
}

function buildFakeCliSource() {
  return String.raw`#!/usr/bin/env node
const { createHash } = require("node:crypto");
const { mkdirSync, readFileSync, readdirSync, writeFileSync } = require("node:fs");
const { basename, dirname, resolve } = require("node:path");

const tools = ["codex", "copilot", "pi", "opencode", "know", "jq", "rg", "fd", "git"];
const invoked = basename(process.argv0).replace(/\.exe$/i, "");
const direct = tools.includes(invoked);
const tool = direct ? invoked : process.argv[2];
const args = process.argv.slice(direct ? 1 : 3);
if (tools.includes(tool)) {
const value = (flag) => args[args.indexOf(flag) + 1];
if (["codex", "copilot", "pi", "opencode"].includes(tool)) {
  console.log("# Finding\n\nEvidence synthesized by " + tool + ".");
} else if (tool === "know" && args.includes("search")) {
  console.log(JSON.stringify({ entries: [{ id: "http://arxiv.org/abs/2401.00001", links: { alternate: "https://arxiv.org/abs/2401.00001" } }] }));
} else if (tool === "know" && args.includes("add") && !args.includes("key")) {
  const store = value("--store");
  const kind = args[args.indexOf("add") + 1];
  mkdirSync(store, { recursive: true });
  writeFileSync(resolve(store, ".fake-source-" + kind), "registered\n");
} else if (tool === "know" && args.includes("sync")) {
  const store = value("--store");
  for (const marker of readdirSync(store).filter((name) => name.startsWith(".fake-source-"))) {
    const kind = marker.slice(".fake-source-".length);
    const title = kind.replaceAll("-", " ");
    const file = resolve(store, kind, "source.md");
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, "---\ntype: source\ntitle: " + title + "\n---\n\nrevision " + (process.env.FAKE_REVISION ?? "1") + "\n");
  }
} else if (tool === "jq") {
  const paths = args.filter((arg) => !arg.startsWith("-") && !arg.includes("|") && !arg.startsWith("."));
  if (args.includes("-s")) {
    const objects = paths.slice(-2).map((path) => JSON.parse(readFileSync(path, "utf8")));
    console.log(JSON.stringify(Object.assign({}, ...objects)));
  } else {
    const data = JSON.parse(readFileSync(paths.at(-1), "utf8"));
    if (Array.isArray(data) && data.some((item) => "type" in item)) {
      for (const item of data.filter(({ enabled }) => enabled)) {
        console.log([item.type, item.url, item.branch ?? ""].join("\t"));
      }
    } else {
      for (const item of (Array.isArray(data) ? data : data.entries ?? [])) {
        const url = item.url ?? item.links?.alternate ?? item.id ?? item.pdf_url;
        if (url) console.log(url);
      }
    }
  }
} else if (tool === "fd") {
  const root = resolve(args.at(-1));
  const pending = [root];
  while (pending.length) {
    const current = pending.pop();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = resolve(current, entry.name);
      if (entry.isDirectory()) pending.push(path);
      else if (entry.name.endsWith(".md") && !["index.md", "log.md"].includes(entry.name)) console.log(path);
    }
  }
} else if (tool === "rg") {
  const text = readFileSync(resolve(args.at(-1)), "utf8");
  console.log(text.split(/\r?\n/).find((line) => line.startsWith("title:")) ?? "");
} else if (tool === "git") {
  const bytes = readFileSync(resolve(args.at(-1)));
  console.log(createHash("sha256").update(bytes).digest("hex"));
}
process.exit(0);
}
`;
}
