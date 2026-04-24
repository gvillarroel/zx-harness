#!/usr/bin/env zx

$.quote = quote;

// Verify the only external runtime this example needs before doing useful work.
await $`node --version`;

// Load the same rule used by the GitHub Action so the examples do not drift.
const ruleUrl = new URL("../../.github/danger-pr-file-limit-rule.mjs", import.meta.url);
const { buildFileLimitReport } = await import(ruleUrl.href);

// Keep scenarios inline so the example is easy to read and copy into a PR test.
const scenarios = [
  {
    name: "allowed-three-files",
    createdFiles: ["docs/new-note.md"],
    modifiedFiles: ["README.md", "SPEC.md"],
    deletedFiles: [],
  },
  {
    name: "blocked-four-files",
    createdFiles: ["docs/new-note.md"],
    modifiedFiles: ["README.md", "SPEC.md", "docs/examples.md"],
    deletedFiles: [],
  },
];

// Print the simulated Danger result for each PR shape without failing the example run.
for (const scenario of scenarios) {
  const report = buildFileLimitReport(scenario);
  const status = report.allowed ? "PASS" : "FAIL";

  echo(`\n${status} ${scenario.name}`);
  echo(report.message);

  if (report.failure) {
    echo(report.failure);
  }
}
