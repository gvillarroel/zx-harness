#!/usr/bin/env node

import { createHash } from "node:crypto";
import { chmod, cp, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compileSkill, scanSkillLibrary } from "./skill-library.mjs";

const [profileInput, targetInput, ...options] = process.argv.slice(2);
let skillLibraryInput = "";

// Parse one explicit optional library. Unknown flags fail so scaffolding cannot drift silently.
for (let index = 0; index < options.length; index += 1) {
  if (options[index] !== "--skill-library" || !options[index + 1] || skillLibraryInput) {
    throw new Error(`Unknown or incomplete option: ${options[index]}`);
  }
  skillLibraryInput = options[index + 1];
  index += 1;
}
if (!profileInput || !targetInput) {
  throw new Error(
    "Usage: node scaffold-repository-issue-workflow.mjs <profile.json> <empty-target> [--skill-library <directory>]",
  );
}

const skillRoot = fileURLToPath(new URL("..", import.meta.url));
const profilePath = resolve(profileInput);
const target = resolve(targetInput);
const profile = JSON.parse(await readFile(profilePath, "utf8"));

// Validate the complete closed schema before creating any product file.
validateProfile(profile);
const targetStats = await stat(target).catch(() => null);
if (targetStats && !targetStats.isDirectory()) throw new Error(`Target is not a directory: ${target}`);
if (targetStats && (await readdir(target)).length) throw new Error(`Target must be empty: ${target}`);

// Resolve every externally named skill before writing output; partial bundles are never useful.
const requestedSkills = [
  ...new Set([
    ...(profile.defaultSkills ?? []),
    ...profile.sectors.flatMap((sector) => sector.skills ?? []),
  ]),
].sort();
if (requestedSkills.length && !skillLibraryInput) {
  throw new Error("The profile selects skills but --skill-library was not provided.");
}
const compiledSkills = [];
if (requestedSkills.length) {
  const catalog = await scanSkillLibrary(skillLibraryInput);
  const byName = new Map(catalog.map((entry) => [entry.name, entry]));
  for (const name of requestedSkills) {
    const entry = byName.get(name);
    if (!entry) throw new Error(`Selected skill is missing from the library: ${name}`);
    compiledSkills.push(await compileSkill(entry));
  }
}

// Generate one stable repository guide from the profile rather than from any runtime issue.
const guideName = `${profile.name}-repo`;
const guideDescription = `Stable architecture, conventions, sectors, and gates for ${profile.name}. Use before solving any issue in this repository.`;
const guideBody = [
  `# ${profile.name} Repository Guide`,
  "",
  profile.repository.summary,
  "",
  "## Architecture",
  "",
  ...profile.repository.architecture.map((value) => `- ${value}`),
  "",
  "## Conventions",
  "",
  ...profile.repository.conventions.map((value) => `- ${value}`),
  "",
  "## Problem Sectors",
  "",
  ...profile.sectors.map(
    (sector) =>
      `- ${sector.id} (${sector.model}): ${sector.description} Roots: ${sector.roots.join(", ") || "repository profile roots"}.`,
  ),
  "",
  "## External Gates",
  "",
  ...profile.gates.map(
    (gate) =>
      `- ${gate.id}: ${[gate.command, ...gate.args].join(" ")}${gate.sectors ? ` [${gate.sectors.join(", ")}]` : ""}`,
  ),
  "",
  "The workflow owns model routing, attempts, patch promotion, and gates. Do not bypass them, commit,",
  "push, or change the generated workflow. Analyze the current issue and leave the smallest complete",
  "implementation in the isolated worktree.",
  "",
].join("\n");
const guideText = `---\nname: ${guideName}\ndescription: ${JSON.stringify(guideDescription)}\n---\n\n${guideBody}`;
const guideDigest = `sha256:${createHash("sha256").update(guideText).digest("hex")}`;

// Materialize a standalone bundle containing only runtime code, stable profile, and advisory skills.
await mkdir(resolve(target, "skills", guideName), { recursive: true });
await cp(resolve(skillRoot, "assets", "runtime", "solve-issue.mjs"), resolve(target, "solve-issue.mjs"));
await chmod(resolve(target, "solve-issue.mjs"), 0o755).catch(() => undefined);
await writeFile(resolve(target, "repository-profile.json"), `${JSON.stringify(profile, null, 2)}\n`);
await writeFile(resolve(target, "skills", guideName, "SKILL.md"), guideText);

