#!/usr/bin/env zx

import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import os from "node:os";
import { fileURLToPath } from "node:url";

$.quote = quote;

// Keep the example flat: parse args, collect a little context, ask Codex to investigate, verify the file exists.
const exampleDir = fileURLToPath(new URL(".", import.meta.url));
const [repo = "", issueNumberText = ""] = process.argv.slice(3).map((value) => value.trim());
const issueNumber = Number(issueNumberText);

if (!repo || !/^[^/\s]+\/[^/\s]+$/.test(repo)) {
  throw new Error("Usage: zx examples/gh-issue-knowledge/index.mjs <owner/repo> <issue-number>");
}

if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
  throw new Error("Issue number must be a positive integer.");
}

// Validate the only hard dependencies before doing real work.
for (const command of ["gh", "codex"]) {
  try {
    await $`${command} --version`;
  } catch {
    throw new Error(`Required CLI not found: ${command}`);
  }
}

// Keep local-source configuration explicit. Extra directories are optional and only widen what Codex may inspect.
const repoDir = process.env.ISSUE_KNOWLEDGE_REPO_DIR?.trim()
  ? resolve(process.env.ISSUE_KNOWLEDGE_REPO_DIR.trim())
  : "";
const extraDirs = (process.env.ISSUE_KNOWLEDGE_DIRS ?? "")
  .split(process.platform === "win32" ? ";" : ":")
  .map((value) => value.trim())
  .filter(Boolean)
  .map((value) => resolve(value));
const allowedDirs = [...new Set([repoDir, ...extraDirs].filter(Boolean))];

for (const dir of allowedDirs) {
  const dirStats = await stat(dir).catch(() => null);
  if (!dirStats?.isDirectory()) {
    throw new Error(`Configured directory not found: ${dir}`);
  }
}

// Fetch only the issue payload that materially improves the first prompt.
const issue = JSON.parse(
  (
    await $`gh issue view ${issueNumberText} --repo ${repo} --json title,body,url,state,labels,author,assignees,comments`
  ).stdout,
);

// Probe binaries by actually starting them so PATH quirks and wrapper scripts are handled consistently.
const canRun = async (command, args) =>
  await new Promise((resolvePromise) => {
    const probe = spawn(command, args, { stdio: ["ignore", "ignore", "ignore"] });
    probe.on("error", () => resolvePromise(false));
    probe.on("exit", (code) => resolvePromise(code === 0));
  });

// Run Codex non-interactively and capture only the final stdout message so this script can chain smaller review steps.
const runCodex = async ({ prompt, cwd, args = [] }) =>
  await new Promise((resolvePromise, rejectPromise) => {
    const codexCommand = [
      "--search",
      "exec",
      "--skip-git-repo-check",
      "--sandbox",
      "workspace-write",
      "-C",
      cwd,
      ...args,
      "-",
    ];
    const codexChild =
      process.platform === "win32"
        ? spawn(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", "codex.cmd", ...codexCommand], {
            cwd,
            stdio: ["pipe", "pipe", "ignore"],
          })
        : spawn("codex", codexCommand, {
            cwd,
            stdio: ["pipe", "pipe", "ignore"],
          });

    let stdout = "";
    codexChild.stdout.on("data", (data) => {
      stdout += data.toString();
    });
    codexChild.on("error", rejectPromise);
    codexChild.on("exit", (code) => {
      if (code === 0) {
        resolvePromise(stdout.trim());
        return;
      }

      rejectPromise(new Error(`codex exited with code ${code}`));
    });
    codexChild.stdin.end(prompt);
  });

const outputFile = join(
  exampleDir,
  `${repo.replace(/[\\/]/g, "-")}-${issueNumber}-task-knowledge.md`,
);
const runDir = join(exampleDir, "run");
await mkdir(runDir, { recursive: true });

const optionalSourceHints = [
  process.env.ISSUE_KNOWLEDGE_CONFLUENCE_HINT?.trim()
    ? `- Confluence: ${process.env.ISSUE_KNOWLEDGE_CONFLUENCE_HINT.trim()}`
    : "",
  process.env.ISSUE_KNOWLEDGE_BRAVE_HINT?.trim()
    ? `- Brave: ${process.env.ISSUE_KNOWLEDGE_BRAVE_HINT.trim()}`
    : "",
  process.env.ISSUE_KNOWLEDGE_EXTRA_SOURCES?.trim()
    ? `- Extra sources: ${process.env.ISSUE_KNOWLEDGE_EXTRA_SOURCES.trim()}`
    : "",
]
  .filter(Boolean)
  .join("\n");

