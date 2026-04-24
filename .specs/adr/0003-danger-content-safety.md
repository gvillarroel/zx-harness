---
adr: "0003"
title: "ADR 0003: Check Changed Content With Danger And TruffleHog"
summary: "Use Danger JS for changed-file reporting, link checks, and TruffleHog findings."
status: "Proposed"
date: "2026-04-24"
product: "zx-harness"
owner: "Platform Architecture"
area: "CI"
tags:
  - danger-js
  - links
  - secrets
---

# ADR 0003: Check Changed Content With Danger And TruffleHog

## Status

Proposed

## Context

PRs can add stale links or secrets. Reviewers should see this before merge without running a
separate scanner manually.

## Decision

Extend the existing Danger JS workflow with `.github/danger-content-safety-rule.mjs`. Danger checks
links in created and modified text files. TruffleHog runs before Danger and writes a JSONL report
that Danger formats by file and line without printing secret values. Keep a local example at
`examples/danger-content-safety`.

## Consequences

Positive:

- reviewers get one CI comment for content issues
- local simulation stays deterministic
- secret detection comes from TruffleHog instead of custom regex
- secret values are not echoed in PR output

Negative:

- external link checks can fail because of network or server behavior
- the workflow depends on installing TruffleHog in the runner
