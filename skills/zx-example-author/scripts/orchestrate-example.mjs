#!/usr/bin/env zx
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Keep every variant contract in one table so the orchestration stays data-driven.
// Each file gets a narrow prompt and the literals we must preserve.
const specs = {
  "hello-name": {
    classification: "interactive-small",
    scaffold: "node scripts/scaffold-example.mjs hello-name <target-directory>",
    policy: {
      reviewPasses: 1,
      reflectionPasses: 1,
      literalFixPasses: 1,
      minSimilarity: 0.9,
      allowRewrite: false,
    },
    request:
      "Create a small zx example in `hello-name/index.mjs` that takes a name from the CLI when present, otherwise prompts for it, prints `hello <name>`, and returns only a brief completion note after the file is written.",
    files: [
      {
        path: "index.mjs",
        classification: "entrypoint",
        literals: [
          "#!/usr/bin/env zx",
          "question(",
          "hello ${",
          "process.argv",
          "trim(",
          "Error",
        ],
      },
    ],
  },
  "hello-cop": {
    classification: "wrapper-small",
    scaffold: "node scripts/scaffold-example.mjs hello-cop <target-directory>",
    policy: {
      reviewPasses: 2,
      reflectionPasses: 1,
      literalFixPasses: 1,
      minSimilarity: 0.88,
      allowRewrite: false,
    },
    request:
      "Create a small zx example in `hello-cop/index.mjs` that runs one tiny Copilot CLI prompt with zx and returns only a brief completion note after the file is written.",
    files: [
      {
        path: "index.mjs",
        classification: "entrypoint",
        literals: [
          "#!/usr/bin/env zx",
          "$.quote = quote;",
          "copilot -p 'ping' --model gpt-5-mini",
        ],
      },
    ],
  },
  "gh-involved-repos": {
    classification: "strict-listing",
    scaffold: "node scripts/scaffold-example.mjs gh-involved-repos <target-directory>",
    policy: {
      reviewPasses: 2,
      reflectionPasses: 2,
      literalFixPasses: 2,
      minSimilarity: 0.94,
      allowRewrite: false,
    },
    request:
      "Create a small example folder named `gh-involved-repos` with `index.mjs` and `repo.ts` that lists repos the current GitHub user is involved in, prints one `name: owner/repo` per line, and returns only a brief completion note after the files are written.",
    files: [
      {
        path: "index.mjs",
        classification: "entrypoint",
        literals: [
          'import { printRepo } from "./repo.ts";',
          "gh api user --jq .login",
          "--limit 1000 --json repository",
          "printRepo(repo);",
        ],
      },
      {
        path: "repo.ts",
        classification: "formatter",
        literals: [
          "console.log(`name: ${name}`);",
        ],
      },
    ],
  },
  "copilot-sdk-repo-summary": {
    classification: "summary-template",
    scaffold:
      "node scripts/scaffold-example.mjs copilot-sdk-repo-summary <target-directory>",
    policy: {
      reviewPasses: 1,
      reflectionPasses: 1,
      literalFixPasses: 1,
      minSimilarity: 0.96,
      allowRewrite: false,
    },
    request:
      "Create a folder named `copilot-sdk-repo-summary` with `index.mjs`, `summarize-repo.ts`, `package.json`, `tsconfig.json`, and a short README. The zx entrypoint should verify `node`, `npm`, and `git`, require local dependencies to be installed, and then run `npm exec -- tsx summarize-repo.ts`. The TypeScript script should accept a local repo path or GitHub tree URL, summarize the repository by mapping files, summarizing files in pairs with the Copilot SDK, merging summaries in pairs, and writing the final markdown summary plus map and tree JSON files under `run/`.",
    files: [
      {
        path: "index.mjs",
        classification: "entrypoint",
        literals: [
          "#!/usr/bin/env zx",
          "$.quote = quote;",
          'for (const command of ["node", "npm", "git"])',
          "npm exec -- tsx summarize-repo.ts",
        ],
      },
      {
        path: "summarize-repo.ts",
        classification: "summarizer",
        literals: [
          "CopilotClient",
          "approveAll",
          "mapped_files:",
          "merge_level:",
        ],
      },
      {
        path: "package.json",
        classification: "package-manifest",
        literals: ['"@github/copilot-sdk"'],
      },
      {
        path: "tsconfig.json",
        classification: "config",
        literals: ['"module": "NodeNext"'],
      },
    ],
  },
  "pi-mono-repo-summary": {
    classification: "summary-template",
    scaffold:
      "node scripts/scaffold-example.mjs pi-mono-repo-summary <target-directory>",
    policy: {
      reviewPasses: 1,
      reflectionPasses: 1,
      literalFixPasses: 1,
      minSimilarity: 0.96,
      allowRewrite: false,
    },
    request:
      "Create a folder named `pi-mono-repo-summary` with `index.mjs`, `summarize-repo.ts`, `package.json`, `tsconfig.json`, and a short README. The zx entrypoint should verify `node`, `npm`, and `git`, require local dependencies to be installed, and then run `npm exec -- tsx summarize-repo.ts`. The TypeScript script should accept a local repo path or GitHub tree URL, choose provider and model from environment variables when present, summarize the repository by mapping files, summarizing files in pairs with pi-mono, merging summaries in pairs, and writing the final markdown summary plus map and tree JSON files under `run/`.",
    files: [
      {
        path: "index.mjs",
        classification: "entrypoint",
        literals: [
          "#!/usr/bin/env zx",
          "$.quote = quote;",
          'for (const command of ["node", "npm", "git"])',
          "npm exec -- tsx summarize-repo.ts",
        ],
      },
      {
        path: "summarize-repo.ts",
        classification: "summarizer",
        literals: [
          "completeSimple",
          "getModel",
          "getOAuthApiKey",
          "PI_MONO_REPO_SUMMARY_PROVIDER",
          "mapped_files:",
        ],
      },
      {
        path: "package.json",
        classification: "package-manifest",
        literals: ['"@mariozechner/pi-ai"'],
      },
      {
        path: "tsconfig.json",
        classification: "config",
        literals: ['"module": "NodeNext"'],
      },
    ],
  },
};

