#!/usr/bin/env node

import { copyFile, mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const [, , targetInput] = process.argv;
if (!targetInput) {
  throw new Error("Usage: node scaffold-topic-knowledge.mjs <target-directory>");
}
const target = resolve(targetInput);
const targetStats = await stat(target).catch(() => null);
if (targetStats && !targetStats.isDirectory()) {
  throw new Error(`Target is not a directory: ${target}`);
}
if (targetStats && (await readdir(target)).length > 0) {
  throw new Error(`Target directory must be empty: ${target}`);
}

const wrappers = {
  codex: {
    prompt: "Build an evidence map, separate observations from inferences, and flag unresolved conflicts.",
    command:
      '({ root, prompt }) => ["codex", "exec", "--sandbox", "read-only", "--skip-git-repo-check", "-C", root, prompt]',
  },
  copilot: {
    prompt: "Act as a research pair: extract actionable findings, implementation consequences, and missing tests.",
    command:
      '({ root, prompt }) => ["copilot", "-p", prompt, "--allow-tool=read", "--no-ask-user", "--silent", "-C", root]',
  },
  pi: {
    prompt: "Compare competing claims, rank evidence strength, and state what would falsify each conclusion.",
    command:
      '({ prompt }) => ["pi", "--no-session", "--tools", "read,grep,find,ls", "-p", prompt]',
  },
  opencode: {
    prompt: "Produce compact concept cards: claim, mechanism, evidence, limitation, and cross-link.",
    command:
      '({ root, prompt }) => ["opencode", "run", "--dir", root, "--format", "default", prompt]',
  },
};

// Copy one reviewed runtime and add four prompt-specific, independently executable wrappers.
await mkdir(target, { recursive: true });
const scriptDir = fileURLToPath(new URL(".", import.meta.url));
await copyFile(resolve(scriptDir, "topic-runtime.mjs"), resolve(target, "topic.mjs"));
for (const [harness, { prompt, command }] of Object.entries(wrappers)) {
  const config = `{ harness: ${JSON.stringify(harness)}, prompt: ${JSON.stringify(prompt)}, command: ${command} }`;
  await writeFile(
    resolve(target, `${harness}.mjs`),
    `#!/usr/bin/env zx\nimport { runHarness } from "./topic.mjs";\n\nawait runHarness(${config});\n`,
  );
}

// Keep optional multi-source examples disabled so a topic remains the only required input.
await writeFile(
  resolve(target, "sources.json"),
  `${JSON.stringify(
    [
      { enabled: false, type: "site", url: "https://example.com" },
      {
        enabled: false,
        type: "github-repo",
        url: "https://github.com/example/repo",
        branch: "main",
      },
      { enabled: false, type: "google-releases", url: "https://example.com/releases.xml" },
      { enabled: false, type: "video", url: "https://example.com/video" },
    ],
    null,
    2,
  )}\n`,
);
await writeFile(
  resolve(target, "package.json"),
  `${JSON.stringify(
    {
      private: true,
      type: "module",
      scripts: Object.fromEntries(
        Object.keys(wrappers).map((name) => [name, `zx ${name}.mjs`]),
      ),
      dependencies: { zx: "8.8.5" },
    },
    null,
    2,
  )}\n`,
);
await writeFile(
  resolve(target, "README.md"),
  "# Topic harnesses\n\n```bash\nnpm install\nnpm run codex -- \"your topic\"\n```\n\nUse `copilot`, `pi`, or `opencode` instead. Enable extra sources in `sources.json` and set `OPEN_KNOWLEDGE_FORMAT_SKILL`.\n",
);
console.log(`Scaffolded compact topic harnesses at ${target}`);
