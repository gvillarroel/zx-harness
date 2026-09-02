#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, readdir, realpath, stat } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const MAX_SKILL_BUNDLE_BYTES = 48000;
export const MAX_STAGE_SKILL_BYTES = 64000;

const ignoredDirectories = new Set([".git", ".hg", ".svn", "__pycache__", "node_modules"]);
const skillNamePattern = /^[a-z0-9][a-z0-9._-]{0,127}$/;

export async function scanSkillLibrary(input) {
  // Resolve one explicit root so catalog paths stay portable and no ambient agent directory is assumed.
  const root = resolve(input);
  const rootStats = await stat(root).catch(() => null);
  if (!rootStats?.isDirectory()) {
    throw new Error(`Skill library is not a directory: ${root}`);
  }
  const rootReal = await realpath(root);
  const pending = [root];
  const skillFiles = [];

  // Discover copied skills without following links or entering dependency and VCS internals.
  while (pending.length) {
    const current = pending.pop();
    const entries = await readdir(current, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const path = resolve(current, entry.name);
      if (entry.isDirectory() && !ignoredDirectories.has(entry.name)) {
        pending.push(path);
      } else if (entry.isFile() && entry.name === "SKILL.md") {
        skillFiles.push(path);
      }
    }
  }

  const catalog = [];
  const names = new Set();
  for (const file of skillFiles.sort((left, right) => left.localeCompare(right))) {
    // Read only each entrypoint during discovery; supporting guidance is loaded after selection.
    const text = await readFile(file, "utf8");
    if (Buffer.byteLength(text) > 256000) {
      throw new Error(`SKILL.md exceeds the discovery limit: ${relative(root, file)}`);
    }
    const name = readFrontmatterField(text, "name");
    const description = readFrontmatterField(text, "description");
    if (!skillNamePattern.test(name) || !description?.trim() || description.length > 8192) {
      throw new Error(`Invalid name or description: ${relative(root, file)}`);
    }
    if (names.has(name)) {
      throw new Error(`Duplicate skill name in library: ${name}`);
    }
    names.add(name);

    const fileReal = await realpath(file);
    if (!isInside(rootReal, fileReal)) {
      throw new Error(`Skill entrypoint escapes the library: ${relative(root, file)}`);
    }
    const skillRoot = dirname(file);
    const missingReferences = [];
    for (const reference of extractMarkdownReferences(text)) {
      const target = resolve(skillRoot, reference);
      if (!isInside(skillRoot, target) || !(await stat(target).catch(() => null))?.isFile()) {
        missingReferences.push(reference);
      }
    }
    catalog.push({
      name,
      description: description.trim(),
      path: relative(root, file).replaceAll("\\", "/"),
      missingReferences: [...new Set(missingReferences)].sort(),
      file,
    });
  }

  return { root, catalog };
}

export async function compileSkill(entry) {
  const skillRoot = dirname(entry.file);
  const skillRootReal = await realpath(skillRoot);
  const pending = [{ path: entry.file, label: "SKILL.md" }];
  const seen = new Set();
  const files = [];
  const sections = [];
  const missingReferences = new Set(entry.missingReferences);
  let bytes = 0;

  // Follow only referenced Markdown guidance; scripts and assets remain inert and outside model context.
  while (pending.length) {
    const current = pending.shift();
    const currentReal = await realpath(current.path);
    if (!isInside(skillRootReal, currentReal)) {
      throw new Error(`Skill Markdown reference escapes its package: ${entry.name}`);
    }
    if (seen.has(currentReal)) {
      continue;
    }
    seen.add(currentReal);
    const text = await readFile(currentReal, "utf8");
    bytes += Buffer.byteLength(text);
    if (bytes > MAX_SKILL_BUNDLE_BYTES || seen.size > 12) {
      throw new Error(`Selected skill exceeds its prompt budget: ${entry.name}`);
    }
    files.push(current.label);
    sections.push(`## ${current.label}\n\n${current.label === "SKILL.md" ? stripFrontmatter(text) : text.trim()}`);

    for (const reference of extractMarkdownReferences(text).sort()) {
      const target = resolve(dirname(currentReal), reference);
      if (!isInside(skillRootReal, target)) {
        missingReferences.add(reference);
        continue;
      }
      const targetStats = await stat(target).catch(() => null);
      if (!targetStats?.isFile()) {
        missingReferences.add(reference);
        continue;
      }
      const targetReal = await realpath(target);
      const label = relative(skillRootReal, targetReal).replaceAll("\\", "/");
      pending.push({ path: targetReal, label });
    }
  }

  const instructions = sections.join("\n\n").trim();
  return {
    name: entry.name,
    description: entry.description,
    digest: `sha256:${createHash("sha256").update(instructions).digest("hex")}`,
    files,
    missingReferences: [...missingReferences].sort(),
    instructions,
  };
}

function readFrontmatterField(text, key) {
  const frontmatter = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1];
  if (!frontmatter) {
    return "";
  }
  const lines = frontmatter.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(new RegExp(`^${key}:\\s*(.*)$`));
    if (!match) {
      continue;
    }
    const raw = match[1].trim();
    if (/^[>|][+-]?$/.test(raw)) {
      const block = [];
      for (index += 1; index < lines.length && (!lines[index].trim() || /^\s/.test(lines[index])); index += 1) {
        block.push(lines[index].replace(/^\s+/, ""));
      }
      return raw.startsWith(">") ? block.join(" ").trim() : block.join("\n").trim();
    }
    if (raw.startsWith('"') && raw.endsWith('"')) {
      try {
        return JSON.parse(raw);
      } catch {
        return raw.slice(1, -1);
      }
    }
    if (raw.startsWith("'") && raw.endsWith("'")) {
      return raw.slice(1, -1).replaceAll("''", "'");
    }
    return raw;
  }
  return "";
}

function extractMarkdownReferences(text) {
  const references = new Set();
  const patterns = [
    /\[[^\]]*\]\(([^)\s]+\.md(?:#[^)]*)?)\)/giu,
    /`((?:\.{0,2}\/)?references\/[a-z0-9_./-]+\.md(?:#[^`]*)?)`/giu,
    /\b((?:references\/)[a-z0-9_./-]+\.md)\b/giu,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const value = match[1].split("#", 1)[0].replace(/^<|>$/g, "");
      if (value && !value.includes("://") && !value.startsWith("/") && !value.startsWith("#")) {
        references.add(value);
      }
    }
  }
  return [...references];
}

function stripFrontmatter(text) {
  return text.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, "").trim();
}

function isInside(root, target) {
  return target === root || target.startsWith(`${root}${sep}`);
}

// Print a compact routing catalog when invoked directly; imports expose the same verified scanner.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [libraryInput] = process.argv.slice(2);
  if (!libraryInput) {
    throw new Error("Usage: node inspect-skill-library.mjs <skill-library>");
  }
  const { catalog } = await scanSkillLibrary(libraryInput);
  console.log(
    JSON.stringify(
      catalog.map(({ name, description, path, missingReferences }) => ({
        name,
        description,
        path,
        ...(missingReferences.length ? { missingReferences } : {}),
      })),
      null,
      2,
    ),
  );
}
