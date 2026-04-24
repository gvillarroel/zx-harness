import { danger, fail, markdown, message } from "danger";
import { buildLinkSafetyReport, buildTruffleHogReport } from "./danger-content-safety-rule.mjs";
import { buildFileLimitReport } from "./danger-pr-file-limit-rule.mjs";

const report = buildFileLimitReport({
  createdFiles: danger.git.created_files,
  modifiedFiles: danger.git.modified_files,
  deletedFiles: danger.git.deleted_files,
});

// Keep the success path visible so the Danger comment confirms the rule ran.
message(report.message);
markdown(report.summaryMarkdown);

// Fail the check when the PR is too broad for this spike policy.
if (report.failure) {
  fail(report.failure);
}

const changedContentFiles = [...danger.git.created_files, ...danger.git.modified_files];
const secretReport = await buildTruffleHogReport({
  filePaths: changedContentFiles,
});

// Let TruffleHog own secret detection; Danger only formats the scanner report.
message(secretReport.message);
markdown(secretReport.summaryMarkdown);

if (secretReport.failure) {
  fail(secretReport.failure);
}

const linkSafetyReport = await buildLinkSafetyReport({
  filePaths: changedContentFiles,
});

// Keep the link scan visible so authors know changed docs were checked.
message(linkSafetyReport.message);
markdown(linkSafetyReport.summaryMarkdown);

// Fail only after the summary is posted so remediation context stays close to the PR.
if (linkSafetyReport.failure) {
  fail(linkSafetyReport.failure);
}
