#!/usr/bin/env zx

$.quote = quote;

// Verify the only external runtime this example needs before doing useful work.
await $`node --version`;

// Load the same rules used by the GitHub Action so local simulation matches CI.
const ruleUrl = new URL("../../.github/danger-content-safety-rule.mjs", import.meta.url);
const { buildLinkSafetyReport, buildTruffleHogReport } = await import(ruleUrl.href);

// Mock fetch keeps the example deterministic and avoids real network dependencies.
const fetchImpl = async (url) => {
  if (url.includes("missing.example")) {
    return new Response("", { status: 404 });
  }

  return new Response("", { status: 200 });
};

// Mock files let the example show pass and fail cases without editing the workspace.
const scenarios = [
  {
    name: "clean-content",
    files: {
      "docs/clean.md": "Read https://example.com and [existing](./existing.md).\n",
      "docs/existing.md": "Existing target.\n",
    },
    changedFiles: ["docs/clean.md"],
  },
  {
    name: "blocked-content",
    files: {
      "docs/risky.md": [
        "Broken external link: " + "https:" + "//missing." + "example/page",
        "Broken local link: " + "[missing]" + "(./missing.md)",
        "Scanner reported a secret-like value here.",
      ].join("\n"),
    },
    truffleHogReport: [
      {
        DetectorName: "Generic API Key",
        Verified: false,
        SourceMetadata: {
          Data: {
            Filesystem: {
              file: "docs/risky.md",
              line: 3,
            },
          },
        },
      },
    ],
    changedFiles: ["docs/risky.md"],
  },
];

for (const scenario of scenarios) {
  const workspace = new Map(Object.entries(scenario.files));

  // Provide just enough filesystem behavior to exercise the same rule logic.
  const linkReport = await buildLinkSafetyReport({
    filePaths: scenario.changedFiles,
    fetchImpl,
    workspaceDir: process.cwd(),
    readFileImpl: async (_absolutePath, filePath) => workspace.get(filePath) ?? "",
    existsImpl: (_absolutePath, filePath) => workspace.has(filePath),
  });
  const secretReport = await buildTruffleHogReport({
    filePaths: scenario.changedFiles,
    workspaceDir: process.cwd(),
    readFileImpl: async (_absolutePath, filePath) =>
      filePath === ".tmp/trufflehog.jsonl"
        ? (scenario.truffleHogReport ?? []).map((finding) => JSON.stringify(finding)).join("\n")
        : "",
    existsImpl: (_absolutePath, filePath) => filePath === ".tmp/trufflehog.jsonl",
  });

  const status = linkReport.allowed && secretReport.allowed ? "PASS" : "FAIL";

  echo(`\n${status} ${scenario.name}`);
  echo(secretReport.message);
  echo(secretReport.summaryMarkdown);
  echo(linkReport.message);
  echo(linkReport.summaryMarkdown);

  if (secretReport.failure) {
    echo(secretReport.failure);
  }

  if (linkReport.failure) {
    echo(linkReport.failure);
  }
}
