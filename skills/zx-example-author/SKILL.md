---
name: zx-example-author
description: Author small zx examples from short implementation requests. Use when the user wants a minimal zx script or tiny zx example, especially for interactive prompts, simple CLI wrappers, or small multi-file command examples.
---

# zx Example Author

## Rules

- Write English only.
- Keep examples small and runnable.
- Match the user-requested paths exactly.
- Create only the files needed for the requested example.
- Use `#!/usr/bin/env zx` for zx entrypoints.
- Set `$.quote = quote;` when interpolating shell arguments.
- Keep failures explicit and actionable.
- Prefer direct, readable scripts over abstractions.
- On Windows, prefer `bash.exe` when shell behavior matters.
- Avoid repo-specific assumptions, paths, or instructions.
- Do not hardcode benchmark-specific completion notes.

## Workflow

1. Infer the example intent from the request.
2. Pick the smallest script shape that satisfies that intent.
3. Write the files directly with minimal ceremony.
4. Keep the final response short and factual.

## Intent Patterns

### Interactive single-file script

Use this shape when the example needs user input or a tiny argument-driven flow.

- Prefer CLI args first, then prompt if the input is missing.
- Trim and validate user input before running commands.
- Throw a direct error when required input is empty.
- Use `echo` or another simple shell command for visible output.
- Set `$.shell = "bash.exe";` on Windows if the script shells out.
- When the request is about greeting or naming, use the domain noun in the prompt label, such as `Name:`.

Typical structure:

```js
#!/usr/bin/env zx

$.shell = "bash.exe";
$.quote = quote;

const value = (
  process.argv.slice(3).find((item) => item.trim()) ??
  (await question("Value: "))
).trim();

if (!value) {
  throw new Error("A non-empty value is required.");
}

await $({ stdio: "inherit" })`echo ${value}`;
```

### Single-file CLI wrapper

Use this shape when the example is mainly a thin zx wrapper around one CLI command.

- Keep the wrapper minimal.
- Preserve the exact command family the user asked for.
- Validate the required CLI first when practical.
- Avoid side artifacts unless the user requested them.
- Set `$.shell = "bash.exe";` on Windows if the command relies on shell parsing.
- If the request is clearly a smoke test, prefer one tiny command invocation over extra flow control.

Typical structure:

```js
#!/usr/bin/env zx

$.shell = "bash.exe";
$.quote = quote;

await $`tool subcommand ${"arg"}`;
```

### Multi-file data listing example

Use this shape when the example fetches data, deduplicates it, and prints flat records.

- Keep the entry script focused on orchestration.
- Put formatting or tiny helpers in a sibling module when that improves clarity.
- Fetch the current user or active identity before running user-scoped queries.
- Deduplicate stable keys before printing.
- Print one record per line in a pipe-friendly format.
- If the formatter output is named in the request, keep it literal and flat.

Typical structure:

```js
#!/usr/bin/env zx

import { printItem } from "./item.js";

$.quote = quote;

const identity = (await $`tool whoami`).stdout.trim();
const output = await $`tool list --for ${identity} --json`;
const items = [
  ...new Set(JSON.parse(output.stdout).map((item) => item.name).filter(Boolean)),
];

for (const item of items) {
  printItem(item);
}
```

```js
export function printItem(name) {
  console.log(name);
}
```

### SDK repo-summary example

Use this shape when the example is a small folder with a zx wrapper, package files, and a TypeScript summarizer that maps a repository and reduces summaries in pairs.

- Create only the requested files, usually `index.mjs`, `summarize-repo.ts`, `package.json`, `tsconfig.json`, and `README.md`.
- Keep `index.mjs` as a thin zx wrapper around the local TypeScript entrypoint.
- In the wrapper, set `$.quote = quote;`, trim CLI args from `process.argv.slice(3)`, verify required commands with `for (const command of ["node", "npm", "git"])`, require local `node_modules`, then run `npm exec -- tsx summarize-repo.ts`.
- Keep `package.json` minimal with `tsx`, `typescript`, and `zx` plus only the SDK dependency needed for that provider.
- Use `NodeNext` in `tsconfig.json`.
- In `summarize-repo.ts`, accept a local repo path or GitHub tree URL from `process.argv[2]` and an optional output path from `process.argv[3]`.
- Create a local `run/` directory and write the final markdown summary there plus JSON artifacts for the mapped files and tree.
- Map files first, filter low-signal and binary files, then summarize file entries in pairs and merge summary nodes in pairs until one summary remains.
- Keep the traversal and reduction logic sequential and readable rather than heavily abstracted.
- Use explicit env vars for tuning model, concurrency, byte limits, and timeout when the provider family supports them.