const rawArgs = process.argv[2]?.endsWith(".mjs")
  ? process.argv.slice(3)
  : process.argv.slice(2);
const variant = (rawArgs[0] ?? "").trim();
const targetDirArg = (rawArgs[1] ?? "").trim();
const estimateOnly = process.argv.includes("--estimate-only");

if (!variant || !targetDirArg) {
  throw new Error(
    "Usage: zx scripts/orchestrate-example.mjs <variant> <target-directory> [--estimate-only]",
  );
}

const spec = specs[variant];
if (!spec) {
  throw new Error(
    `Unsupported variant "${variant}". Supported: ${Object.keys(specs).join(", ")}`,
  );
}

// Estimate one scaffold plus three small Copilot passes per file so the user sees
// the extra latency before choosing this heavier path.
const reviewCalls = spec.files.length * spec.policy.reviewPasses;
const reflectionCalls = spec.files.length * spec.policy.reflectionPasses;
const literalFixCalls = spec.files.length * spec.policy.literalFixPasses;
const estimatedSeconds =
  10 + (reviewCalls * 20) + (reflectionCalls * 20) + (literalFixCalls * 20);
console.log(
  `orchestrate ${variant}: estimated ${Math.ceil(estimatedSeconds / 60)}-${Math.ceil((estimatedSeconds * 1.5) / 60)} min`,
);

