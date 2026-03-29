import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { basename, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { CopilotClient, approveAll } from "@github/copilot-sdk";

type RepoTarget = {
  checkoutDir: string;
  scopeDir: string;
  displayName: string;
  cleanupDir?: string;
};

type FileEntry = {
  path: string;
  size: number;
  truncated: boolean;
  content: string;
};

type SummaryNode = {
  level: number;
  paths: string[];
  summary: string;
};

const exampleDir = fileURLToPath(new URL(".", import.meta.url));
const runDir = resolve(exampleDir, "run");
const repoInput = (process.argv[2] ?? "").trim();
const requestedOutput = (process.argv[3] ?? "").trim();
const model = (process.env.COPILOT_REPO_SUMMARY_MODEL ?? "gpt-5-mini").trim();
const reasoningEffort = (process.env.COPILOT_REPO_SUMMARY_REASONING ?? "low").trim() as
  | "low"
  | "medium"
  | "high"
  | "xhigh";
const maxBytes = Number(process.env.COPILOT_REPO_SUMMARY_MAX_BYTES ?? "6000");
const concurrency = Number(process.env.COPILOT_REPO_SUMMARY_CONCURRENCY ?? "4");
const timeoutMs = Number(process.env.COPILOT_REPO_SUMMARY_TIMEOUT_MS ?? "900000");
const allowedTextExtensions = new Set([
  ".cjs",
  ".css",
  ".html",
  ".java",
  ".js",
  ".json",
  ".jsx",
  ".mjs",
  ".md",
  ".mts",
  ".py",
  ".rb",
  ".rs",
  ".sh",
  ".sql",
  ".svg",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".xml",
  ".yaml",
  ".yml",
]);
const ignoredDirNames = new Set([
  ".git",
  ".next",
  ".turbo",
  ".yarn",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "target",
]);
const lowSignalFileNames = new Set([
  ".gitignore",
  ".npmignore",
  ".prettierignore",
  ".prettierrc.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
]);

if (!repoInput) {
  throw new Error(
    "Usage: npm exec -- tsx summarize-repo.ts <repo-path-or-url> [output-file]",
  );
}

if (!Number.isFinite(maxBytes) || maxBytes <= 0) {
  throw new Error("COPILOT_REPO_SUMMARY_MAX_BYTES must be a positive number.");
}

if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
  throw new Error("COPILOT_REPO_SUMMARY_TIMEOUT_MS must be a positive number.");
}

if (!Number.isFinite(concurrency) || concurrency <= 0) {
  throw new Error("COPILOT_REPO_SUMMARY_CONCURRENCY must be a positive number.");
}

await mkdir(runDir, { recursive: true });

// Parse GitHub tree URLs so a link like /tree/main/nodejs summarizes only the requested subtree.
let target: RepoTarget;
const githubTreeMatch = repoInput.match(
  /^https:\/\/github\.com\/([^/\s]+)\/([^/\s]+?)(?:\/tree\/([^/\s]+)(?:\/(.+))?)?\/?$/,
);

if (githubTreeMatch) {
  const [, owner, repo, branch = "main", subpath = ""] = githubTreeMatch;
  const cloneUrl = `https://github.com/${owner}/${repo}.git`;
  const checkoutDir = await mkdtemp(join(tmpdir(), "copilot-sdk-repo-summary-"));

  // Clone shallowly because the summarizer only needs the current tree, not history.
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn("git", ["clone", "--depth", "1", "--branch", branch, cloneUrl, checkoutDir], {
      stdio: "inherit",
    });
    child.on("error", rejectPromise);
    child.on("exit", (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      rejectPromise(new Error(`git clone failed with code ${code}`));
    });
  });

  const scopeDir = subpath ? resolve(checkoutDir, subpath) : checkoutDir;
  const scopeStats = await stat(scopeDir).catch(() => null);
  if (!scopeStats?.isDirectory()) {
    await rm(checkoutDir, { recursive: true, force: true });
    throw new Error(`Requested tree path not found after clone: ${subpath}`);
  }

  target = {
    checkoutDir,
    scopeDir,
    displayName: `${owner}/${repo}${subpath ? `/${subpath}` : ""}@${branch}`,
    cleanupDir: checkoutDir,
  };
} else {
  const scopeDir = resolve(repoInput);
  const scopeStats = await stat(scopeDir).catch(() => null);
  if (!scopeStats?.isDirectory()) {
    throw new Error(`Repository path not found: ${scopeDir}`);
  }

  target = {
    checkoutDir: scopeDir,
    scopeDir,
    displayName: basename(scopeDir),
  };
}

const safeSlug = target.displayName
  .replace(/[^a-zA-Z0-9._-]+/g, "-")
  .replace(/^-+|-+$/g, "")
  .toLowerCase();
const outputFile = requestedOutput
  ? resolve(requestedOutput)
  : resolve(runDir, `${safeSlug || "repo"}-summary.md`);
