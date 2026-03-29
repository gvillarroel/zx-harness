#!/usr/bin/env zx

import { printRepo } from "./repo.ts";

$.quote = quote;

// Verify gh is ready, then search issues and PRs involving the current user.
const login = (await $`gh api user --jq .login`).stdout.trim();
const output =
  await $`gh search issues --include-prs --involves ${login} --limit 1000 --json repository`;
const repos = [
  ...new Set(
    JSON.parse(output.stdout).map((item) => item.repository?.nameWithOwner).filter(Boolean),
  ),
];

for (const repo of repos) {
  printRepo(repo);
}
