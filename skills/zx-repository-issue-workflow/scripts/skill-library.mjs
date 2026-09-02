#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, readdir, realpath, stat } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";

const ignoredDirectories = new Set([".git", ".hg", ".svn", "__pycache__", "node_modules"]);
const namePattern = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const maxSkillBytes = 48000;

export async function scanSkillLibrary(input) {
  // Resolve one explicit library so generated workflows never depend on ambient skill locations.
  const root = resolve(input);
  const rootStats = await stat(root).catch(() => null);
  if (!rootStats?.isDirectory()) throw new Error(`Skill library is not a directory: ${root}`);
  const rootReal = await realpath(root);
  const pending = [root];
  const entrypoints = [];

  // Discover only SKILL.md files and never follow dependency, VCS, or linked directory trees.
  while (pending.length) {
    const current = pending.pop();
    const entries = await readdir(current, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const path = resolve(current, entry.name);
      if (entry.isDirectory() && !ignoredDirectories.has(entry.name)) pending.push(path);
      if (entry.isFile() && entry.name === "SKILL.md") entrypoints.push(path);
    }
  }

  const catalog = [];
  const names = new Set();
  for (const file of entrypoints.sort()) {
    // Read only frontmatter during discovery; supporting Markdown is opened after explicit selection.
    const text = await readFile(file, "utf8");
    const name = frontmatterField(text, "name");
    const description = frontmatterField(text, "description").trim();
    if (!namePattern.test(name) || !description || description.length > 1024) {
      throw new Error(`Invalid skill metadata: ${relative(root, file)}`);
    }
    if (names.has(name)) throw new Error(`Duplicate skill name: ${name}`);
    names.add(name);
    const fileReal = await realpath(file);
    if (!inside(rootReal, fileReal)) throw new Error(`Skill escapes library: ${relative(root, file)}`);
    catalog.push({ name, description, file: fileReal });
  }
  return catalog;
}

export async function compileSkill(entry) {
  const skillRoot = dirname(entry.file);
  const skillRootReal = await realpath(skillRoot);
  const pending = [{ path: entry.file, label: "SKILL.md" }];
  const seen = new Set();
  const sections = [];
  let bytes = 0;

  // Compile only Markdown instructions. Executable helpers remain unavailable to the runtime agent.
  while (pending.length) {
    const current = pending.shift();
    const currentReal = await realpath(current.path);
    if (!inside(skillRootReal, currentReal)) throw new Error(`Skill reference escapes: ${entry.name}`);
    if (seen.has(currentReal)) continue;
    seen.add(currentReal);
    const text = await readFile(currentReal, "utf8");
    bytes += Buffer.byteLength(text);
    if (bytes > maxSkillBytes || seen.size > 12) throw new Error(`Skill is oversized: ${entry.name}`);
    sections.push(
      `## ${current.label}\n\n${current.label === "SKILL.md" ? stripFrontmatter(text) : text.trim()}`,
    );

    // Follow only local Markdown links so progressive instructions survive without copying code.
    for (const reference of markdownReferences(text).sort()) {
      const target = resolve(dirname(currentReal), reference);
      if (!inside(skillRootReal, target)) throw new Error(`Skill reference escapes: ${entry.name}`);
      const targetStats = await stat(target).catch(() => null);
      if (!targetStats?.isFile()) throw new Error(`Missing skill reference: ${entry.name}/${reference}`);
      pending.push({ path: target, label: relative(skillRootReal, target).replaceAll("\\", "/") });
    }
  }

  const body = [
    "Compiled advisory copy. Follow the instructions, but do not assume source helper scripts exist.",
    ...sections,
  ].join("\n\n");
  const text = `---\nname: ${entry.name}\ndescription: ${JSON.stringify(entry.description)}\n---\n\n# ${entry.name}\n\n${body}\n`;
  return {
    name: entry.name,
    description: entry.description,
    text,
    digest: `sha256:${createHash("sha256").update(text).digest("hex")}`,
  };
}

function frontmatterField(text, key) {
  const block = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1] ?? "";
  const match = block.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
  if (!match) return "";
  const raw = match[1].trim();
  if (raw.startsWith('"') && raw.endsWith('"')) {
    try {
      return JSON.parse(raw);
    } catch {
      return raw.slice(1, -1);
    }
  }
  if (raw.startsWith("'") && raw.endsWith("'")) return raw.slice(1, -1).replaceAll("''", "'");
  return raw;
}

function markdownReferences(text) {
  const references = new Set();
  for (const match of text.matchAll(/\[[^\]]*\]\(([^)\s]+\.md(?:#[^)]*)?)\)/giu)) {
    const value = match[1].split("#", 1)[0].replace(/^<|>$/g, "");
    if (value && !value.includes("://") && !value.startsWith("/")) references.add(value);
  }
  return [...references];
}

function stripFrontmatter(text) {
  return text.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, "").trim();
}

function inside(root, target) {
  return target === root || target.startsWith(`${root}${sep}`);
}
