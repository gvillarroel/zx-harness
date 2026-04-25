---
adr: "0002"
title: "ADR 0002: Spike Danger JS PR File Limit"
summary: "Use Danger JS in GitHub Actions to block PRs that touch more than three files."
status: "Proposed"
date: "2026-04-23"
product: "zx-harness"
owner: "Platform Architecture"
area: "CI"
tags:
  - danger-js
  - github-actions
  - pull-requests
---

# ADR 0002: Spike Danger JS PR File Limit

## Status

Proposed

## Context

Small PRs match the repository preference for small, inspectable changes. Danger JS can run in
GitHub Actions and report review policy failures on pull requests.

## Decision

Add a `pull_request` workflow that installs Danger JS with `npx` and runs `.github/dangerfile.js`.
The Dangerfile fails the check when a PR changes more than three unique files. Keep the rule in
`.github/danger-pr-file-limit-rule.mjs` so local examples can reuse it. The Danger comment also
includes a Markdown summary table for changed file count, limit, status, and file list.

## Consequences

Positive:

- oversized PRs get a blocking check
- the rule stays readable and local to CI
- local examples can show pass and fail cases
- PR comments include a compact summary table
- no root package dependency is needed for the spike

Negative:

- fork PR comments may be limited by GitHub token permissions
- the threshold is intentionally strict and may need tuning
