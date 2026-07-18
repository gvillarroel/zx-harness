#!/usr/bin/env zx

import { execFileSync } from "node:child_process";
import { printRepo } from "./repo.ts";

// Verify gh is ready, then search issues and PRs involving the current user.
const login = execFileSync("gh", ["api", "user", "--jq", ".login"], {
  encoding: "utf8",
}).trim();
const output = execFileSync(
  "gh",
  ["search", "issues", "--include-prs", "--involves", login, "--limit", "1000", "--json", "repository"],
  { encoding: "utf8" },
);
const repos = [
  ...new Set(
    JSON.parse(output).map((item) => item.repository?.nameWithOwner).filter(Boolean),
  ),
];

for (const repo of repos) {
  printRepo(repo);
}
