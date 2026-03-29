// Keep output flat and easy to pipe.
export function printTicket(issue: {
  key: string;
  fields?: { summary?: string };
}) {
  console.log(`name: ${issue.key}`);
  console.log(`content: ${issue.fields?.summary ?? ""}`);
}
