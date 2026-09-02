#!/usr/bin/env node

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [logs, output, referenceDate] = process.argv.slice(2);
if (!logs || !output || !/^\d{4}-\d{2}-\d{2}$/.test(referenceDate ?? "")) {
  throw new Error("Expected log directory, output path, and YYYY-MM-DD reference date");
}

// Use UTC calendar days so host time zones cannot change inclusive range membership.
const reference = Date.parse(`${referenceDate}T00:00:00Z`);
const referenceValue = new Date(reference);
const day = 86_400_000;
const severities = ["ERROR", "WARNING", "INFO"];
const periods = ["today", "last_7_days", "last_30_days", "month_to_date", "total"];
const counts = Object.fromEntries(
  periods.map((period) => [period, Object.fromEntries(severities.map((severity) => [severity, 0]))]),
);

// Read each dated log once, then add its exact bracketed severities to every matching window.
for (const file of readdirSync(logs)) {
  const match = /^(\d{4}-\d{2}-\d{2})_.+\.log$/.exec(file);
  if (!match) continue;
  const timestamp = Date.parse(`${match[1]}T00:00:00Z`);
  const value = new Date(timestamp);
  const age = (reference - timestamp) / day;
  const active = [
    age === 0 && "today",
    age >= 0 && age < 7 && "last_7_days",
    age >= 0 && age < 30 && "last_30_days",
    age >= 0 &&
      value.getUTCFullYear() === referenceValue.getUTCFullYear() &&
      value.getUTCMonth() === referenceValue.getUTCMonth() &&
      "month_to_date",
    "total",
  ].filter(Boolean);
  const text = readFileSync(join(logs, file), "utf8");
  for (const severity of severities) {
    const found = text.match(new RegExp(`\\[${severity}\\]`, "g"))?.length ?? 0;
    for (const period of active) counts[period][severity] += found;
  }
}

// Preserve the prompt's exact period-major, severity-minor CSV order.
const rows = ["period,severity,count"];
for (const period of periods) {
  for (const severity of severities) rows.push(`${period},${severity},${counts[period][severity]}`);
}
writeFileSync(output, `${rows.join("\n")}\n`);
process.stdout.write(`${output}\n`);
