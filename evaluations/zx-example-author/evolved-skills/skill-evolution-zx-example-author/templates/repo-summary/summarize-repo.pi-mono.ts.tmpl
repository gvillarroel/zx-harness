import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { homedir, tmpdir } from "node:os";
import { basename, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { completeSimple, getModel } from "@mariozechner/pi-ai";
import { getOAuthApiKey } from "@mariozechner/pi-ai/oauth";

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
const requestedProvider = process.env.PI_MONO_REPO_SUMMARY_PROVIDER?.trim() || "";
const requestedModelId = process.env.PI_MONO_REPO_SUMMARY_MODEL?.trim() || "";
const reasoning = (process.env.PI_MONO_REPO_SUMMARY_REASONING ?? "low").trim() as
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh";
const maxBytes = Number(process.env.PI_MONO_REPO_SUMMARY_MAX_BYTES ?? "6000");
const timeoutMs = Number(process.env.PI_MONO_REPO_SUMMARY_TIMEOUT_MS ?? "900000");
const explicitApiKey = process.env.PI_MONO_REPO_SUMMARY_API_KEY?.trim() || undefined;
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
  "run",
  "target",
]);

if (!repoInput) {
  throw new Error("Usage: npm exec -- tsx summarize-repo.ts <repo-path-or-url> [output-file]");
}

await mkdir(runDir, { recursive: true });

// Reuse pi OAuth state when it exists so the example works with an already logged-in environment.
const authFile = resolve(homedir(), ".pi", "agent", "auth.json");
const authData = JSON.parse(
  (await readFile(authFile, "utf8").catch(() => "{}")) || "{}",
) as Record<string, Record<string, unknown>>;
const provider =
  requestedProvider ||
  (authData["github-copilot"]
    ? "github-copilot"
    : authData["openai-codex"]
      ? "openai-codex"
      : "openai");
const modelId =
  requestedModelId ||
  (provider === "openai-codex" || provider === "github-copilot" ? "gpt-5.4-mini" : "gpt-5-mini");
const model = getModel(provider as never, modelId as never);

if (!model) {
  throw new Error(`Model not found: ${provider}/${modelId}`);
}

const target = await resolveTarget(repoInput);
const safeSlug = target.displayName.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
const outputFile = requestedOutput ? resolve(requestedOutput) : resolve(runDir, `${safeSlug || "repo"}-summary.md`);
const mapFile = resolve(runDir, `${safeSlug || "repo"}-map.json`);
const treeFile = resolve(runDir, `${safeSlug || "repo"}-tree.json`);
const fileEntries = await collectFileEntries(target.scopeDir);

if (!fileEntries.length) {
  await cleanupTarget(target);
  throw new Error("No text files were available to summarize.");
}

const tree = buildTree(fileEntries.map((entry) => entry.path));
await writeFile(treeFile, `${JSON.stringify(tree, null, 2)}\n`);

let apiKey = explicitApiKey;
if (!apiKey && authData[provider]) {
  const oauthResult = await getOAuthApiKey(provider as never, authData as never).catch(() => null);

  if (oauthResult?.apiKey) {
    apiKey = oauthResult.apiKey;
  }
}

// Summarize concrete file pairs first so later merges operate on smaller, stable chunks.
let summaryNodes: SummaryNode[] = [];
for (let index = 0; index < fileEntries.length; index += 2) {
  const pair = fileEntries.slice(index, index + 2);
  const prompt = [
    `mapped_files: ${pair.map((entry) => entry.path).join(", ")}`,
    "Summarize the intent, structure, and important behaviors of these files.",
    ...pair.map((entry) => `File: ${entry.path}\n${entry.content}`),
  ].join("\n\n");
  const summary = await completeWithTimeout(prompt, timeoutMs, { apiKey, model, reasoning });
  summaryNodes.push({
    level: 0,
    paths: pair.map((entry) => entry.path),
    summary,
  });
}

// Merge in pairs so the reduction path stays obvious and the final summary remains inspectable.
while (summaryNodes.length > 1) {
  const nextLevel: SummaryNode[] = [];
  for (let index = 0; index < summaryNodes.length; index += 2) {
    const pair = summaryNodes.slice(index, index + 2);
    if (pair.length === 1) {
      nextLevel.push(pair[0]);
      continue;
    }

    const prompt = [
      `merge_level: ${pair[0].level + 1}`,
      `mapped_files: ${pair.flatMap((entry) => entry.paths).join(", ")}`,
      "Merge these repository summaries into one concise markdown summary.",
      ...pair.map((entry) => entry.summary),
    ].join("\n\n");
    const summary = await completeWithTimeout(prompt, timeoutMs, { apiKey, model, reasoning });
    nextLevel.push({
      level: pair[0].level + 1,
      paths: pair.flatMap((entry) => entry.paths),
      summary,
    });
  }
  summaryNodes = nextLevel;
}

