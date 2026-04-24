export const maxChangedFiles = 3;

export function buildFileLimitReport({ createdFiles = [], modifiedFiles = [], deletedFiles = [] }) {
  // Count every touched path because review size should include additions, edits, and removals.
  const changedFiles = [...createdFiles, ...modifiedFiles, ...deletedFiles];

  // Deduplicate and sort paths so Danger comments stay stable across runs.
  const uniqueChangedFiles = [...new Set(changedFiles)].sort();
  const message = `This PR changes ${uniqueChangedFiles.length}/${maxChangedFiles} allowed files.`;
  const status = uniqueChangedFiles.length <= maxChangedFiles ? "Pass" : "Fail";
  const fileRows =
    uniqueChangedFiles.map((file) => `| \`${file}\` |`).join("\n") || "| No changed files |";
  const summaryMarkdown = `### PR file limit summary

| Changed files | Limit | Status |
| ---: | ---: | --- |
| ${uniqueChangedFiles.length} | ${maxChangedFiles} | ${status} |

<details>
<summary>Changed files</summary>

| File |
| --- |
${fileRows}

</details>`;

  // Return a pass report without a failure body so callers can decide how to display it.
  if (uniqueChangedFiles.length <= maxChangedFiles) {
    return {
      allowed: true,
      changedFiles: uniqueChangedFiles,
      message,
      summaryMarkdown,
      failure: "",
    };
  }

  // Include the file list in the failure so authors can split the PR without checking logs.
  const fileList = uniqueChangedFiles.map((file) => `- \`${file}\``).join("\n");

  return {
    allowed: false,
    changedFiles: uniqueChangedFiles,
    message,
    summaryMarkdown,
    failure: `This PR changes ${uniqueChangedFiles.length} files, but the limit is ${maxChangedFiles}.\n\n${fileList}`,
  };
}