Typical wrapper structure:

```js
#!/usr/bin/env zx

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

$.quote = quote;

const exampleDir = fileURLToPath(new URL(".", import.meta.url));
const dependenciesDir = resolve(exampleDir, "node_modules");
const args = process.argv.slice(3).map((value) => value.trim()).filter(Boolean);

for (const command of ["node", "npm", "git"]) {
  try {
    await $`${command} --version`;
  } catch {
    throw new Error(`Required CLI not found: ${command}`);
  }
}

if (!existsSync(dependenciesDir)) {
  throw new Error(`Install example dependencies first: cd ${exampleDir.replaceAll("\\", "/")} && npm install`);
}

await $({ cwd: exampleDir, stdio: "inherit" })`npm exec -- tsx summarize-repo.ts ${args}`;
```

Typical TypeScript structure:

```ts
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { basename, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const exampleDir = fileURLToPath(new URL(".", import.meta.url));
const runDir = resolve(exampleDir, "run");
const repoInput = (process.argv[2] ?? "").trim();
const requestedOutput = (process.argv[3] ?? "").trim();
const mappedFiles: string[] = [];
const summaryNodes: Array<{ level: number; paths: string[]; summary: string }> = [];

await mkdir(runDir, { recursive: true });

// Map files first, then summarize them in pairs, then merge summaries in pairs.
```

Copilot SDK variant:

- Import `CopilotClient` and `approveAll` from `@github/copilot-sdk`.
- Keep one client instance and use it for file-pair summaries and merge rounds.
- Include `mapped_files:` and `merge_level:` markers in the prompts or generated text blocks so intermediate artifacts stay inspectable.
- Prefer env vars such as `COPILOT_REPO_SUMMARY_MODEL`, `COPILOT_REPO_SUMMARY_REASONING`, `COPILOT_REPO_SUMMARY_MAX_BYTES`, `COPILOT_REPO_SUMMARY_CONCURRENCY`, and `COPILOT_REPO_SUMMARY_TIMEOUT_MS`.

pi-mono variant:

- Import `completeSimple` and `getModel` from `@mariozechner/pi-ai`.
- Import `getOAuthApiKey` from `@mariozechner/pi-ai/oauth`.
- Read provider and model overrides from `PI_MONO_REPO_SUMMARY_PROVIDER` and `PI_MONO_REPO_SUMMARY_MODEL`.
- Reuse local pi OAuth state when available before falling back to a direct API key.
- Keep the same pairwise map, summarize, and merge flow as the Copilot SDK variant.

## Domain Hints

- For greeting-style examples, favor a tiny interactive script with argument fallback.
- For greeting-style examples, prefer `process.argv.slice(3)` before prompting, trim the value, fail on empty input, and print through `echo`.
- For Copilot or similar assistant CLIs, keep the example as a minimal wrapper around one prompt command, usually `tool -p <short prompt> --model <model>`.
- For GitHub involvement-style examples, resolve the viewer with `gh api user --jq .login`, query involved issues and PRs, deduplicate `nameWithOwner`, and print one repository per line.
- For GitHub formatter helpers, keep the helper tiny and focused on printing the final line shape.
- For repo-summary examples, prefer a zx wrapper plus one TypeScript summarizer over multiple entrypoints or extra helpers.
- For repo-summary examples, keep the wrapper literal: verify `node`, `npm`, and `git`, require installed local dependencies, then delegate with `npm exec -- tsx summarize-repo.ts`.
- For repo-summary examples, keep `run/` outputs explicit: final markdown plus JSON files for the map and tree.
