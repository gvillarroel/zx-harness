import { danger, fail, markdown, message } from "danger";
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