// Brave CLI is optional. If configured, collect a few focused queries up front so the agent starts with external leads.
const braveBinCandidates = [
  process.env.ISSUE_KNOWLEDGE_BRAVE_BIN?.trim() || "",
  "bx",
  process.platform === "win32" ? join(os.homedir(), ".local", "bin", "bx.exe") : "",
].filter(Boolean);
let braveBin = "";
for (const candidate of braveBinCandidates) {
  if (candidate !== "bx") {
    const fileStats = await stat(candidate).catch(() => null);
    if (!fileStats?.isFile()) continue;
  }

  if (await canRun(candidate, ["--help"])) {
    braveBin = candidate;
    break;
  }
}
const braveEnabled = Boolean(braveBin);
const braveQueries = [
  `"${repo}" issue ${issueNumber} ${issue.title}`,
  `"${repo}" ${issue.title}`,
  `${issue.title}`,
];
const braveResultsPath = join(
  runDir,
  `${repo.replace(/[\\/]/g, "-")}-${issueNumber}-brave-results.md`,
);
let braveSummary = "- Brave CLI: not configured";

if (braveEnabled) {
  // Fail early if the configured binary does not actually execute `web`, so research does not silently skip a promised source.
  const bravePreflight = await new Promise((resolvePromise) => {
    const preflightChild = spawn(braveBin, ["web", `${repo} ${issueNumber}`], {
      cwd: exampleDir,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    preflightChild.stdout.on("data", (data) => {
      stdout += data.toString();
    });
    preflightChild.stderr.on("data", (data) => {
      stderr += data.toString();
    });
    preflightChild.on("error", (error) => {
      resolvePromise({ ok: false, stdout: "", stderr: error.message });
    });
    preflightChild.on("exit", (code) => {
      resolvePromise({ ok: code === 0, stdout: stdout.trim(), stderr: stderr.trim() });
    });
  });

  if (!bravePreflight.ok) {
    throw new Error(`Brave CLI preflight failed: ${bravePreflight.stderr || "unknown error"}`);
  }

  const extractionSchemaPath = join(runDir, "brave-page-extract-schema.json");
  await writeFile(
    extractionSchemaPath,
    `${JSON.stringify(
      {
        type: "object",
        additionalProperties: false,
        required: ["useful", "url", "summary"],
        properties: {
          useful: { type: "boolean" },
          url: { type: "string" },
          summary: { type: "string" },
        },
      },
      null,
      2,
    )}\n`,
  );

  const uniqueQueries = [...new Set(braveQueries.filter(Boolean))];
  const sections = [];
  const usefulSections = [];
  const seenUrls = new Set();

  for (const query of uniqueQueries) {
    // Use the tested `bx web "<query>"` contract from the local Brave skill and keep the raw payload for inspection.
    const result = await new Promise((resolvePromise) => {
      const braveChild = spawn(braveBin, ["web", query], {
        cwd: exampleDir,
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";
      braveChild.stdout.on("data", (data) => {
        stdout += data.toString();
      });
      braveChild.stderr.on("data", (data) => {
        stderr += data.toString();
      });
      braveChild.on("error", (error) => {
        resolvePromise({ query, ok: false, stdout: "", stderr: error.message });
      });
      braveChild.on("exit", (code) => {
        resolvePromise({
          query,
          ok: code === 0,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
        });
      });
    });

    let parsed = null;
    try {
      parsed = result.ok && result.stdout ? JSON.parse(result.stdout) : null;
    } catch {}

    const candidatePages = [
      ...(parsed?.web?.results ?? []),
      ...(parsed?.discussions?.results ?? []),
    ]
      .map((item) => ({
        title: item.title ?? "",
        url: item.url ?? "",
        description: item.description ?? "",
      }))
      .filter((item) => item.url.startsWith("http"))
      .filter((item) => {
        if (seenUrls.has(item.url)) return false;
        seenUrls.add(item.url);
        return true;
      })
      .slice(0, 6);

    // Iterate each returned page, fetch its body, and ask Codex to keep only materially useful findings.
    for (const page of candidatePages) {
      let pageText = "";
      try {
        const response = await fetch(page.url, {
          headers: {
            "user-agent": "zx-harness/1.0",
          },
        });
        const html = await response.text();
        pageText = html
          .replace(/<script[\s\S]*?<\/script>/gi, " ")
          .replace(/<style[\s\S]*?<\/style>/gi, " ")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 16000);
      } catch {}

      if (!pageText) continue;

      const extraction = await runCodex({
        cwd: exampleDir,
        args: ["--output-schema", extractionSchemaPath],
        prompt: `Review one web page for GitHub issue research.

Issue:
- Repo: ${repo}
- Issue: ${issueNumber}
- Title: ${issue.title}

Page:
- URL: ${page.url}
- Title: ${page.title || "(unknown)"}
- Search description: ${page.description || "(empty)"}

Page text:
${pageText}

Return JSON only.
- useful=true only if this page adds concrete evidence, context, workaround, root-cause clues, or implementation guidance for the issue.
- If useful=false, set summary to an empty string.
- If useful=true, set summary to one concise paragraph in English with only the useful details.`,
      }).catch(() => "");

      try {
        const parsedExtraction = JSON.parse(extraction);
        if (parsedExtraction.useful && parsedExtraction.summary.trim()) {
          usefulSections.push(
            [
              `- URL: ${parsedExtraction.url || page.url}`,
              `  Summary: ${parsedExtraction.summary.trim()}`,
            ].join("\n"),
          );
        }
      } catch {}
    }

    sections.push(
      [
        `## Query`,
        result.query,
        "",
        `## Status`,
        result.ok ? "ok" : "failed",
        "",
        `## Stdout`,
        result.stdout || "(empty)",
        "",
        `## Stderr`,
        result.stderr || "(empty)",
      ].join("\n"),
    );
  }

  await writeFile(braveResultsPath, `${sections.join("\n\n---\n\n")}\n`);
  const braveUsefulPath = join(
    runDir,
    `${repo.replace(/[\\/]/g, "-")}-${issueNumber}-brave-useful.md`,
  );
  await writeFile(
    braveUsefulPath,
    `${usefulSections.length ? usefulSections.join("\n") : "(no useful brave page findings)\n"}\n`,
  );
  const braveUsefulPreview = (await readFile(braveUsefulPath, "utf8")).slice(0, 12000);
  braveSummary = `- Brave CLI binary: ${braveBin.replaceAll("\\", "/")}\n- Brave raw results file: ${braveResultsPath.replaceAll("\\", "/")}\n- Brave useful findings file: ${braveUsefulPath.replaceAll("\\", "/")}\n- Brave useful findings:\n${braveUsefulPreview}`;
}

// Put the useful starting facts directly in the prompt so the run does not depend on temp files or local reads.
const prompt = `Investigate GitHub issue ${repo}#${issueNumber}.

Issue summary:
- State: ${issue.state}
- URL: ${issue.url}
- Title: ${issue.title}
- Author: ${issue.author?.login ?? "unknown"}
- Assignees: ${issue.assignees?.map((item) => item.login).join(", ") || "none"}
- Labels: ${issue.labels?.map((item) => item.name).join(", ") || "none"}
- Comments: ${issue.comments?.length ?? 0}

Issue body:
${issue.body?.trim() || "(empty)"}

Local context:
- Output file: ${outputFile.replaceAll("\\", "/")}
- Local repo dir: ${repoDir || "not provided"}
- Extra directories: ${extraDirs.length ? extraDirs.join(", ") : "none"}
- Brave source:
${braveSummary}
${optionalSourceHints ? `- Optional source hints:\n${optionalSourceHints}` : "- Optional source hints: none"}

Instructions:
- Investigate in loops until the issue is sufficiently understood or useful sources are exhausted.
- Inspect the local repo directory first when it is available.
- Then inspect external sources: web search, Brave CLI results if present, release notes, related bugs, standards, and upstream references.
- Use optional sources only if they are reachable and relevant.
- After each round, decide whether there is another concrete unresolved question worth investigating.
- Continue while there are unresolved questions with plausible sources.
- Stop only when more searching is unlikely to change triage or implementation decisions.
- Write the final answer only as markdown.
- Use sections: Issue, Repository Findings, External Findings, Open Questions, Suggested Next Steps, Sources.
- In Sources, list only files, commands, URLs, or docs actually used.
- If a source produced nothing useful, say so briefly.
- Do not include JSON, tool logs, or process chatter.
`;

// Prefer direct process spawning. Windows needs the cmd wrapper; other systems can run the binary directly.
const codexArgs = [
  "--search",
  "exec",
  "--skip-git-repo-check",
  "--sandbox",
  "workspace-write",
  "-C",
  exampleDir,
  "-o",
  outputFile,
];

for (const dir of allowedDirs) {
  codexArgs.push("--add-dir", dir);
}

const verbose = process.env.ISSUE_KNOWLEDGE_VERBOSE === "1";
const child =
  process.platform === "win32"
    ? spawn(process.env.ComSpec || "cmd.exe", [
        "/d",
        "/s",
        "/c",
        "codex.cmd",
        ...codexArgs,
        "-",
      ], {
        cwd: exampleDir,
        stdio: ["pipe", verbose ? "inherit" : "ignore", verbose ? "inherit" : "ignore"],
      })
    : spawn("codex", [...codexArgs, "-"], {
        cwd: exampleDir,
        stdio: ["pipe", verbose ? "inherit" : "ignore", verbose ? "inherit" : "ignore"],
      });

await new Promise((resolvePromise, rejectPromise) => {
  child.stdin.end(prompt);
  child.on("error", rejectPromise);
  child.on("exit", (code) => {
    if (code === 0) {
      resolvePromise();
      return;
    }

    rejectPromise(new Error(`codex exited with code ${code}`));
  });
});

const outputStats = await stat(outputFile).catch(() => null);
if (!outputStats?.isFile() || outputStats.size === 0) {
  throw new Error("Knowledge file was not written.");
}

console.log(`knowledge_file: ${outputFile}`);