const runtimeCatalog = {
  schemaVersion: 1,
  repositoryGuide: {
    name: guideName,
    description: guideDescription,
    path: `skills/${guideName}`,
    digest: guideDigest,
  },
  skills: {},
};
for (const skill of compiledSkills) {
  // Keep each selected skill separately discoverable so pi performs native progressive disclosure.
  const directory = resolve(target, "skills", skill.name);
  await mkdir(directory, { recursive: true });
  await writeFile(resolve(directory, "SKILL.md"), skill.text);
  runtimeCatalog.skills[skill.name] = {
    name: skill.name,
    description: skill.description,
    path: `skills/${skill.name}`,
    digest: skill.digest,
  };
}
await writeFile(resolve(target, "skills", "catalog.json"), `${JSON.stringify(runtimeCatalog, null, 2)}\n`);

// Pin the exact zx and pi runtimes so npm shims and global package drift cannot change behavior.
const packageJson = {
  name: profile.name,
  private: true,
  type: "module",
  engines: { node: ">=22.19.0" },
  dependencies: {
    "@earendil-works/pi-coding-agent": "0.84.2",
    zx: "8.8.5",
  },
};
await writeFile(resolve(target, "package.json"), `${JSON.stringify(packageJson, null, 2)}\n`);

console.log(
  `Scaffolded ${profile.name} at ${target}; repository guide: ${guideName}; external skills: ${requestedSkills.join(", ") || "none"}`,
);