const mapFile = resolve(runDir, `${safeSlug || "repo"}-map.json`);
const treeFile = resolve(runDir, `${safeSlug || "repo"}-tree.json`);

const mappedFiles: string[] = [];
const skippedFiles: Array<{ path: string; reason: string }> = [];
const directoriesToVisit = [target.scopeDir];

// Walk the tree iteratively so the script stays simple and the whole repository is mapped before summarization starts.
while (directoriesToVisit.length) {
  const currentDir = directoriesToVisit.pop()!;
  const entries = await readdir(currentDir, { withFileTypes: true });

  for (const entry of entries) {
    const absolutePath = join(currentDir, entry.name);
    const relativePath = relative(target.scopeDir, absolutePath).replaceAll("\\", "/");

    if (entry.isDirectory()) {
      if (ignoredDirNames.has(entry.name)) {
        skippedFiles.push({ path: relativePath || entry.name, reason: "ignored-directory" });
        continue;
      }

      directoriesToVisit.push(absolutePath);
      continue;
    }

    mappedFiles.push(relativePath);
  }
}

mappedFiles.sort();

const fileEntries: FileEntry[] = [];

// Read every mapped file and keep only text-like inputs for the LLM stages.
for (const relativePath of mappedFiles) {
  const absolutePath = resolve(target.scopeDir, relativePath);
  const fileStats = await stat(absolutePath);
  const extension = extname(relativePath).toLowerCase();
  const baseName = basename(relativePath);

  // Skip generated and dependency lock artifacts by default because they dominate tokens and add little design signal.
  if (lowSignalFileNames.has(baseName) || relativePath.startsWith("src/generated/")) {
    skippedFiles.push({ path: relativePath, reason: "generated-or-low-signal" });
    continue;
  }

  if (!allowedTextExtensions.has(extension) && extension) {
    skippedFiles.push({ path: relativePath, reason: "unsupported-extension" });
    continue;
  }

  const contentBuffer = await readFile(absolutePath);
  if (contentBuffer.includes(0)) {
    skippedFiles.push({ path: relativePath, reason: "binary" });
    continue;
  }

  const slicedBuffer = contentBuffer.subarray(0, maxBytes);
  fileEntries.push({
    path: relativePath,
    size: fileStats.size,
    truncated: contentBuffer.length > maxBytes,
    content: slicedBuffer.toString("utf8"),
  });
}

if (!fileEntries.length) {
  if (target.cleanupDir) {
    await rm(target.cleanupDir, { recursive: true, force: true });
  }

  throw new Error("No text files were available to summarize.");
}

await writeFile(
  mapFile,
  `${JSON.stringify(
    {
      target: target.displayName,
      checkoutDir: target.checkoutDir,
      scopeDir: target.scopeDir,
      model,
      reasoningEffort,
      maxBytes,
      concurrency,
      timeoutMs,
      mappedFiles,
      summarizedFiles: fileEntries.map((entry) => ({
        path: entry.path,
        size: entry.size,
        truncated: entry.truncated,
      })),
      skippedFiles,
    },
    null,
    2,
  )}\n`,
);

const client = new CopilotClient({
  cliPath: process.env.COPILOT_CLI_PATH?.trim() || undefined,
  logLevel: "error",
});