await writeFile(
  mapFile,
  `${JSON.stringify(
    {
      target: target.displayName,
      provider,
      modelId,
      files: fileEntries.map((entry) => ({
        path: entry.path,
        size: entry.size,
        truncated: entry.truncated,
      })),
    },
    null,
    2,
  )}\n`,
);
await writeFile(outputFile, `${summaryNodes[0].summary.trim()}\n`);
await cleanupTarget(target);

async function resolveTarget(input: string): Promise<RepoTarget> {
  const githubTreeMatch = input.match(
    /^https:\/\/github\.com\/([^/\s]+)\/([^/\s]+?)(?:\/tree\/([^/\s]+)(?:\/(.+))?)?\/?$/,
  );

  if (!githubTreeMatch) {
    const scopeDir = resolve(input);
    const scopeStats = await stat(scopeDir).catch(() => null);
    if (!scopeStats?.isDirectory()) {
      throw new Error(`Repository path not found: ${scopeDir}`);
    }

    return {
      checkoutDir: scopeDir,
      scopeDir,
      displayName: basename(scopeDir),
    };
  }

  const [, owner, repo, branch = "main", subpath = ""] = githubTreeMatch;
  const cloneUrl = `https://github.com/${owner}/${repo}.git`;
  const checkoutDir = await mkdtemp(join(tmpdir(), "pi-mono-repo-summary-"));

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

  return {
    checkoutDir,
    scopeDir,
    displayName: `${owner}/${repo}${subpath ? `/${subpath}` : ""}@${branch}`,
    cleanupDir: checkoutDir,
  };
}

async function collectFileEntries(scopeDir: string): Promise<FileEntry[]> {
  const fileEntries: FileEntry[] = [];
  const directoriesToVisit = [scopeDir];

  // Walk iteratively so the control flow stays flat and easy to modify.
  while (directoriesToVisit.length) {
    const currentDir = directoriesToVisit.pop()!;
    const entries = await readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const absolutePath = join(currentDir, entry.name);
      const relativePath = relative(scopeDir, absolutePath).replaceAll("\\", "/");

      if (entry.isDirectory()) {
        if (!ignoredDirNames.has(entry.name)) {
          directoriesToVisit.push(absolutePath);
        }
        continue;
      }

      const extension = extname(relativePath).toLowerCase();
      if (extension && !allowedTextExtensions.has(extension)) {
        continue;
      }

      const fileStats = await stat(absolutePath);
      const contentBuffer = await readFile(absolutePath);
      if (contentBuffer.includes(0)) {
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
  }

  return fileEntries.sort((left, right) => left.path.localeCompare(right.path));
}

function buildTree(paths: string[]) {
  const root = { name: ".", path: ".", type: "directory", children: [] as any[] };

  for (const filePath of paths) {
    const segments = filePath.split("/");
    let cursor = root;
    let currentPath = "";

    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index];
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      const isLeaf = index === segments.length - 1;
      let child = cursor.children.find((entry) => entry.name === segment);

      if (!child) {
        child = {
          name: segment,
          path: currentPath,
          type: isLeaf ? "file" : "directory",
          children: isLeaf ? undefined : [],
        };
        cursor.children.push(child);
      }

      if (!isLeaf) {
        cursor = child;
      }
    }
  }

  return root;
}

async function completeWithTimeout(
  prompt: string,
  timeoutMs: number,
  options: { apiKey?: string; model: NonNullable<ReturnType<typeof getModel>>; reasoning: string },
): Promise<string> {
  let timeoutHandle: NodeJS.Timeout | undefined;

  try {
    const response = await Promise.race([
      completeSimple(
        options.model,
        {
          messages: [{ role: "user", content: prompt, timestamp: Date.now() }],
        },
        {
          apiKey: options.apiKey,
          reasoning: options.reasoning as never,
        },
      ),
      new Promise<never>((_, rejectPromise) => {
        timeoutHandle = setTimeout(
          () => rejectPromise(new Error(`pi-mono call timed out after ${timeoutMs}ms`)),
          timeoutMs,
        );
      }),
    ]);

    return response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text.trim())
      .filter(Boolean)
      .join("\n")
      .trim() || "No summary returned.";
  } finally {
    clearTimeout(timeoutHandle);
  }
}

async function cleanupTarget(target: RepoTarget) {
  if (target.cleanupDir) {
    await rm(target.cleanupDir, { recursive: true, force: true });
  }
}
