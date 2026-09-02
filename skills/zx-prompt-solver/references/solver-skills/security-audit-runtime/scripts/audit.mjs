#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const [lockfile, output, cache] = process.argv.slice(2);
if (!lockfile || !output || !cache) throw new Error("Expected lockfile, output, and cache paths");

// Use the fixed offline database and capture JSON directly, avoiding temporary executables or network state.
const scan = spawnSync(
  "trivy",
  [
    "fs",
    lockfile,
    "--format",
    "json",
    "--scanners",
    "vuln",
    "--skip-db-update",
    "--offline-scan",
    "--cache-dir",
    cache,
  ],
  { encoding: "utf8" },
);
if (scan.error) throw scan.error;
if (scan.status !== 0) {
  process.stderr.write(scan.stderr || "Trivy failed\n");
  process.exit(scan.status || 1);
}

// Flatten only requested severities and preserve the task's source-priority rules.
const data = JSON.parse(scan.stdout);
const header = ["Package", "Version", "CVE_ID", "Severity", "CVSS_Score", "Fixed_Version", "Title", "Url"];
const quote = (value) => {
  const text = String(value ?? "N/A");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};
const rows = (data.Results ?? [])
  .flatMap((result) => result.Vulnerabilities ?? [])
  .filter((item) => ["HIGH", "CRITICAL"].includes(item.Severity))
  .map((item) => {
    const score = ["nvd", "ghsa", "redhat"]
      .map((source) => item.CVSS?.[source]?.V3Score)
      .find((value) => value !== undefined) ?? "N/A";
    return [
      item.PkgName,
      item.InstalledVersion,
      item.VulnerabilityID,
      item.Severity,
      score,
      item.FixedVersion || "N/A",
      item.Title || item.Description || "N/A",
      item.PrimaryURL || item.References?.[0] || "N/A",
    ].map(quote).join(",");
  });

// Materialize exactly the requested CSV artifact and expose only its path as the answer.
writeFileSync(output, `${header.join(",")}\n${rows.join("\n")}\n`);
process.stdout.write(`${output}\n`);
