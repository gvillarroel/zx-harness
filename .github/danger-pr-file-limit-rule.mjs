export const maxChangedFiles = 3;

export function buildFileLimitReport({ createdFiles = [], modifiedFiles = [], deletedFiles = [] }) {
  // Count every touched path because review size should include additions, edits, and removals.
  const changedFiles = [...createdFiles, ...modifiedFiles, ...deletedFiles];

  // Deduplicate and sort paths so Danger comments stay stable across runs.
  const uniqueChangedFiles = [...new Set(changedFiles)].sort();
  const message = `This PR changes ${uniqueChangedFiles.length}/${maxChangedFiles} allowed files.`;

  // Return a pass report without a failure body so callers can decide how to display it.
  if (uniqueChangedFiles.length <= maxChangedFiles) {
    return {
      allowed: true,
      changedFiles: uniqueChangedFiles,
      message,
      failure: "",
    };
  }

  // Include the file list in the failure so authors can split the PR without checking logs.
  const fileList = uniqueChangedFiles.map((file) => `- \`${file}\``).join("\n");

  return {
    allowed: false,
    changedFiles: uniqueChangedFiles,
    message,
    failure: `This PR changes ${uniqueChangedFiles.length} files, but the limit is ${maxChangedFiles}.\n\n${fileList}`,
  };
}