function validateProfile(value) {
  requireKeys(value, [
    "schemaVersion",
    "name",
    "description",
    "repository",
    "models",
    "attempts",
    "defaultSector",
    "defaultSkills",
    "sectors",
    "gates",
    "pi",
  ], "profile");
  if (value.schemaVersion !== 1) throw new Error("Profile schemaVersion must be 1.");
  if (!/^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/.test(value.name)) {
    throw new Error("Profile name must be a 2-48 character lowercase slug.");
  }
  if (!plainText(value.description, 512)) throw new Error("Profile description is invalid.");

  requireKeys(value.repository, [
    "summary",
    "architecture",
    "conventions",
    "roots",
    "extensions",
    "alwaysInclude",
    "ignore",
    "protectedPaths",
    "maxScanFiles",
    "contextFiles",
    "maxFileBytes",
    "maxContextBytes",
  ], "repository");
  if (!plainText(value.repository.summary, 2048)) throw new Error("Repository summary is invalid.");
  for (const [label, items, maximum] of [
    ["architecture", value.repository.architecture, 32],
    ["conventions", value.repository.conventions, 32],
  ]) {
    if (!stringList(items, 1, maximum, 1024)) throw new Error(`Repository ${label} is invalid.`);
  }
  for (const [label, items, minimum, maximum] of [
    ["roots", value.repository.roots, 1, 64],
    ["alwaysInclude", value.repository.alwaysInclude, 0, 32],
    ["ignore", value.repository.ignore, 0, 64],
    ["protectedPaths", value.repository.protectedPaths, 0, 64],
  ]) {
    if (!stringList(items, minimum, maximum, 256) || items.some((path) => !safeRelative(path))) {
      throw new Error(`Repository ${label} paths are invalid.`);
    }
  }
  if (
    !stringList(value.repository.extensions, 1, 64, 32) ||
    value.repository.extensions.some((extension) => !/^\.[a-z0-9._-]+$/i.test(extension))
  ) {
    throw new Error("Repository extensions are invalid.");
  }
  boundedInteger(value.repository.maxScanFiles, 1, 5000, "maxScanFiles");
  boundedInteger(value.repository.contextFiles, 1, 40, "contextFiles");
  boundedInteger(value.repository.maxFileBytes, 512, 64000, "maxFileBytes");
  boundedInteger(value.repository.maxContextBytes, 4096, 256000, "maxContextBytes");

  requireKeys(value.models, ["luna", "sol", "lunaThinking", "solThinking"], "models");
  if (!/^[a-z0-9-]+\/gpt-5\.6-luna$/.test(value.models.luna)) {
    throw new Error("models.luna must route GPT-5.6 Luna through an explicit provider.");
  }
  if (!/^[a-z0-9-]+\/gpt-5\.6-sol$/.test(value.models.sol)) {
    throw new Error("models.sol must route GPT-5.6 Sol through an explicit provider.");
  }
  if (!['minimal', 'low', 'medium', 'high', 'xhigh'].includes(value.models.lunaThinking)) {
    throw new Error("models.lunaThinking is invalid.");
  }
  if (!['high', 'xhigh', 'max'].includes(value.models.solThinking)) {
    throw new Error("models.solThinking is invalid.");
  }
  boundedInteger(value.attempts, 1, 3, "attempts");
  if (!stringList(value.defaultSkills, 0, 3, 64) || value.defaultSkills.some((name) => !skillName(name))) {
    throw new Error("defaultSkills must contain at most three portable skill names.");
  }

  if (!Array.isArray(value.sectors) || value.sectors.length < 1 || value.sectors.length > 24) {
    throw new Error("Profile requires 1-24 sectors.");
  }
  const sectorIds = new Set();
  for (const sector of value.sectors) {
    requireKeys(sector, ["id", "description", "terms", "roots", "model", "skills"], "sector");
    if (!skillName(sector.id) || sectorIds.has(sector.id)) throw new Error(`Invalid sector: ${sector.id}`);
    sectorIds.add(sector.id);
    if (!plainText(sector.description, 1024) || !stringList(sector.terms, 1, 64, 128)) {
      throw new Error(`Sector text is invalid: ${sector.id}`);
    }
    if (!stringList(sector.roots, 0, 32, 256) || sector.roots.some((path) => !safeRelative(path))) {
      throw new Error(`Sector roots are invalid: ${sector.id}`);
    }
    if (!['luna', 'sol'].includes(sector.model)) throw new Error(`Sector model is invalid: ${sector.id}`);
    if (!stringList(sector.skills, 0, 3, 64) || sector.skills.some((name) => !skillName(name))) {
      throw new Error(`Sector skills are invalid: ${sector.id}`);
    }
  }
  if (!sectorIds.has(value.defaultSector)) throw new Error("defaultSector must name one sector.");

  if (!Array.isArray(value.gates) || value.gates.length < 1 || value.gates.length > 16) {
    throw new Error("Profile requires 1-16 gates.");
  }
  const gateIds = new Set();
  for (const gate of value.gates) {
    requireKeys(gate, ["id", "command", "args", "timeoutMs", "sectors"], "gate");
    if (!skillName(gate.id) || gateIds.has(gate.id)) throw new Error(`Invalid gate: ${gate.id}`);
    gateIds.add(gate.id);
    if (!plainText(gate.command, 256) || /[\r\n]/.test(gate.command)) throw new Error(`Invalid gate command: ${gate.id}`);
    if (!stringList(gate.args, 0, 64, 2048)) throw new Error(`Invalid gate args: ${gate.id}`);
    boundedInteger(gate.timeoutMs, 1000, 1800000, `${gate.id}.timeoutMs`);
    if (gate.sectors !== undefined) {
      if (!stringList(gate.sectors, 1, 24, 64) || gate.sectors.some((id) => !sectorIds.has(id))) {
        throw new Error(`Invalid gate sectors: ${gate.id}`);
      }
    }
  }

  requireKeys(value.pi, ["timeoutMs"], "pi");
  boundedInteger(value.pi.timeoutMs, 10000, 3600000, "pi.timeoutMs");
}

function requireKeys(value, allowed, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  const extras = Object.keys(value).filter((key) => !allowed.includes(key));
  if (extras.length) throw new Error(`${label} contains unsupported fields: ${extras.join(", ")}`);
}

function boundedInteger(value, minimum, maximum, label) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${label} must be ${minimum}-${maximum}.`);
  }
}

function plainText(value, maximum) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maximum && !value.includes("\0");
}

function stringList(value, minimum, maximum, itemMaximum) {
  return (
    Array.isArray(value) &&
    value.length >= minimum &&
    value.length <= maximum &&
    new Set(value).size === value.length &&
    value.every((item) => typeof item === "string" && item.length > 0 && item.length <= itemMaximum && !item.includes("\0"))
  );
}

function safeRelative(path) {
  return !isAbsolute(path) && !path.split(/[\\/]/).includes("..") && !/[\r\n]/.test(path);
}

function skillName(value) {
  return typeof value === "string" && /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(value);
}
