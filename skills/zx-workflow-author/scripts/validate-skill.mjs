#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const skillDir = fileURLToPath(new URL("..", import.meta.url));
const repoRoot = resolve(skillDir, "..", "..");
const scaffoldScript = resolve(skillDir, "scripts", "scaffold-workflow.mjs");
const inspectSkillsScript = resolve(skillDir, "scripts", "inspect-skill-library.mjs");
const fixturesDir = resolve(skillDir, "scripts", "fixtures");
const temporaryRoot = await mkdtemp(resolve(tmpdir(), "zx-workflow-author-"));
const fixtureControlPath = ".policy/workflow-control.txt";
const fixtureControlText = "fixture protected control\n";
const fixtureControlSha256 = `sha256:${createHash("sha256").update(fixtureControlText).digest("hex")}`;
const fixtureControls = [{ path: fixtureControlPath, sha256: fixtureControlSha256 }];

try {
  // Enforce the product boundary: the repository publishes exactly one skill package and manifest.
  const skillDirectories = (await readdir(resolve(repoRoot, "skills"), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  if (skillDirectories.join(",") !== "zx-workflow-author") {
    throw new Error(`Expected one product skill, found: ${skillDirectories.join(", ")}`);
  }
  const manifests = await findNamedFiles(resolve(repoRoot, "skills"), "SKILL.md");
  if (manifests.length !== 1 || manifests[0] !== resolve(skillDir, "SKILL.md")) {
    throw new Error(`Expected one SKILL.md under skills/, found ${manifests.length}.`);
  }

  // Validate discovery metadata because this single entrypoint must describe the complete product.
  const skillText = await readFile(resolve(skillDir, "SKILL.md"), "utf8");
  const frontmatter = skillText.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const keys = frontmatter?.[1]
    .split(/\r?\n/)
    .filter((line) => /^[a-z][a-z0-9_-]*:/.test(line))
    .map((line) => line.split(":", 1)[0]);
  if (!frontmatter || keys?.join(",") !== "name,description" || !frontmatter[1].includes("name: zx-workflow-author")) {
    throw new Error("SKILL.md frontmatter must contain only name and description.");
  }
  const openaiYaml = await readFile(resolve(skillDir, "agents", "openai.yaml"), "utf8");
  for (const required of ["display_name:", "short_description:", "default_prompt:", "$zx-workflow-author"]) {
    if (!openaiYaml.includes(required)) {
      throw new Error(`agents/openai.yaml is missing: ${required}`);
    }
  }

  // Build an external library in temporary space so fixtures do not masquerade as product skills.
  const skillLibrary = resolve(temporaryRoot, "skill-library");
  await createFixtureSkill(
    skillLibrary,
    "solution-design",
    "Guide solution design for a bounded producer stage.",
    "SOLUTION_SKILL_SENTINEL",
  );
  await createFixtureSkill(
    skillLibrary,
    "acceptance-review",
    "Review observable acceptance evidence in an isolated reviewer context.",
    "REVIEW_SKILL_SENTINEL\n\nRead [the checklist](references/checklist.md).",
    "REFERENCE_SENTINEL",
  );
  await createFixtureSkill(
    skillLibrary,
    "unselected-review",
    "Unrelated fixture that must never enter selected contexts.",
    "UNSELECTED_SENTINEL",
  );

  // Prove catalog discovery exposes descriptions while duplicate names fail closed.
  const catalogResult = await run(process.execPath, [inspectSkillsScript, skillLibrary], repoRoot);
  const catalog = JSON.parse(catalogResult.stdout);
  if (catalog.length !== 3 || catalog.some((entry) => !entry.description || resolve(entry.path) === entry.path)) {
    throw new Error("Skill library catalog is incomplete or exposes absolute paths.");
  }
  const duplicateLibrary = resolve(temporaryRoot, "duplicate-library");
  await cp(skillLibrary, duplicateLibrary, { recursive: true });
  await cp(resolve(skillLibrary, "solution-design"), resolve(duplicateLibrary, "duplicate"), { recursive: true });
  const duplicate = await run(process.execPath, [inspectSkillsScript, duplicateLibrary], repoRoot, {}, true);
  if (duplicate.code === 0 || !duplicate.stderr.includes("Duplicate skill name in library")) {
    throw new Error("Skill library accepted an ambiguous duplicate name.");
  }

  // Require the explicit source library whenever any producer or reviewer selects a skill.
  const missingTarget = resolve(temporaryRoot, "missing-library");
  const missing = await run(
    process.execPath,
    [scaffoldScript, resolve(fixturesDir, "skill-routing.json"), missingTarget],
    repoRoot,
    {},
    true,
  );
  if (missing.code === 0 || (await stat(missingTarget).catch(() => null))) {
    throw new Error("A skill-aware workflow scaffolded without its explicit library.");
  }

  // Scaffold the main proof and verify that only selected, digest-bound guidance is embedded.
  const skillTarget = resolve(temporaryRoot, "skill-routing");
  await run(
    process.execPath,
    [scaffoldScript, resolve(fixturesDir, "skill-routing.json"), skillTarget, "--skill-library", skillLibrary],
    repoRoot,
  );
  const bundlePath = resolve(skillTarget, "workflow.skills.json");
  const bundleText = await readFile(bundlePath, "utf8");
  const bundle = JSON.parse(bundleText);
  const names = Object.keys(bundle.skills ?? {}).sort();
  if (names.join(",") !== "acceptance-review,solution-design" || bundleText.includes("UNSELECTED_SENTINEL")) {
    throw new Error("Generated skill bundle contains missing or unselected guidance.");
  }
  for (const name of names) {
    const compiled = bundle.skills[name];
    const expected = `sha256:${createHash("sha256").update(compiled.instructions).digest("hex")}`;
    if (compiled.digest !== expected) {
      throw new Error(`Generated skill digest is invalid: ${name}`);
    }
  }
  if (!bundleText.includes("REFERENCE_SENTINEL") || bundleText.includes(skillLibrary)) {
    throw new Error("Generated skill references are incomplete or source-bound.");
  }

  // Install one generated bundle, type-check it, and exercise its public zx entrypoint manually.
  await runNpm(skillTarget, ["install", "--ignore-scripts", "--no-audit", "--no-fund"]);
  await runNpm(skillTarget, ["run", "check"]);
  const packageJson = JSON.parse(await readFile(resolve(skillTarget, "package.json"), "utf8"));
  if (packageJson.scripts.start !== "zx solve.mjs" || !packageJson.dependencies.zx) {
    throw new Error("Generated bundle does not expose the single solve.mjs entrypoint.");
  }
  const dryRun = await runWorkflow(skillTarget, skillTarget, ["--dry-run"]);
  for (const required of [
    "problem=<runtime problem>",
    `controls=${fixtureControlPath}`,
    "agent=producer",
    "provider=fixture-producer",
    "skills=solution-design",
    "reviewers=acceptance",
    "gate=contains",
  ]) {
    if (!dryRun.stdout.includes(required)) {
      throw new Error(`Dry-run does not expose composition evidence: ${required}`);
    }
  }
  await cp(resolve(fixturesDir, "skill-routing-responses.json"), resolve(skillTarget, "responses.json"));
  const entrypoint = await runEntrypoint(
    skillTarget,
    ["--problem", "Design a safe runtime workflow"],
    { ZX_WORKFLOW_AGENT_FIXTURE: "responses.json", ZX_WORKFLOW_RUN_ID: "validation" },
  );
  if (!entrypoint.stdout.includes("Workflow passed: offline-skill-routing")) {
    throw new Error("Generated solve.mjs entrypoint did not complete the runtime problem.");
  }
  const skillEvents = await readFile(
    resolve(skillTarget, ".zx-workflow", "offline-skill-routing", "validation", "events.jsonl"),
    "utf8",
  );
  for (const required of [
    '"agent":"producer"',
    '"event":"reviewer_selected"',
    '"reviewer":"acceptance"',
    bundle.skills["solution-design"].digest,
    bundle.skills["acceptance-review"].digest,
  ]) {
    if (!skillEvents.includes(required)) {
      throw new Error(`Skill routing evidence is missing: ${required}`);
    }
  }

  // Tamper with embedded guidance and prove integrity checking stops before any agent call.
  bundle.skills["solution-design"].instructions += "\nTAMPERED";
  await writeFile(bundlePath, `${JSON.stringify(bundle, null, 2)}\n`);
  const tampered = await runWorkflow(
    skillTarget,
    skillTarget,
    ["--problem", "Reject modified skills"],
    { ZX_WORKFLOW_AGENT_FIXTURE: "responses.json", ZX_WORKFLOW_RUN_ID: "tampered" },
    true,
  );
  if (tampered.code === 0 || !tampered.stderr.includes("Embedded skill is invalid or changed")) {
    throw new Error("Runtime accepted modified embedded skill guidance.");
  }
  await writeFile(bundlePath, bundleText);

  // Exercise problem propagation, TF-IDF reduction, escalation, independent review, and redaction.
  const retryTarget = resolve(temporaryRoot, "retry");
  await run(process.execPath, [scaffoldScript, resolve(fixturesDir, "offline-retry.json"), retryTarget], repoRoot);
  await cp(resolve(fixturesDir, "offline-retry-responses.json"), resolve(retryTarget, "responses.json"));
  await runWorkflow(
    skillTarget,
    retryTarget,
    ["--problem", "coverage retry evidence"],
    { ZX_WORKFLOW_AGENT_FIXTURE: "responses.json", ZX_WORKFLOW_RUN_ID: "validation" },
  );
  const retryEvents = await readFile(
    resolve(retryTarget, ".zx-workflow", "offline-retry-proof", "validation", "events.jsonl"),
    "utf8",
  );
  for (const required of [
    '"model":"fast-fixture-model"',
    '"model":"strong-fixture-model"',
    '"event":"review_completed"',
    '"reviewer":"quality-review","passed":false',
    '"stage":"reason","attempt":2',
    '"stage":"retry-mutation","attempt":1',
    "token=[REDACTED]",
  ]) {
    if (!retryEvents.includes(required)) {
      throw new Error(`Runtime orchestration evidence is missing: ${required}`);
    }
  }
  if (retryEvents.includes("fixture-secret")) {
    throw new Error("Run log contains an unredacted credential.");
  }
  if ((await readFile(resolve(retryTarget, "input.txt"), "utf8")) !== "coverage retry evidence") {
    throw new Error("Runtime problem was not passed as one argv value.");
  }
  if ((await readFile(resolve(retryTarget, "protected.txt"), "utf8")) !== "accepted") {
    throw new Error("Retry did not restore its declared mutation before the next attempt.");
  }

  // Prove one global call budget covers producer retries and independent reviewers.
  const budgetPlan = resolve(temporaryRoot, "budget-plan.json");
  await writeFile(
    budgetPlan,
    `${JSON.stringify(
      {
        name: "offline-budget-proof",
        description: "Stop before a reviewer would exceed the global call envelope.",
        budgets: { maxAgentCalls: 2, maxWallTimeMs: 60000 },
        agents: {
          fixture: {
            provider: "fixture",
            command: process.execPath,
            args: ["--version"],
            promptMode: "stdin",
          },
        },
        stages: [
          {
            id: "solve",
            kind: "agent",
            agent: "fixture",
            prompt: "Return ACCEPT only when complete.",
            output: "run/result.txt",
            attempts: 2,
            models: { fast: "fixture-fast", strong: "fixture-strong" },
            gate: { kind: "contains", values: ["ACCEPT"] },
            reviewers: [
              {
                id: "semantic-review",
                agent: "fixture",
                model: "fixture-review",
                prompt: "Return the review contract.",
              },
            ],
          },
        ],
      },
      null,
      2,
    )}\n`,
  );
  const budgetTarget = resolve(temporaryRoot, "budget");
  await run(process.execPath, [scaffoldScript, budgetPlan, budgetTarget], repoRoot);
  const budgetDryRun = await runWorkflow(skillTarget, budgetTarget, ["--dry-run"]);
  if (!budgetDryRun.stdout.includes('budgets={"maxAgentCalls":2,"maxWallTimeMs":60000}')) {
    throw new Error("Dry-run omitted the global resource envelope.");
  }
  await writeFile(
    resolve(budgetTarget, "responses.json"),
    `${JSON.stringify({ solve: ["REJECT", "ACCEPT"], "solve:semantic-review": ['{"passed":true,"feedback":"ok"}'] })}\n`,
  );
  const budgetFailure = await runWorkflow(
    skillTarget,
    budgetTarget,
    ["--problem", "respect the global envelope"],
    { ZX_WORKFLOW_AGENT_FIXTURE: "responses.json", ZX_WORKFLOW_RUN_ID: "validation" },
    true,
  );
  const budgetEvents = await readFile(
    resolve(budgetTarget, ".zx-workflow", "offline-budget-proof", "validation", "events.jsonl"),
    "utf8",
  );
  if (
    budgetFailure.code === 0 ||
    !budgetFailure.stderr.includes("Workflow budget exhausted: maxAgentCalls") ||
    !budgetEvents.includes('"event":"budget_exhausted"') ||
    !budgetEvents.includes('"contextId":"solve:semantic-review"')
  ) {
    throw new Error("Global call budget did not stop the reviewer before a third agent call.");
  }

  // Token limits are sound only when every selected adapter emits structured usage.
  const unmeteredPlan = JSON.parse(await readFile(budgetPlan, "utf8"));
  unmeteredPlan.name = "invalid-token-budget";
  unmeteredPlan.budgets = { maxInputTokens: 1000 };
  const unmeteredPlanPath = resolve(temporaryRoot, "unmetered-budget-plan.json");
  await writeFile(unmeteredPlanPath, `${JSON.stringify(unmeteredPlan, null, 2)}\n`);
  const invalidBudget = await run(
    process.execPath,
    [scaffoldScript, unmeteredPlanPath, resolve(temporaryRoot, "invalid-token-budget")],
    repoRoot,
    {},
    true,
  );
  if (invalidBudget.code === 0 || !invalidBudget.stderr.includes("Token budgets require metered codex-jsonl")) {
    throw new Error("Scaffolder accepted an unmetered token budget.");
  }

  // Run a real shell-free adapter to prove problem-file input reaches a fresh agent through closed stdin.
  const processPlan = resolve(temporaryRoot, "agent-process-plan.json");
  await writeFile(
    processPlan,
    `${JSON.stringify(
      {
        name: "offline-agent-process",
        description: "Exercise the real non-interactive agent process boundary.",
        controls: fixtureControls,
        agents: {
          echo: {
            provider: "node-echo",
            command: process.execPath,
            args: [
              "-e",
              "let value='';process.stdin.setEncoding('utf8');process.stdin.on('data',chunk=>value+=chunk);process.stdin.on('end',()=>process.stdout.write(value))",
            ],
            promptMode: "stdin",
          },
        },
        stages: [
          {
            id: "echo",
            kind: "agent",
            agent: "echo",
            prompt: "Echo the isolated context.",
            output: "run/echo.txt",
            models: { fast: "local-fast", strong: "local-strong" },
            gate: { kind: "contains", values: ["Runtime problem:", "file supplied problem"] },
          },
        ],
      },
      null,
      2,
    )}\n`,
  );
  const processTarget = resolve(temporaryRoot, "agent-process");
  await run(process.execPath, [scaffoldScript, processPlan, processTarget], repoRoot);
  await writeFile(resolve(processTarget, "problem.md"), "file supplied problem\n");
  await runWorkflow(
    skillTarget,
    processTarget,
    ["--problem-file", "problem.md"],
    { ZX_WORKFLOW_RUN_ID: "validation" },
  );
  const missingProblem = await runWorkflow(skillTarget, processTarget, [], {}, true);
  if (missingProblem.code === 0 || !missingProblem.stderr.includes("Provide the runtime problem")) {
    throw new Error("Runtime accepted a live execution without a problem.");
  }

  // Reject malformed control manifests before scaffolding can create a partial target.
  const controlContractPlan = {
    name: "control-contract",
    description: "Validate protected control declarations before execution.",
    controls: fixtureControls,
    agents: {},
    stages: [
      {
        id: "noop",
        kind: "command",
        command: process.execPath,
        args: ["-e", ""],
      },
    ],
  };
  // Preserve prior plan compatibility while making every declared control manifest strict.
  const noControlPlan = structuredClone(controlContractPlan);
  delete noControlPlan.controls;
  const noControlPlanPath = resolve(temporaryRoot, "no-controls.json");
  const noControlTarget = resolve(temporaryRoot, "no-controls");
  await writeFile(noControlPlanPath, `${JSON.stringify(noControlPlan, null, 2)}\n`);
  await run(process.execPath, [scaffoldScript, noControlPlanPath, noControlTarget], repoRoot);
  const noControlDryRun = await runWorkflow(skillTarget, noControlTarget, ["--dry-run"]);
  if (!noControlDryRun.stdout.includes("controls=none")) {
    throw new Error("A compatible plan without controls did not survive scaffold and dry-run.");
  }

  const invalidControlCases = [
    {
      id: "empty",
      expected: "non-empty",
      change: (plan) => (plan.controls = []),
    },
    {
      id: "digest",
      expected: "Protected control is invalid",
      change: (plan) => (plan.controls[0].sha256 = `sha256:${"A".repeat(64)}`),
    },
    {
      id: "absolute",
      expected: "Protected control is invalid",
      change: (plan) => (plan.controls[0].path = "/outside/control.txt"),
    },
    {
      id: "traversal",
      expected: "Protected control is invalid",
      change: (plan) => (plan.controls[0].path = "../control.txt"),
    },
    {
      id: "duplicate",
      expected: "must be unique",
      change: (plan) => plan.controls.push({ ...plan.controls[0], path: ".policy\\workflow-control.txt" }),
    },
    {
      id: "overlap",
      expected: "must not overlap",
      change: (plan) => {
        plan.stages[0].mutates = [".policy"];
        plan.stages[0].gate = { kind: "contains", path: fixtureControlPath, values: ["fixture"] };
      },
    },
  ];
  for (const invalidCase of invalidControlCases) {
    const plan = structuredClone(controlContractPlan);
    invalidCase.change(plan);
    const planPath = resolve(temporaryRoot, `invalid-control-${invalidCase.id}.json`);
    const target = resolve(temporaryRoot, `invalid-control-${invalidCase.id}`);
    await writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`);
    const result = await run(process.execPath, [scaffoldScript, planPath, target], repoRoot, {}, true);
    if (
      result.code === 0 ||
      !result.stderr.includes(invalidCase.expected) ||
      (await stat(target).catch(() => null))
    ) {
      throw new Error(`Scaffolder accepted invalid protected controls: ${invalidCase.id}`);
    }
  }

  // Every external process boundary must restore a changed control, record no bytes, and stop terminally.
  const changeControlScript = `require('node:fs').writeFileSync(${JSON.stringify(fixtureControlPath)}, 'changed')`;
  const changeMutableScript = "require('node:fs').writeFileSync('mutable.txt', 'changed')";
  const emitCandidateScript = "process.stdout.write('APPROVED\\nVerification: fixture')";
  const controlTamperCases = [
    {
      id: "command",
      boundary: "after:command:mutate",
      plan: {
        name: "control-command",
        description: "Reject a command that changes a protected control.",
        controls: fixtureControls,
        agents: {},
        stages: [
          {
            id: "mutate",
            kind: "command",
            command: process.execPath,
            args: ["-e", `${changeMutableScript};${changeControlScript}`],
            mutates: ["mutable.txt"],
            gate: { kind: "contains", path: "mutable.txt", values: ["changed"] },
          },
        ],
      },
    },
    {
      id: "command-gate",
      boundary: "after:command-gate:check",
      plan: {
        name: "control-command-gate",
        description: "Reject a command gate that changes a protected control.",
        controls: fixtureControls,
        agents: {},
        stages: [
          {
            id: "check",
            kind: "command",
            command: process.execPath,
            args: ["-e", changeMutableScript],
            mutates: ["mutable.txt"],
            gate: { kind: "command", command: process.execPath, args: ["-e", changeControlScript] },
          },
        ],
      },
    },
    {
      id: "producer",
      boundary: "after:producer:solve",
      plan: {
        name: "control-producer",
        description: "Reject a producer that changes a protected control.",
        controls: fixtureControls,
        agents: {
          producer: {
            provider: "fixture-process",
            command: process.execPath,
            args: ["-e", `${changeMutableScript};${changeControlScript};${emitCandidateScript}`],
            promptMode: "stdin",
          },
        },
        stages: [
          {
            id: "solve",
            kind: "agent",
            agent: "producer",
            prompt: "Produce a candidate.",
            output: "run/candidate.txt",
            attempts: 2,
            models: { fast: "local-fast", strong: "local-strong" },
            gate: { kind: "contains", values: ["APPROVED"] },
            mutates: ["mutable.txt"],
          },
        ],
      },
    },
    {
      id: "reviewer",
      boundary: "after:reviewer:solve:review",
      plan: {
        name: "control-reviewer",
        description: "Reject a reviewer that changes a protected control.",
        controls: fixtureControls,
        agents: {
          producer: {
            provider: "fixture-process",
            command: process.execPath,
            args: ["-e", emitCandidateScript],
            promptMode: "stdin",
          },
          reviewer: {
            provider: "fixture-process",
            command: process.execPath,
            args: [
              "-e",
              `${changeMutableScript};${changeControlScript};process.stdout.write(JSON.stringify({passed:true,feedback:'ok',evidence:[]}))`,
            ],
            promptMode: "stdin",
          },
        },
        stages: [
          {
            id: "solve",
            kind: "agent",
            agent: "producer",
            prompt: "Produce a candidate.",
            output: "run/candidate.txt",
            models: { fast: "local-fast", strong: "local-strong" },
            gate: { kind: "contains", values: ["APPROVED"] },
            mutates: ["mutable.txt"],
            reviewers: [
              {
                id: "review",
                agent: "reviewer",
                model: "local-review",
                prompt: "Review the candidate.",
              },
            ],
          },
        ],
      },
    },
  ];
  const controlTamperTargets = [];
  for (const tamperCase of controlTamperCases) {
    const planPath = resolve(temporaryRoot, `control-${tamperCase.id}.json`);
    const target = resolve(temporaryRoot, `control-${tamperCase.id}`);
    await writeFile(planPath, `${JSON.stringify(tamperCase.plan, null, 2)}\n`);
    await run(process.execPath, [scaffoldScript, planPath, target], repoRoot);
    await writeFile(resolve(target, "mutable.txt"), "original");
    const result = await runWorkflow(
      skillTarget,
      target,
      ["--problem", "protect gate authority"],
      { ZX_WORKFLOW_RUN_ID: "validation" },
      true,
    );
    const events = await readFile(
      resolve(target, ".zx-workflow", tamperCase.plan.name, "validation", "events.jsonl"),
      "utf8",
    );
    if (
      result.code === 0 ||
      (await readFile(resolve(target, fixtureControlPath), "utf8")) !== fixtureControlText ||
      (await readFile(resolve(target, "mutable.txt"), "utf8")) !== "original" ||
      !events.includes('"event":"protected_control_changed"') ||
      !events.includes('"event":"stage_rolled_back"') ||
      !events.includes(`"boundary":"${tamperCase.boundary}"`) ||
      !events.includes('"restored":true') ||
      `${result.stdout}\n${result.stderr}\n${events}`.includes(fixtureControlText.trim()) ||
      (await stat(resolve(target, "run", "candidate.txt")).catch(() => null))
    ) {
      throw new Error(`Protected control mutation did not fail closed: ${tamperCase.id}`);
    }
    if (tamperCase.id === "producer" && events.match(/"event":"model_selected"/g)?.length !== 1) {
      throw new Error("Protected control failure was retried after a producer mutation.");
    }
    controlTamperTargets.push(target);
  }

  // Exercise Codex-shaped JSONL without model cost and verify nested usage stays separately auditable.
  const ambientCodexHome = resolve(temporaryRoot, "ambient-codex-home");
  const ambientAuth = resolve(ambientCodexHome, "auth.json");
  await mkdir(ambientCodexHome, { recursive: true });
  await writeFile(ambientAuth, '{"fixture":"auth-material-must-not-enter-telemetry"}\n');
  await writeFile(resolve(ambientCodexHome, "config.toml"), 'model = "ambient-config-must-not-load"\n');
  const authDigestBefore = createHash("sha256").update(await readFile(ambientAuth)).digest("hex");
  const telemetryPlan = resolve(temporaryRoot, "codex-telemetry-plan.json");
  const telemetryDefinition = {
    name: "offline-codex-telemetry",
    description: "Prove structured nested-agent usage and isolated skill discovery.",
    controls: fixtureControls,
    agents: {
      metered: {
        provider: "codex",
        command: process.execPath,
        args: [
          "fake-codex-jsonl.mjs",
          "exec",
          "--ignore-user-config",
          "--model",
          "{model}",
          "--json",
          "--ephemeral",
          "--output-last-message",
          "{lastMessage}",
        ],
        promptMode: "stdin",
        resultFormat: "codex-jsonl",
        env: { ZX_FAKE_HOME_REPORT: "{root}/fake-home-report.json" },
      },
    },
    stages: [
      {
        id: "solve",
        kind: "agent",
        agent: "metered",
        prompt: "Return the fixture result.",
        output: "run/telemetry.json",
        models: { fast: "gpt-5.6-sol", strong: "gpt-5.6-sol" },
        gate: {
          kind: "json",
          required: [
            "ok",
            "isolatedHome",
            "isolatedCodexHome",
            "isolatedSqliteHome",
            "authPresent",
            "configAbsent",
            "ignoreUserConfig",
            "promptReceived",
          ],
        },
      },
    ],
  };
  await writeFile(telemetryPlan, `${JSON.stringify(telemetryDefinition, null, 2)}\n`);
  const telemetryTarget = resolve(temporaryRoot, "codex-telemetry");
  await run(process.execPath, [scaffoldScript, telemetryPlan, telemetryTarget], repoRoot);
  await cp(resolve(fixturesDir, "fake-codex-jsonl.mjs"), resolve(telemetryTarget, "fake-codex-jsonl.mjs"));
  const telemetryState = resolve(temporaryRoot, "external-telemetry-state");
  await runWorkflow(
    skillTarget,
    telemetryTarget,
    ["--problem", "meter one nested call", "--state-root", telemetryState],
    {
      CODEX_AUTH_JSON_PATH: "",
      CODEX_FORCE_AUTH_JSON: "",
      CODEX_HOME: ambientCodexHome,
      ZX_WORKFLOW_RUN_ID: "validation",
    },
  );
  const telemetryOutput = JSON.parse(await readFile(resolve(telemetryTarget, "run", "telemetry.json"), "utf8"));
  if (
    !telemetryOutput.ok ||
    !telemetryOutput.isolatedHome ||
    !telemetryOutput.isolatedCodexHome ||
    !telemetryOutput.isolatedSqliteHome ||
    !telemetryOutput.authPresent ||
    !telemetryOutput.configAbsent ||
    !telemetryOutput.ignoreUserConfig ||
    !telemetryOutput.promptReceived
  ) {
    throw new Error("Metered agent did not isolate homes, config, auth, prompt, and final-message evidence.");
  }
  const telemetryRun = resolve(telemetryState, "offline-codex-telemetry", "validation");
  const calls = (await readFile(resolve(telemetryRun, "model-calls.jsonl"), "utf8"))
    .trim()
    .split(/\r?\n/)
    .map((line) => JSON.parse(line));
  if (
    calls.length !== 1 ||
    calls[0].schemaVersion !== 2 ||
    calls[0].role !== "producer" ||
    calls[0].attempt !== 1 ||
    calls[0].usageCoverage !== "complete" ||
    calls[0].adapter.usageSchema !== "codex-exec-0.153" ||
    calls[0].usage.inputTokens !== 100 ||
    calls[0].usage.cachedInputTokens !== 40 ||
    calls[0].usage.uncachedInputTokens !== 60 ||
    calls[0].usage.cacheWriteInputTokens !== 5 ||
    calls[0].usage.outputTokens !== 20 ||
    calls[0].usage.reasoningOutputTokens !== 10 ||
    calls[0].usage.totalTokens !== 120 ||
    calls[0].stream.malformedLines !== 0 ||
    calls[0].stream.fatalEvents !== 0 ||
    calls[0].stream.eventTypeCounts["turn.completed"] !== 1 ||
    calls[0].auth.mode !== "ambient-file" ||
    !calls[0].auth.isolatedHome
  ) {
    throw new Error("Nested Codex usage ledger is incomplete or double-counts cached input.");
  }
  const homeReport = JSON.parse(await readFile(resolve(telemetryTarget, "fake-home-report.json"), "utf8"));
  for (const path of [homeReport.isolatedHome, homeReport.isolatedCodexHome, homeReport.isolatedSqliteHome]) {
    if (await stat(path).catch(() => null)) {
      throw new Error(`Nested agent temporary state survived cleanup: ${path}`);
    }
  }
  const authDigestAfter = createHash("sha256").update(await readFile(ambientAuth)).digest("hex");
  if (authDigestAfter !== authDigestBefore) {
    throw new Error("Nested agent changed ambient authentication material.");
  }
  const telemetryEvidence = (
    await Promise.all((await findFiles(telemetryRun)).map((file) => readFile(file, "utf8").catch(() => "")))
  ).join("\n");
  for (const forbidden of ["ZX_RAW_JSONL_SECRET_SENTINEL", "meter one nested call", "fixture-command"]) {
    if (telemetryEvidence.includes(forbidden)) {
      throw new Error(`Content-bearing Codex JSONL leaked into telemetry: ${forbidden}`);
    }
  }
  const successfulCallFiles = await stat(resolve(telemetryRun, "agents")).catch(() => null)
    ? await findFiles(resolve(telemetryRun, "agents"))
    : [];
  if (successfulCallFiles.length) {
    throw new Error(`Per-call plaintext survived successful telemetry: ${successfulCallFiles.join(", ")}`);
  }
  if (await stat(resolve(telemetryTarget, ".zx-workflow")).catch(() => null)) {
    throw new Error("Explicit state root leaked workflow evidence into the target repository.");
  }

  // Reject corrupt usage and process failures while retaining only content-free call evidence.
  for (const mode of [
    "malformed",
    "invalid-usage",
    "duplicate-turn",
    "missing-usage",
    "nonzero",
    "oversized-message",
  ]) {
    const failingDefinition = structuredClone(telemetryDefinition);
    failingDefinition.name = `offline-codex-${mode}`;
    failingDefinition.agents.metered.env = {
      ZX_FAKE_CODEX_MODE: mode,
      ZX_FAKE_HOME_REPORT: `{root}/fake-home-${mode}.json`,
    };
    const failingPlan = resolve(temporaryRoot, `codex-${mode}-plan.json`);
    const failingTarget = resolve(temporaryRoot, `codex-${mode}`);
    const failingState = resolve(temporaryRoot, `codex-${mode}-state`);
    await writeFile(failingPlan, `${JSON.stringify(failingDefinition, null, 2)}\n`);
    await run(process.execPath, [scaffoldScript, failingPlan, failingTarget], repoRoot);
    await cp(resolve(fixturesDir, "fake-codex-jsonl.mjs"), resolve(failingTarget, "fake-codex-jsonl.mjs"));
    const failure = await runWorkflow(
      skillTarget,
      failingTarget,
      ["--problem", `private problem ${mode}`, "--state-root", failingState],
      {
        CODEX_AUTH_JSON_PATH: "",
        CODEX_FORCE_AUTH_JSON: "",
        CODEX_HOME: ambientCodexHome,
        ZX_WORKFLOW_RUN_ID: "validation",
      },
      true,
    );
    if (failure.code === 0) {
      throw new Error(`Corrupt Codex evidence unexpectedly passed: ${mode}`);
    }
    const failureHomeReport = JSON.parse(
      await readFile(resolve(failingTarget, `fake-home-${mode}.json`), "utf8"),
    );
    for (const path of [
      failureHomeReport.isolatedHome,
      failureHomeReport.isolatedCodexHome,
      failureHomeReport.isolatedSqliteHome,
    ]) {
      if (await stat(path).catch(() => null)) {
        throw new Error(`Failed nested call left temporary state behind: ${mode}/${path}`);
      }
    }
    const failureEvidence = (
      await Promise.all((await findFiles(failingState)).map((file) => readFile(file, "utf8").catch(() => "")))
    ).join("\n");
    const failedCallFiles = await stat(resolve(failingState, failingDefinition.name, "validation", "agents")).catch(
      () => null,
    )
      ? await findFiles(resolve(failingState, failingDefinition.name, "validation", "agents"))
      : [];
    if (failedCallFiles.length) {
      throw new Error(`Per-call plaintext survived failed telemetry: ${mode}/${failedCallFiles.join(", ")}`);
    }
    for (const forbidden of ["ZX_RAW_JSONL_SECRET_SENTINEL", `private problem ${mode}`, "fixture-command"]) {
      if (`${failure.stdout}\n${failure.stderr}\n${failureEvidence}`.includes(forbidden)) {
        throw new Error(`Failed Codex call leaked JSONL content: ${mode}/${forbidden}`);
      }
    }
  }
  if (createHash("sha256").update(await readFile(ambientAuth)).digest("hex") !== authDigestBefore) {
    throw new Error("Failed nested calls changed ambient authentication material.");
  }

  // Incomplete metering under a token budget is terminal and cannot consume a retry invisibly.
  const accountingDefinition = structuredClone(telemetryDefinition);
  accountingDefinition.name = "offline-budget-accounting";
  accountingDefinition.budgets = { maxAgentCalls: 3, maxInputTokens: 1000 };
  accountingDefinition.stages[0].attempts = 2;
  accountingDefinition.agents.metered.env = {
    ZX_FAKE_CODEX_MODE: "missing-usage",
    ZX_FAKE_HOME_REPORT: "{root}/fake-home-budget-accounting.json",
  };
  const accountingPlan = resolve(temporaryRoot, "budget-accounting-plan.json");
  const accountingTarget = resolve(temporaryRoot, "budget-accounting");
  const accountingState = resolve(temporaryRoot, "budget-accounting-state");
  await writeFile(accountingPlan, `${JSON.stringify(accountingDefinition, null, 2)}\n`);
  await run(process.execPath, [scaffoldScript, accountingPlan, accountingTarget], repoRoot);
  await cp(resolve(fixturesDir, "fake-codex-jsonl.mjs"), resolve(accountingTarget, "fake-codex-jsonl.mjs"));
  const accountingFailure = await runWorkflow(
    skillTarget,
    accountingTarget,
    ["--problem", "require complete accounting", "--state-root", accountingState],
    { CODEX_HOME: ambientCodexHome, ZX_WORKFLOW_RUN_ID: "validation" },
    true,
  );
  const accountingRun = resolve(accountingState, accountingDefinition.name, "validation");
  const accountingEvents = await readFile(resolve(accountingRun, "events.jsonl"), "utf8");
  const accountingCalls = (await readFile(resolve(accountingRun, "model-calls.jsonl"), "utf8"))
    .trim()
    .split(/\r?\n/)
    .filter(Boolean);
  if (
    accountingFailure.code === 0 ||
    accountingCalls.length !== 1 ||
    !accountingEvents.includes('"event":"budget_accounting_incomplete"') ||
    accountingEvents.includes('"attempt":2')
  ) {
    throw new Error("Incomplete token accounting was retried or accepted.");
  }

  // Validation fixtures cannot masquerade as provider receipts under a token budget.
  const fixtureAccountingDefinition = structuredClone(telemetryDefinition);
  fixtureAccountingDefinition.name = "offline-fixture-accounting";
  fixtureAccountingDefinition.budgets = { maxInputTokens: 1000 };
  const fixtureAccountingPlan = resolve(temporaryRoot, "fixture-accounting-plan.json");
  const fixtureAccountingTarget = resolve(temporaryRoot, "fixture-accounting");
  await writeFile(fixtureAccountingPlan, `${JSON.stringify(fixtureAccountingDefinition, null, 2)}\n`);
  await run(process.execPath, [scaffoldScript, fixtureAccountingPlan, fixtureAccountingTarget], repoRoot);
  await writeFile(
    resolve(fixtureAccountingTarget, "responses.json"),
    `${JSON.stringify({ solve: ['{"ok":true}'] })}\n`,
  );
  const fixtureAccountingFailure = await runWorkflow(
    skillTarget,
    fixtureAccountingTarget,
    ["--problem", "reject synthetic accounting"],
    { ZX_WORKFLOW_AGENT_FIXTURE: "responses.json", ZX_WORKFLOW_RUN_ID: "validation" },
    true,
  );
  const fixtureAccountingEvents = await readFile(
    resolve(fixtureAccountingTarget, ".zx-workflow", fixtureAccountingDefinition.name, "validation", "events.jsonl"),
    "utf8",
  );
  if (
    fixtureAccountingFailure.code === 0 ||
    !fixtureAccountingEvents.includes('"event":"budget_accounting_incomplete"')
  ) {
    throw new Error("Fixture response bypassed the token-accounting boundary.");
  }

  // A real structured receipt that crosses the token limit stops before any configured retry.
  const tokenLimitDefinition = structuredClone(telemetryDefinition);
  tokenLimitDefinition.name = "offline-token-limit";
  tokenLimitDefinition.budgets = { maxAgentCalls: 3, maxInputTokens: 99 };
  tokenLimitDefinition.stages[0].attempts = 2;
  tokenLimitDefinition.agents.metered.env = {
    ZX_FAKE_HOME_REPORT: "{root}/fake-home-token-limit.json",
  };
  const tokenLimitPlan = resolve(temporaryRoot, "token-limit-plan.json");
  const tokenLimitTarget = resolve(temporaryRoot, "token-limit");
  const tokenLimitState = resolve(temporaryRoot, "token-limit-state");
  await writeFile(tokenLimitPlan, `${JSON.stringify(tokenLimitDefinition, null, 2)}\n`);
  await run(process.execPath, [scaffoldScript, tokenLimitPlan, tokenLimitTarget], repoRoot);
  await cp(resolve(fixturesDir, "fake-codex-jsonl.mjs"), resolve(tokenLimitTarget, "fake-codex-jsonl.mjs"));
  const tokenLimitFailure = await runWorkflow(
    skillTarget,
    tokenLimitTarget,
    ["--problem", "enforce the token limit", "--state-root", tokenLimitState],
    { CODEX_HOME: ambientCodexHome, ZX_WORKFLOW_RUN_ID: "validation" },
    true,
  );
  const tokenLimitRun = resolve(tokenLimitState, tokenLimitDefinition.name, "validation");
  const tokenLimitEvents = await readFile(resolve(tokenLimitRun, "events.jsonl"), "utf8");
  const tokenLimitCalls = (await readFile(resolve(tokenLimitRun, "model-calls.jsonl"), "utf8"))
    .trim()
    .split(/\r?\n/)
    .filter(Boolean);
  if (
    tokenLimitFailure.code === 0 ||
    tokenLimitCalls.length !== 1 ||
    !tokenLimitEvents.includes('"event":"budget_exhausted"') ||
    !tokenLimitEvents.includes('"budget":"maxInputTokens"') ||
    tokenLimitEvents.includes('"attempt":2')
  ) {
    throw new Error("Token exhaustion was retried or accepted.");
  }

  // Wall exhaustion escalates process termination and restores every declared mutation.
  const wallPlan = resolve(temporaryRoot, "wall-budget-plan.json");
  await writeFile(
    wallPlan,
    `${JSON.stringify(
      {
        name: "offline-wall-budget",
        description: "Terminate an over-budget process and restore its declared mutation.",
        budgets: { maxWallTimeMs: 300 },
        agents: {},
        stages: [
          {
            id: "bounded-command",
            kind: "command",
            command: process.execPath,
            args: [
              "-e",
              "require('node:fs').writeFileSync('protected.txt','changed');process.on('SIGTERM',()=>{});setInterval(()=>{},1000)",
            ],
            mutates: ["protected.txt"],
            timeoutMs: 5000,
            gate: { kind: "contains", path: "protected.txt", values: ["original"] },
          },
        ],
      },
      null,
      2,
    )}\n`,
  );
  const wallTarget = resolve(temporaryRoot, "wall-budget");
  await run(process.execPath, [scaffoldScript, wallPlan, wallTarget], repoRoot);
  await writeFile(resolve(wallTarget, "protected.txt"), "original");
  const wallStartedAt = Date.now();
  const wallFailure = await runWorkflow(
    skillTarget,
    wallTarget,
    ["--problem", "enforce wall time"],
    { ZX_WORKFLOW_RUN_ID: "validation" },
    true,
  );
  const wallElapsedMs = Date.now() - wallStartedAt;
  const wallEvents = await readFile(
    resolve(wallTarget, ".zx-workflow", "offline-wall-budget", "validation", "events.jsonl"),
    "utf8",
  );
  if (
    wallFailure.code === 0 ||
    wallElapsedMs >= 3000 ||
    (await readFile(resolve(wallTarget, "protected.txt"), "utf8")) !== "original" ||
    !wallEvents.includes('"budget":"maxWallTimeMs"') ||
    !wallEvents.includes('"event":"stage_rolled_back"')
  ) {
    throw new Error("Wall budget did not terminate promptly and restore the stage snapshot.");
  }

  // Fail scaffolding before writes when a nominally metered adapter could create nested sessions.
  const invalidTelemetryPlan = resolve(temporaryRoot, "invalid-codex-telemetry-plan.json");
  const invalidTelemetry = structuredClone(telemetryDefinition);
  invalidTelemetry.agents.metered.args = invalidTelemetry.agents.metered.args.filter(
    (argument) => argument !== "--ignore-user-config",
  );
  await writeFile(invalidTelemetryPlan, `${JSON.stringify(invalidTelemetry, null, 2)}\n`);
  const invalidTelemetryTarget = resolve(temporaryRoot, "invalid-codex-telemetry");
  const invalidTelemetryResult = await run(
    process.execPath,
    [scaffoldScript, invalidTelemetryPlan, invalidTelemetryTarget],
    repoRoot,
    {},
    true,
  );
  if (
    invalidTelemetryResult.code === 0 ||
    !invalidTelemetryResult.stderr.includes("codex-jsonl agents require") ||
    (await stat(invalidTelemetryTarget).catch(() => null))
  ) {
    throw new Error("Scaffolder accepted an unisolated codex-jsonl adapter.");
  }

  // Scaffold and run the three required code-assistant problem types through the same single skill.
  const problemTypeProbes = JSON.parse(
    await readFile(resolve(fixturesDir, "problem-types.json"), "utf8"),
  );
  if (
    problemTypeProbes.map((probe) => probe.plan.name).join(",") !==
    "issue-triage-probe,issue-resolution-probe,code-review-probe"
  ) {
    throw new Error("Problem-type probes do not cover triage, issue resolution, and code review.");
  }
  const [triageProbe, resolutionProbe, reviewProbe] = problemTypeProbes;
  if (
    triageProbe.plan.stages.some((stage) => stage.mutates?.length) ||
    !triageProbe.plan.stages.some((stage) => stage.kind === "agent" && stage.reviewers?.length) ||
    !resolutionProbe.plan.stages.some(
      (stage) => stage.kind === "agent" && stage.mutates?.length && stage.reviewers?.length,
    ) ||
    reviewProbe.plan.stages.some((stage) => stage.mutates?.length)
  ) {
    throw new Error("Problem-type probes violate their read-only, mutation, or review boundaries.");
  }
  const problemTypeTargets = [];
  for (const probe of problemTypeProbes) {
    const planPath = resolve(temporaryRoot, `${probe.plan.name}.json`);
    const target = resolve(temporaryRoot, probe.plan.name);
    await writeFile(planPath, `${JSON.stringify(probe.plan, null, 2)}\n`);
    await run(process.execPath, [scaffoldScript, planPath, target], repoRoot);
    await writeFile(resolve(target, "responses.json"), `${JSON.stringify(probe.responses, null, 2)}\n`);
    await runWorkflow(
      skillTarget,
      target,
      ["--problem", probe.problem],
      { ZX_WORKFLOW_AGENT_FIXTURE: "responses.json", ZX_WORKFLOW_RUN_ID: "validation" },
    );
    if (!(await stat(resolve(target, probe.output)).catch(() => null))) {
      throw new Error(`Problem-type workflow did not produce ${probe.output}: ${probe.plan.name}`);
    }
    const events = await readFile(
      resolve(target, ".zx-workflow", probe.plan.name, "validation", "events.jsonl"),
      "utf8",
    );
    if (!events.includes('"event":"model_selected"') || !events.includes('"event":"workflow_passed"')) {
      throw new Error(`Problem-type workflow lacks agent evidence: ${probe.plan.name}`);
    }
    problemTypeTargets.push(target);
  }

  // Force terminal failure and prove the original bytes are restored.
  const rollbackTarget = resolve(temporaryRoot, "rollback");
  await run(process.execPath, [scaffoldScript, resolve(fixturesDir, "offline-rollback.json"), rollbackTarget], repoRoot);
  await writeFile(resolve(rollbackTarget, "protected.txt"), "original");
  const rollback = await runWorkflow(
    skillTarget,
    rollbackTarget,
    ["--problem", "prove rollback"],
    { ZX_WORKFLOW_RUN_ID: "validation" },
    true,
  );
  if (rollback.code === 0 || (await readFile(resolve(rollbackTarget, "protected.txt"), "utf8")) !== "original") {
    throw new Error("Terminal gate failure did not restore the declared mutation.");
  }

  // Verify generated files never reach back into this source repository.
  for (const target of [
    skillTarget,
    retryTarget,
    budgetTarget,
    processTarget,
    telemetryTarget,
    accountingTarget,
    fixtureAccountingTarget,
    tokenLimitTarget,
    wallTarget,
    ...controlTamperTargets,
    noControlTarget,
    ...problemTypeTargets,
    rollbackTarget,
  ]) {
    for (const file of await findFiles(target)) {
      const content = await readFile(file, "utf8").catch(() => "");
      if (content.includes("skills/zx-workflow-author") || content.includes(skillDir)) {
        throw new Error(`Generated runtime references the source skill: ${file}`);
      }
    }
  }

  console.log("zx-workflow-author validation passed.");
} finally {
  // Remove isolated fixtures so validation never pollutes the repository or a user target.
  await rm(temporaryRoot, { recursive: true, force: true });
}

async function createFixtureSkill(root, name, description, body, reference = "") {
  // Create the smallest valid external skill and only the reference needed by its test.
  const directory = resolve(root, name);
  await mkdir(resolve(directory, "references"), { recursive: true });
  await writeFile(
    resolve(directory, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n\n${body}\n`,
  );
  if (reference) {
    await writeFile(resolve(directory, "references", "checklist.md"), `${reference}\n`);
  }
}

async function findNamedFiles(root, name) {
  // Walk deterministically so repository-shape failures are stable across platforms.
  return (await findFiles(root)).filter((file) => file.endsWith(name)).sort();
}

async function findFiles(root) {
  // Iterate instead of recursing through helper calls to keep large generated trees bounded and clear.
  const pending = [root];
  const files = [];
  while (pending.length) {
    const current = pending.pop();
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = resolve(current, entry.name);
      if (entry.isDirectory() && entry.name !== "node_modules") {
        pending.push(path);
      } else if (entry.isFile()) {
        files.push(path);
      }
    }
  }
  return files;
}

async function runWorkflow(toolTarget, cwd, args, env = {}, allowFailure = false, prepareControls = true) {
  // Reuse the installed tsx runtime while executing each generated workflow in its own root.
  if (prepareControls) {
    await prepareFixtureControls(cwd);
  }
  const tsxCli = resolve(toolTarget, "node_modules", "tsx", "dist", "cli.mjs");
  return await run(process.execPath, [tsxCli, resolve(cwd, "workflow.ts"), ...args], cwd, env, allowFailure);
}

async function runEntrypoint(cwd, args, env = {}, allowFailure = false) {
  // Invoke the installed zx CLI directly so npm option parsing cannot consume workflow flags.
  await prepareFixtureControls(cwd);
  const zxCli = resolve(cwd, "node_modules", "zx", "build", "cli.js");
  return await run(process.execPath, [zxCli, resolve(cwd, "solve.mjs"), ...args], cwd, env, allowFailure);
}

async function prepareFixtureControls(cwd) {
  // Test plans share one content sentinel; production controls are never synthesized by the runtime.
  const plan = JSON.parse(await readFile(resolve(cwd, "workflow.plan.json"), "utf8"));
  for (const control of plan.controls ?? []) {
    if (control.path !== fixtureControlPath || control.sha256 !== fixtureControlSha256) {
      throw new Error(`Validation plan declares an unknown protected control: ${control.path}`);
    }
    const target = resolve(cwd, control.path);
    await mkdir(resolve(target, ".."), { recursive: true });
    await writeFile(target, fixtureControlText);
  }
}

async function runNpm(cwd, args, env = {}) {
  // Call npm through Node so Windows never needs a shell to locate npm.cmd.
  const bundled = resolve(process.execPath, "..", "node_modules", "npm", "bin", "npm-cli.js");
  const candidates = [process.env.npm_execpath ?? "", bundled].filter(Boolean);
  for (const candidate of candidates) {
    if (await stat(candidate).catch(() => null)) {
      return await run(process.execPath, [candidate, ...args], cwd, env);
    }
  }
  return await run("npm", args, cwd, env);
}

async function run(command, args, cwd, env = {}, allowFailure = false) {
  // Capture bounded process evidence and preserve argv boundaries for every validation command.
  const result = await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
      shell: false,
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout = `${stdout}${String(chunk)}`.slice(-1000000);
    });
    child.stderr.on("data", (chunk) => {
      stderr = `${stderr}${String(chunk)}`.slice(-1000000);
    });
    child.on("error", rejectPromise);
    child.on("close", (code) => resolvePromise({ code: code ?? 1, stdout, stderr }));
  });
  if (result.code !== 0 && !allowFailure) {
    throw new Error(`${command} failed with ${result.code}\n${result.stdout}\n${result.stderr}`);
  }
  return result;
}
