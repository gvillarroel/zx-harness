#!/usr/bin/env node

import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Resolve paths from the skill directory so the scaffold works from any caller cwd.
const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(scriptPath);
const templatesDir = path.resolve(scriptDir, "..", "templates");

// Keep the CLI tiny: one variant plus one target directory.
const variant = (process.argv[2] ?? "").trim();
const targetDirArg = (process.argv[3] ?? "").trim();

if (!variant || !targetDirArg) {
  throw new Error(
    "Usage: node scaffold-example.mjs <variant> <target-directory>",
  );
}

// Centralize the provider-specific placeholders so templates stay mostly static text.
const variantConfig = {
  "copilot-sdk-repo-summary": {
    mode: "repo-summary",
    README_TITLE: "Copilot SDK Repo Summary",
    PACKAGE_NAME: "copilot-sdk-repo-summary-example",
    SDK_DEPENDENCY_NAME: "@github/copilot-sdk",
    SDK_DEPENDENCY_VERSION: "^0.1.8",
    SUMMARY_TEMPLATE_FILE: "summarize-repo.copilot-sdk.ts.tmpl",
  },
  "pi-mono-repo-summary": {
    mode: "repo-summary",
    README_TITLE: "pi-mono Repo Summary",
    PACKAGE_NAME: "pi-mono-repo-summary-example",
    SDK_DEPENDENCY_NAME: "@mariozechner/pi-ai",
    SDK_DEPENDENCY_VERSION: "^0.63.1",
    SUMMARY_TEMPLATE_FILE: "summarize-repo.pi-mono.ts.tmpl",
  },
};

const config = variantConfig[variant];
if (!config) {
  throw new Error(
    `Unsupported variant "${variant}". Supported variants: ${Object.keys(variantConfig).join(", ")}`,
  );
}

const targetDir = path.resolve(targetDirArg);
const variantTemplateDir = path.join(templatesDir, config.mode, variant);

// Create the target directory first so every later write can be a simple path join.
await mkdir(targetDir, { recursive: true });

// Render the shared wrapper and package files first because both repo-summary variants use them.
const sharedFiles = await readdir(variantTemplateDir, { withFileTypes: true });
for (const entry of sharedFiles) {
  if (!entry.isFile()) {
    continue;
  }

  if (!entry.name.endsWith(".tmpl")) {
    continue;
  }

  if (entry.name.startsWith("summarize-repo.")) {
    continue;
  }

  const templatePath = path.join(variantTemplateDir, entry.name);
  const template = await readFile(templatePath, "utf8");
  const rendered = renderTemplate(template, config);
  const targetPath = path.join(targetDir, entry.name.replace(/\.tmpl$/, ""));

  await writeFile(targetPath, rendered);
}

// Write the provider-specific summarize script last so the variant controls the SDK details.
const summaryTemplate = await readFile(
  path.join(variantTemplateDir, config.SUMMARY_TEMPLATE_FILE),
  "utf8",
);
await writeFile(
  path.join(targetDir, "summarize-repo.ts"),
  renderTemplate(summaryTemplate, config),
);

function renderTemplate(template, values) {
  let rendered = template;

  // Replace every placeholder literally so the scaffold output stays predictable.
  for (const [key, value] of Object.entries(values)) {
    rendered = rendered.replaceAll(`{{${key}}}`, value);
  }

  return rendered;
}