if (estimateOnly) {
  process.exit(0);
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const skillDir = path.resolve(scriptDir, "..");
const targetDir = path.resolve(targetDirArg);
const copilotExe = path.join(
  process.env.LOCALAPPDATA ?? "",
  "Microsoft",
  "WinGet",
  "Links",
  "copilot.exe",
);

// Start from the local scaffold so every variant begins from the known-good shape.
runScaffold(skillDir, variant, targetDir);

// Review each file independently with the cheapest Copilot model so the task stays small.
for (const fileSpec of spec.files) {
  const filePath = path.join(targetDir, fileSpec.path);
  const scaffoldContent = await readFile(filePath, "utf8");
  let bestContent = scaffoldContent;
  let bestScore = scoreContent(scaffoldContent, fileSpec.literals, scaffoldContent);
  const minSimilarityLines = Math.max(
    1,
    Math.floor(
      scaffoldContent.replaceAll("\r\n", "\n").trimEnd().split("\n").length
      * spec.policy.minSimilarity,
    ),
  );

  const reviewPrompts = [
    [
      "You are editing one file in a tiny zx example.",
      `Variant classification: ${spec.classification}`,
      `File classification: ${fileSpec.classification}`,
      `User request: ${spec.request}`,
      `Canonical scaffold command: ${spec.scaffold}`,
      `Target file: ${fileSpec.path}`,
      "Required literals:",
      ...fileSpec.literals.map((literal) => `- ${literal}`),
      `Minimum unchanged scaffold lines: ${minSimilarityLines}`,
      "Current scaffold content:",
      scaffoldContent,
      "Keep the scaffold shape when possible.",
      "Return KEEP if the current file is already correct.",
      "Otherwise return only the full replacement file content with no markdown fences.",
    ].join("\n"),
    [
      "Patch one scaffolded file with the smallest possible change set.",
      `Variant classification: ${spec.classification}`,
      `File classification: ${fileSpec.classification}`,
      `User request: ${spec.request}`,
      `Canonical scaffold command: ${spec.scaffold}`,
      `Target file: ${fileSpec.path}`,
      "Required literals:",
      ...fileSpec.literals.map((literal) => `- ${literal}`),
      `Minimum unchanged scaffold lines: ${minSimilarityLines}`,
      "Current scaffold content:",
      scaffoldContent,
      "Do not redesign the file.",
      "Do not switch APIs, CLIs, helper names, imports, or file purpose.",
      "Return KEEP if no edit is needed.",
      "Otherwise return only the full replacement file content with no markdown fences.",
    ].join("\n"),
  ];

  for (let index = 0; index < spec.policy.reviewPasses; index += 1) {
    const reply = runCopilot(
      copilotExe,
      skillDir,
      reviewPrompts[index % reviewPrompts.length],
    );
    const content = normalizeCopilotReply(reply, scaffoldContent);
    const score = scoreContent(content, fileSpec.literals, scaffoldContent);

    if (score > bestScore) {
      bestContent = content;
      bestScore = score;
    }
  }

  for (let index = 0; index < spec.policy.reflectionPasses; index += 1) {
    const reflectionPrompt = [
      "Reflect on one file in a tiny zx example.",
      `Variant classification: ${spec.classification}`,
      `File classification: ${fileSpec.classification}`,
      `User request: ${spec.request}`,
      `Canonical scaffold command: ${spec.scaffold}`,
      `Target file: ${fileSpec.path}`,
      "Required literals:",
      ...fileSpec.literals.map((literal) => `- ${literal}`),
      `Minimum unchanged scaffold lines: ${minSimilarityLines}`,
      "Scaffold content:",
      scaffoldContent,
      "Current best content:",
      bestContent,
      "Prefer KEEP unless one missing literal or one tiny correction is still needed.",
      "Otherwise return only the full improved file content with no markdown fences.",
    ].join("\n");

    const reflectionContent = normalizeCopilotReply(
      runCopilot(copilotExe, skillDir, reflectionPrompt),
      bestContent,
    );
    const reflectionScore = scoreContent(
      reflectionContent,
      fileSpec.literals,
      scaffoldContent,
    );

    if (reflectionScore > bestScore) {
      bestContent = reflectionContent;
      bestScore = reflectionScore;
    }
  }

  const missingLiterals = fileSpec.literals.filter(
    (literal) => !bestContent.includes(literal),
  );

  for (let index = 0; index < spec.policy.literalFixPasses; index += 1) {
    const currentMissing = fileSpec.literals.filter(
      (literal) => !bestContent.includes(literal),
    );

    if (!currentMissing.length) {
      break;
    }

    const literalFixPrompt = [
      "Fix missing literals in one scaffolded file.",
      `Variant classification: ${spec.classification}`,
      `File classification: ${fileSpec.classification}`,
      `User request: ${spec.request}`,
      `Canonical scaffold command: ${spec.scaffold}`,
      `Target file: ${fileSpec.path}`,
      "Missing literals:",
      ...currentMissing.map((literal) => `- ${literal}`),
      `Minimum unchanged scaffold lines: ${minSimilarityLines}`,
      "Current best content:",
      bestContent,
      "Keep every other line as close to the scaffold as possible.",
      "Do not change lines that already satisfy the request.",
      "Return only the full replacement file content with no markdown fences.",
    ].join("\n");
    const literalFixContent = normalizeCopilotReply(
      runCopilot(copilotExe, skillDir, literalFixPrompt),
      bestContent,
    );
    const literalFixScore = scoreContent(
      literalFixContent,
      fileSpec.literals,
      scaffoldContent,
    );

    if (literalFixScore >= bestScore) {
      bestContent = literalFixContent;
      bestScore = literalFixScore;
    }
  }

  await writeFile(filePath, bestContent);
}

// Verify the final files locally so the orchestration only finishes on a passing draft.
for (const fileSpec of spec.files) {
  const filePath = path.join(targetDir, fileSpec.path);
  const content = await readFile(filePath, "utf8");

  for (const literal of fileSpec.literals) {
    if (!content.includes(literal)) {
      throw new Error(`${fileSpec.path}: missing literal: ${literal}`);
    }
  }
}

console.log(`orchestrate ${variant}: ok`);

function runCopilot(executable, cwd, promptText) {
  return execFileSync(
    executable,
    [
      "--yolo",
      "--no-ask-user",
      "--silent",
      "--model",
      "gpt-5-mini",
      "--effort",
      "low",
      "--add-dir",
      cwd,
      "-p",
      promptText,
    ],
    {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  ).trim();
}

function runScaffold(cwd, variantId, destinationDir) {
  execFileSync(
    process.execPath,
    [path.join(cwd, "scripts", "scaffold-example.mjs"), variantId, destinationDir],
    {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
}

function normalizeCopilotReply(reply, fallback) {
  const trimmed = reply.trim();

  if (!trimmed || trimmed === "KEEP") {
    return fallback;
  }

  if (trimmed.startsWith("```")) {
    const lines = trimmed.split(/\r?\n/);
    const withoutFence = lines.slice(1, lines[lines.length - 1] === "```" ? -1 : lines.length);
    return withoutFence.join("\n").trim();
  }

  return trimmed;
}

function scoreContent(candidate, literals, scaffold) {
  let score = 0;

  for (const literal of literals) {
    if (candidate.includes(literal)) {
      score += 10;
    }
  }

  // Prefer simpler candidates that stay close to the scaffold when literal coverage ties.
  const candidateLines = candidate.replaceAll("\r\n", "\n").trimEnd().split("\n");
  const scaffoldLines = scaffold.replaceAll("\r\n", "\n").trimEnd().split("\n");
  const comparable = Math.min(candidateLines.length, scaffoldLines.length);

  for (let index = 0; index < comparable; index += 1) {
    if (candidateLines[index] === scaffoldLines[index]) {
      score += 1;
    }
  }

  return score;
}
