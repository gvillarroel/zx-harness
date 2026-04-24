import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, extname, join, normalize, resolve } from "node:path";

const maxFileBytes = 250_000;
const linkTimeoutMs = 8_000;
const textExtensions = new Set([
  ".css",
  ".csv",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml",
]);

function uniqueSorted(values) {
  // Stable ordering keeps Danger comments small and diffable.
  return [...new Set(values)].sort();
}

function normalizeUrl(rawUrl) {
  // Markdown often leaves trailing punctuation next to URLs; trim only unsafe suffixes.
  return rawUrl.replace(/[),.;\]]+$/g, "");
}

function findExternalLinks(content) {
  // Scan plain URLs first because most docs contain bare links.
  const links = [];
  for (const match of content.matchAll(/https?:\/\/[^\s<>"'`]+/g)) {
    links.push(normalizeUrl(match[0]));
  }

  return uniqueSorted(links);
}

function findRelativeLinks(content) {
  // Markdown and HTML links are checked as local paths when they are not URLs or anchors.
  const links = [];
  const markdownPattern = /!?\[[^\]]*]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  const htmlPattern = /\b(?:href|src)=["']([^"']+)["']/gi;

  for (const match of content.matchAll(markdownPattern)) {
    links.push(match[1]);
  }

  for (const match of content.matchAll(htmlPattern)) {
    links.push(match[1]);
  }

  return uniqueSorted(
    links
      .map((link) => link.split("#")[0])
      .filter(Boolean)
      .filter((link) => !/^(?:https?:|mailto:|tel:|data:|#)/i.test(link)),
  );
}

function isTextFile(filePath) {
  // Extension filtering avoids decoding binary assets as text.
  return textExtensions.has(extname(filePath).toLowerCase());
}

function shouldCheckRelativeLinks(filePath) {
  // Code strings can look like Markdown links or HTML attributes; check local links in content files.
  return new Set([".html", ".md", ".txt"]).has(extname(filePath).toLowerCase());
}

async function readTextFile(workspaceDir, filePath, readFileImpl, existsImpl) {
  const absolutePath = resolve(workspaceDir, filePath);

  if (!isTextFile(filePath) || !existsImpl(absolutePath, filePath)) {
    return "";
  }

  const content = await readFileImpl(absolutePath, filePath);
  if (Buffer.byteLength(content, "utf8") > maxFileBytes || content.includes("\0")) {
    return "";
  }

  return content;
}

async function checkExternalLink(url, fetchImpl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), linkTimeoutMs);

  try {
    // HEAD is cheap; retry GET when servers reject HEAD.
    let response = await fetchImpl(url, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
    });

    if ([403, 405].includes(response.status)) {
      response = await fetchImpl(url, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
      });
    }

    return {
      ok: response.status < 400,
      status: response.status,
      reason: `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      reason: error.name === "AbortError" ? "timeout" : error.message,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function buildMarkdownTable(rows, headers) {
  const header = `| ${headers.join(" | ")} |`;
  const divider = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map((row) => `| ${row.join(" | ")} |`).join("\n");

  return [header, divider, body].filter(Boolean).join("\n");
}

function normalizeReportPath(workspaceDir, filePath = "") {
  // TruffleHog may emit absolute paths; compare against Danger's repo-relative paths.
  const normalized = filePath.replaceAll("\\", "/");
  const normalizedWorkspace = workspaceDir.replaceAll("\\", "/");

  if (normalized.startsWith(`${normalizedWorkspace}/`)) {
    return normalized.slice(normalizedWorkspace.length + 1);
  }

  if (normalized.startsWith("/repo/")) {
    return normalized.slice("/repo/".length);
  }

  return normalized.replace(/^\.\//, "");
}

export async function buildLinkSafetyReport({
  filePaths = [],
  workspaceDir = process.cwd(),
  fetchImpl = globalThis.fetch,
  readFileImpl = (absolutePath) => readFile(absolutePath, "utf8"),
  existsImpl = (absolutePath) => existsSync(absolutePath),
} = {}) {
  if (!fetchImpl) {
    throw new Error("A fetch implementation is required to check external links.");
  }

  const scannedFiles = [];
  const localLinkFailures = [];
  const externalLinkFailures = [];
  const externalLinks = new Map();
  const targetFiles = uniqueSorted(filePaths).filter((filePath) => isTextFile(filePath));

  for (const filePath of targetFiles) {
    const content = await readTextFile(workspaceDir, filePath, readFileImpl, existsImpl);
    if (!content) {
      continue;
    }

    scannedFiles.push(filePath);

    if (shouldCheckRelativeLinks(filePath)) {
      for (const link of findRelativeLinks(content)) {
        const linkPath = resolve(workspaceDir, dirname(filePath), decodeURIComponent(link));
        const relativeLinkPath = normalize(join(dirname(filePath), decodeURIComponent(link))).replaceAll(
          "\\",
          "/",
        );
        if (!existsImpl(linkPath, relativeLinkPath)) {
          localLinkFailures.push({ file: filePath, link });
        }
      }
    }

    for (const link of findExternalLinks(content)) {
      if (!externalLinks.has(link)) {
        externalLinks.set(link, []);
      }
      externalLinks.get(link).push(filePath);
    }
  }

  for (const [link, files] of externalLinks.entries()) {
    const result = await checkExternalLink(link, fetchImpl);
    if (!result.ok) {
      externalLinkFailures.push({
        files: uniqueSorted(files),
        link,
        reason: result.reason,
      });
    }
  }

  const hasFailures = localLinkFailures.length > 0 || externalLinkFailures.length > 0;
  const message = `Link safety scanned ${scannedFiles.length} changed text files.`;
  const summaryMarkdown = `### Link safety summary

${buildMarkdownTable(
  [
    ["Scanned text files", String(scannedFiles.length)],
    ["Broken local links", String(localLinkFailures.length)],
    ["Broken external links", String(externalLinkFailures.length)],
  ],
  ["Check", "Result"],
)}`;

  if (!hasFailures) {
    return {
      allowed: true,
      scannedFiles,
      localLinkFailures,
      externalLinkFailures,
      message,
      summaryMarkdown,
      failure: "",
    };
  }

  const sections = [];
  if (localLinkFailures.length) {
    sections.push(
      [
        "Broken local links found:",
        ...localLinkFailures.map((finding) => `- ${finding.file}: ${finding.link}`),
      ].join("\n"),
    );
  }

  if (externalLinkFailures.length) {
    sections.push(
      [
        "Broken external links found:",
        ...externalLinkFailures.map(
          (finding) => `- ${finding.link} (${finding.reason}) in ${finding.files.join(", ")}`,
        ),
      ].join("\n"),
    );
  }

  return {
    allowed: false,
    scannedFiles,
    localLinkFailures,
    externalLinkFailures,
    message,
    summaryMarkdown,
    failure: sections.join("\n\n"),
  };
}

function parseJsonLines(rawReport) {
  // TruffleHog writes JSONL; keep array support so tests can feed compact fixtures.
  const trimmed = rawReport.trim();
  if (!trimmed) {
    return [];
  }

  if (trimmed.startsWith("[")) {
    return JSON.parse(trimmed);
  }

  return trimmed
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function getTruffleHogLocation(finding) {
  const gitData = finding.SourceMetadata?.Data?.Git;
  const filesystemData = finding.SourceMetadata?.Data?.Filesystem;

  return {
    file: filesystemData?.file ?? gitData?.file ?? finding.File ?? "",
    line: filesystemData?.line ?? gitData?.line ?? finding.StartLine ?? 0,
  };
}

export async function buildTruffleHogReport({
  reportPath = process.env.TRUFFLEHOG_REPORT_PATH ?? ".tmp/trufflehog.jsonl",
  filePaths = [],
  workspaceDir = process.cwd(),
  readFileImpl = (absolutePath) => readFile(absolutePath, "utf8"),
  existsImpl = (absolutePath) => existsSync(absolutePath),
} = {}) {
  const absoluteReportPath = resolve(workspaceDir, reportPath);
  const changedFiles = new Set(filePaths.map((filePath) => normalizeReportPath(workspaceDir, filePath)));

  if (!existsImpl(absoluteReportPath, reportPath)) {
    return {
      allowed: true,
      findings: [],
      message: "TruffleHog report was not found.",
      summaryMarkdown: "### Secret safety summary\n\nTruffleHog did not produce a report.",
      failure: "",
    };
  }

  // TruffleHog owns secret detection; Danger only formats the JSONL report.
  const rawReport = await readFileImpl(absoluteReportPath, reportPath);
  const parsedFindings = parseJsonLines(rawReport);
  const findings = parsedFindings
    .map((finding) => ({
      ...finding,
      location: getTruffleHogLocation(finding),
    }))
    .map((finding) => ({
      ...finding,
      File: normalizeReportPath(workspaceDir, finding.location.file),
    }))
    .filter((finding) => !changedFiles.size || changedFiles.has(finding.File))
    .map((finding) => ({
      file: finding.File,
      line: finding.location.line,
      rule: finding.DetectorName || finding.DetectorType || "secret",
      verified: Boolean(finding.Verified),
    }));

  const message = `TruffleHog scanned for secrets and reported ${findings.length} changed-file findings.`;
  const summaryMarkdown = `### Secret safety summary

${buildMarkdownTable(
  [
    ["Scanner", "TruffleHog"],
    ["Changed-file findings", String(findings.length)],
  ],
  ["Check", "Result"],
)}`;

  if (!findings.length) {
    return {
      allowed: true,
      findings,
      message,
      summaryMarkdown,
      failure: "",
    };
  }

  return {
    allowed: false,
    findings,
    message,
    summaryMarkdown,
    failure: [
      "TruffleHog found secret-like values:",
      ...findings.map((finding) => {
        const status = finding.verified ? "verified" : "unknown";
        return `- ${finding.file}:${finding.line} ${finding.rule} (${status})`;
      }),
    ].join("\n"),
  };
}

export const buildContentSafetyReport = buildLinkSafetyReport;