try {
  await client.start();

  const callCopilot = async (prompt: string) => {
    // Use one short-lived session per node so each merge step stays independent and cheap to reason about.
    const session = await client.createSession({
      infiniteSessions: { enabled: false },
      model,
      onPermissionRequest: approveAll,
      reasoningEffort,
    });

    try {
      const response = await session.sendAndWait({ prompt }, timeoutMs);
      const content = response?.data?.content?.trim();

      if (!content) {
        throw new Error("Copilot returned an empty response.");
      }

      return content;
    } finally {
      await session.disconnect();
    }
  };

  const currentLevel: SummaryNode[] = [];
  const allLevels: Array<{ level: number; nodes: SummaryNode[] }> = [];

  console.log(`mapped_files: ${mappedFiles.length}`);
  console.log(`summarized_files: ${fileEntries.length}`);
  console.log(`skipped_files: ${skippedFiles.length}`);

  // Build the leaf layer from raw files in pairs because the user asked for a merge tree of two files at a time.
  for (let batchStart = 0; batchStart < fileEntries.length; batchStart += concurrency * 2) {
    const batchPromises: Array<Promise<SummaryNode>> = [];

    for (
      let index = batchStart;
      index < Math.min(fileEntries.length, batchStart + concurrency * 2);
      index += 2
    ) {
      const left = fileEntries[index];
      const right = fileEntries[index + 1];

      console.log(`leaf_pair: ${Math.floor(index / 2) + 1}`);

      const prompt = [
        "Summarize repository files for a bottom-up repository summary.",
        "",
        "Rules:",
        "- Answer in English.",
        "- Be compact and specific.",
        "- Focus on behavior, role, interfaces, and notable dependencies.",
        "- Mention uncertainty when content is truncated.",
        "- Start with `Files:` followed by the covered paths.",
        "- Then write `Summary:` on the next line with one dense paragraph.",
        "",
        `Repository scope: ${target.displayName}`,
        "",
        `File A: ${left.path}`,
        `Size: ${left.size} bytes`,
        `Truncated: ${left.truncated ? "yes" : "no"}`,
        "Content:",
        left.content,
        "",
        right
          ? [
              `File B: ${right.path}`,
              `Size: ${right.size} bytes`,
              `Truncated: ${right.truncated ? "yes" : "no"}`,
              "Content:",
              right.content,
            ].join("\n")
          : "File B: none",
      ].join("\n");

      batchPromises.push(
        callCopilot(prompt).then((summary) => ({
          level: 0,
          paths: right ? [left.path, right.path] : [left.path],
          summary,
        })),
      );
    }

    currentLevel.push(...(await Promise.all(batchPromises)));
  }

  allLevels.push({
    level: 0,
    nodes: currentLevel.map((node) => ({ ...node })),
  });

  let activeLevel = currentLevel;
  let levelNumber = 1;

  // Merge previous summaries in pairs until a single root remains.
  while (activeLevel.length > 1) {
    const nextLevel: SummaryNode[] = [];

    for (let batchStart = 0; batchStart < activeLevel.length; batchStart += concurrency * 2) {
      const batchPromises: Array<Promise<SummaryNode>> = [];

      for (
        let index = batchStart;
        index < Math.min(activeLevel.length, batchStart + concurrency * 2);
        index += 2
      ) {
        const left = activeLevel[index];
        const right = activeLevel[index + 1];

        console.log(`merge_level: ${levelNumber}`);
        console.log(`merge_pair: ${Math.floor(index / 2) + 1}`);

        const prompt = [
          "Merge repository subtree summaries into one higher-level summary.",
          "",
          "Rules:",
          "- Answer in English.",
          "- Keep concrete file paths when they matter.",
          "- Preserve architecture and flow details.",
          "- Remove duplicates.",
          "- Start with `Files:` followed by the covered paths.",
          "- Then write `Summary:` on the next line with one dense paragraph.",
          "",
          `Repository scope: ${target.displayName}`,
          "",
          `Left files: ${left.paths.join(", ")}`,
          "Left summary:",
          left.summary,
          "",
          right
            ? [`Right files: ${right.paths.join(", ")}`, "Right summary:", right.summary].join(
                "\n",
              )
            : "Right summary: none",
        ].join("\n");

        batchPromises.push(
          callCopilot(prompt).then((summary) => ({
            level: levelNumber,
            paths: right ? [...left.paths, ...right.paths] : [...left.paths],
            summary,
          })),
        );
      }

      nextLevel.push(...(await Promise.all(batchPromises)));
    }

    allLevels.push({
      level: levelNumber,
      nodes: nextLevel.map((node) => ({ ...node })),
    });
    activeLevel = nextLevel;
    levelNumber += 1;
  }

  const rootNode = activeLevel[0];
  const finalPrompt = [
    "Write the final repository summary from the mapped tree and the root merge summary.",
    "",
    "Rules:",
    "- Answer in English.",
    "- Keep it compact.",
    "- Use markdown headings: Scope, Architecture, Important Files, Flow, Risks.",
    "- In Scope, mention mapped file count, summarized file count, skipped file count, and the target path.",
    "- In Important Files, list up to 10 paths.",
    "- In Risks, mention truncation, skipped files, or blind spots only if relevant.",
    "",
    `Target: ${target.displayName}`,
    `Mapped files: ${mappedFiles.length}`,
    `Summarized files: ${fileEntries.length}`,
    `Skipped files: ${skippedFiles.length}`,
    "",
    "Root summary:",
    rootNode.summary,
    "",
    "Mapped files:",
    mappedFiles.join("\n"),
    "",
    "Skipped files:",
    skippedFiles.length
      ? skippedFiles.map((item) => `${item.path} :: ${item.reason}`).join("\n")
      : "none",
  ].join("\n");

  const finalSummary = await callCopilot(finalPrompt);

  await writeFile(
    treeFile,
    `${JSON.stringify(
      {
        target: target.displayName,
        levels: allLevels.map((level) => ({
          level: level.level,
          nodes: level.nodes.map((node) => ({
            paths: node.paths,
            summary: node.summary,
          })),
        })),
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(outputFile, `${finalSummary.trim()}\n`);

  console.log(`summary_file: ${outputFile}`);
  console.log(`map_file: ${mapFile}`);
  console.log(`tree_file: ${treeFile}`);
} finally {
  await client.stop().catch(() => []);

  if (target.cleanupDir) {
    await rm(target.cleanupDir, { recursive: true, force: true });
  }
}
