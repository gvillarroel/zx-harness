#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, cp, link, lstat, mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
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

if (process.env.ZX_WORKFLOW_PROCESS_TREE_STRESS_ONLY === "1") {
  try {
    const rawIterations = process.env.ZX_WORKFLOW_PROCESS_TREE_STRESS_ITERATIONS ?? "50";
    const iterations = Number(rawIterations);
    if (!/^[1-9][0-9]{0,2}$/.test(rawIterations) || !Number.isSafeInteger(iterations) || iterations > 500) {
      throw new Error("ZX_WORKFLOW_PROCESS_TREE_STRESS_ITERATIONS must be an integer from 1 to 500.");
    }
    const stressToolTarget = await validateProcessTreeCleanup(null, iterations);
    await validateGracefulAgentTimeout(stressToolTarget, iterations);
    console.log(`zx-workflow-author process-tree stress passed: ${iterations}/${iterations}.`);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
} else {
try {
  // Enforce exact repository topology when present; a sealed standalone bundle has no repository siblings.
  const repositorySkills = resolve(repoRoot, "skills");
  const repositorySkillsState = await stat(repositorySkills).catch((error) => {
    if (error?.code === "ENOENT") return null;
    throw error;
  });
  if (repositorySkillsState) {
    const skillDirectories = (await readdir(repositorySkills, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
    if (skillDirectories.join(",") !== "zx-workflow-author") {
      throw new Error(`Expected one product skill, found: ${skillDirectories.join(", ")}`);
    }
    const manifests = await findNamedFiles(repositorySkills, "SKILL.md");
    if (manifests.length !== 1 || manifests[0] !== resolve(skillDir, "SKILL.md")) {
      throw new Error(`Expected one SKILL.md under skills/, found ${manifests.length}.`);
    }
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

  // Reject ambient runtime assets before creating output so the public manifest stays closed.
  const driftSkill = resolve(temporaryRoot, "runtime-drift-skill");
  const driftTarget = resolve(temporaryRoot, "runtime-drift-target");
  await cp(skillDir, driftSkill, { recursive: true });
  await writeFile(resolve(driftSkill, "assets", "runtime", "ambient.txt"), "must not ship\n");
  const driftResult = await run(
    process.execPath,
    [
      resolve(driftSkill, "scripts", "scaffold-workflow.mjs"),
      resolve(fixturesDir, "offline-rollback.json"),
      driftTarget,
    ],
    repoRoot,
    {},
    true,
  );
  if (
    driftResult.code === 0 ||
    !driftResult.stderr.includes("Runtime asset inventory must contain only") ||
    (await stat(driftTarget).catch(() => null))
  ) {
    throw new Error("Scaffolder accepted runtime asset drift or created a partial target.");
  }

  // Scaffold the main proof and verify that only selected, digest-bound guidance is embedded.
  const skillTarget = resolve(temporaryRoot, "skill-routing");
  await run(
    process.execPath,
    [scaffoldScript, resolve(fixturesDir, "skill-routing.json"), skillTarget, "--skill-library", skillLibrary],
    repoRoot,
  );
  const skillInventory = await readdir(skillTarget, { withFileTypes: true });
  if (
    skillInventory.some((entry) => !entry.isFile()) ||
    skillInventory.map((entry) => entry.name).sort().join(",") !==
      "package.json,solve.mjs,tsconfig.json,workflow.plan.json,workflow.skills.json,workflow.ts"
  ) {
    throw new Error("Skill-aware scaffold exposes an unexpected public root inventory.");
  }
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

  // Prove criterion routing, recursive gates, isolated reviewer evidence, JSON inspection, and budget math together.
  const acceptanceDefinition = {
    name: "offline-acceptance-routing",
    description: "Make every acceptance obligation and evaluation context auditable.",
    family: "code-review-partitioned",
    criteria: [
      {
        id: "candidate-format",
        description: "FORMAT_CRITERION_SENTINEL: candidate includes the verification marker.",
      },
      {
        id: "tests-pass",
        description: "TEST_CRITERION_SENTINEL: nested executable check exits zero.",
      },
      {
        id: "semantic-fit",
        description: "SEMANTIC_CRITERION_SENTINEL: independent review confirms fit.",
      },
    ],
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
        prompt: "Produce a candidate with an explicit verification marker.",
        inputs: [{ path: "producer-only.txt", maxBytes: 77 }],
        maxContextBytes: 8192,
        output: "run/accepted.txt",
        attempts: 2,
        models: { fast: "fixture-fast", strong: "fixture-strong" },
        skills: ["solution-design"],
        gate: {
          kind: "all",
          gates: [
            {
              id: "format-route",
              kind: "contains",
              values: ["APPROVED", "Verification:"],
              covers: ["candidate-format"],
            },
            {
              kind: "all",
              gates: [
                {
                  id: "tests-route",
                  kind: "command",
                  command: process.execPath,
                  args: ["-e", "process.exit(0)"],
                  covers: ["tests-pass"],
                },
              ],
            },
          ],
        },
        reviewers: [
          {
            id: "semantic-review",
            agent: "fixture",
            model: "fixture-review",
            prompt: "Judge only the assigned semantic criterion.",
            covers: ["semantic-fit"],
            inputs: [{ path: "reviewer-only.txt" }],
            inheritProducerInputs: false,
            maxContextBytes: 4096,
            skills: ["acceptance-review"],
          },
        ],
      },
    ],
  };
  const acceptancePlan = resolve(temporaryRoot, "acceptance-routing-plan.json");
  const acceptanceTarget = resolve(temporaryRoot, "acceptance-routing");
  await writeFile(acceptancePlan, `${JSON.stringify(acceptanceDefinition, null, 2)}\n`);
  await run(
    process.execPath,
    [scaffoldScript, acceptancePlan, acceptanceTarget, "--skill-library", skillLibrary],
    repoRoot,
  );
  await writeFile(resolve(acceptanceTarget, "producer-only.txt"), "PRODUCER_INPUT_SENTINEL\n");
  await writeFile(resolve(acceptanceTarget, "reviewer-only.txt"), "REVIEWER_INPUT_SENTINEL\n");

  const inspectionFirst = await runWorkflow(skillTarget, acceptanceTarget, ["--dry-run", "--json"]);
  const inspectionSecond = await runWorkflow(skillTarget, acceptanceTarget, ["--json", "--dry-run"]);
  if (inspectionFirst.stdout !== inspectionSecond.stdout) {
    throw new Error("Dry-run JSON is not deterministic across equivalent option orderings.");
  }
  if (await stat(resolve(acceptanceTarget, ".zx-workflow")).catch(() => null)) {
    throw new Error("Dry-run created workflow state instead of remaining read-only.");
  }
  const inspection = JSON.parse(inspectionFirst.stdout);
  if (
    Object.keys(inspection).join(",") !==
      "schemaVersion,plan,planSha256,budgets,controls,acceptanceMatrix,happyPath,contexts,stages,orderedHappyPath" ||
    inspection.schemaVersion !== 1 ||
    inspection.plan.name !== acceptanceDefinition.name ||
    inspection.plan.family !== acceptanceDefinition.family ||
    JSON.stringify(inspection.plan) !== JSON.stringify(acceptanceDefinition) ||
    inspection.controls.length !== 0 ||
    inspection.acceptanceMatrix.length !== 3 ||
    inspection.contexts.length !== 2 ||
    inspection.stages.length !== 1 ||
    inspection.happyPath.minimumAgentCalls !== 2 ||
    inspection.happyPath.worstCaseAgentCalls !== 4 ||
    inspection.happyPath.configuredMaxAgentCalls !== 2 ||
    inspection.happyPath.withinBudget !== true
  ) {
    throw new Error("Dry-run JSON omitted its stable schema, matrix, contexts, stages, or budget envelope.");
  }
  const acceptanceBundle = JSON.parse(await readFile(resolve(acceptanceTarget, "workflow.skills.json"), "utf8"));
  const matrixById = Object.fromEntries(
    inspection.acceptanceMatrix.map((criterion) => [criterion.criterionId, criterion]),
  );
  if (
    matrixById["candidate-format"].routes.length !== 1 ||
    matrixById["candidate-format"].routes[0].routeId !== "format-route" ||
    matrixById["candidate-format"].routes[0].kind !== "contains" ||
    matrixById["tests-pass"].routes.length !== 1 ||
    matrixById["tests-pass"].routes[0].routeId !== "tests-route" ||
    matrixById["tests-pass"].routes[0].kind !== "command" ||
    matrixById["semantic-fit"].routes.length !== 1 ||
    matrixById["semantic-fit"].routes[0].routeId !== "solve.reviewer.semantic-review" ||
    matrixById["semantic-fit"].routes[0].kind !== "reviewer" ||
    matrixById["semantic-fit"].routes[0].reviewerId !== "semantic-review" ||
    matrixById["semantic-fit"].routes[0].inputs[0].path !== "reviewer-only.txt" ||
    matrixById["semantic-fit"].routes[0].inputs[0].maxBytes !== 12000 ||
    matrixById["semantic-fit"].routes[0].skills[0].name !== "acceptance-review" ||
    matrixById["semantic-fit"].routes[0].skills[0].digest !==
      acceptanceBundle.skills["acceptance-review"].digest
  ) {
    throw new Error("Acceptance matrix lost a stable gate or reviewer route.");
  }
  const producerContext = inspection.contexts.find((context) => context.id === "solve");
  const reviewerContext = inspection.contexts.find((context) => context.id === "solve:semantic-review");
  if (
    producerContext.role !== "producer" ||
    producerContext.inputs.length !== 1 ||
    producerContext.inputs[0].path !== "producer-only.txt" ||
    producerContext.inputs[0].maxBytes !== 77 ||
    producerContext.maxContextBytes !== 8192 ||
    producerContext.skills[0].name !== "solution-design" ||
    producerContext.skills[0].digest !== acceptanceBundle.skills["solution-design"].digest ||
    producerContext.criteria.join(",") !== "candidate-format,tests-pass,semantic-fit" ||
    reviewerContext.role !== "reviewer" ||
    reviewerContext.inputs.length !== 1 ||
    reviewerContext.inputs[0].path !== "reviewer-only.txt" ||
    reviewerContext.inputs[0].maxBytes !== 12000 ||
    reviewerContext.maxContextBytes !== 4096 ||
    reviewerContext.inheritProducerInputs !== false ||
    reviewerContext.projectionArtifacts.problem !== ".zx-reviewer-context/problem.txt" ||
    reviewerContext.projectionArtifacts.candidate !== ".zx-reviewer-context/candidate.txt" ||
    reviewerContext.criteria.join(",") !== "semantic-fit" ||
    reviewerContext.skills[0].name !== "acceptance-review"
  ) {
    throw new Error("Dry-run contexts do not expose effective isolated inputs, skills, and criteria.");
  }
  const jsonWithoutDryRun = await runWorkflow(skillTarget, acceptanceTarget, ["--json"], {}, true);
  if (jsonWithoutDryRun.code === 0 || !jsonWithoutDryRun.stderr.includes("--json is valid only with --dry-run")) {
    throw new Error("Runtime accepted --json outside dry-run inspection.");
  }

  await writeFile(
    resolve(acceptanceTarget, "responses.json"),
    `${JSON.stringify(
      {
        solve: [
          {
            response: "APPROVED\nVerification: G008 candidate",
            promptIncludes: [
              "PRODUCER_INPUT_SENTINEL",
              "FORMAT_CRITERION_SENTINEL",
              "TEST_CRITERION_SENTINEL",
              "SEMANTIC_CRITERION_SENTINEL",
              "SOLUTION_SKILL_SENTINEL",
            ],
            promptExcludes: ["REVIEWER_INPUT_SENTINEL"],
          },
        ],
        "solve:semantic-review": [
          {
            response: '{"passed":true,"feedback":"ok","evidence":[]}',
            promptIncludes: [
              "route every acceptance obligation",
              "APPROVED",
              "REVIEWER_INPUT_SENTINEL",
              "SEMANTIC_CRITERION_SENTINEL",
              "REVIEW_SKILL_SENTINEL",
            ],
            promptExcludes: [
              "PRODUCER_INPUT_SENTINEL",
              "FORMAT_CRITERION_SENTINEL",
              "TEST_CRITERION_SENTINEL",
              "SOLUTION_SKILL_SENTINEL",
            ],
          },
        ],
      },
      null,
      2,
    )}\n`,
  );
  const acceptanceRun = await runWorkflow(
    skillTarget,
    acceptanceTarget,
    ["--problem", "route every acceptance obligation"],
    { ZX_WORKFLOW_AGENT_FIXTURE: "responses.json", ZX_WORKFLOW_RUN_ID: "g008-happy" },
  );
  if (!acceptanceRun.stdout.includes("Workflow passed: offline-acceptance-routing")) {
    throw new Error("Criteria-aware workflow did not complete its exact happy path.");
  }
  const inspectionAfterState = await runWorkflow(
    skillTarget,
    acceptanceTarget,
    ["--json", "--dry-run"],
    { ZX_WORKFLOW_RUN_ID: "different-run-id" },
  );
  const tsxCli = resolve(skillTarget, "node_modules", "tsx", "dist", "cli.mjs");
  const inspectionFromDifferentCwd = await run(
    process.execPath,
    [
      tsxCli,
      resolve(acceptanceTarget, "workflow.ts"),
      "--plan",
      resolve(acceptanceTarget, "workflow.plan.json"),
      "--root",
      acceptanceTarget,
      "--dry-run",
      "--json",
    ],
    temporaryRoot,
    { ZX_WORKFLOW_RUN_ID: "another-run-id" },
  );
  if (
    inspectionFirst.stdout !== inspectionAfterState.stdout ||
    inspectionFirst.stdout !== inspectionFromDifferentCwd.stdout ||
    inspection.orderedHappyPath.map((step) => step.action).join(",") !==
      "producer,gate,gate,reviewer,exclusive-promotion" ||
    inspection.plan.stages[0].gate.gates[1].gates[0].id !== "tests-route"
  ) {
    throw new Error("Lossless dry-run changed with cwd, run ID, existing state, or recursive authority.");
  }
  const acceptanceEvents = (
    await readFile(
      resolve(acceptanceTarget, ".zx-workflow", acceptanceDefinition.name, "g008-happy", "events.jsonl"),
      "utf8",
    )
  )
    .trim()
    .split(/\r?\n/)
    .map((line) => JSON.parse(line));
  const completedAcceptanceGates = acceptanceEvents.filter((event) => event.event === "gate_completed");
  if (
    completedAcceptanceGates.length !== 2 ||
    completedAcceptanceGates.map((event) => event.route).join(",") !== "format-route,tests-route" ||
    completedAcceptanceGates.some(
      (event) =>
        Object.keys(event).sort().join(",") !==
          "covers,event,kind,previousSha256,recordSha256,result,route,schemaVersion,sequence,stage,timestamp" ||
        event.result !== "passed",
    ) ||
    acceptanceEvents.filter((event) => event.event === "model_selected").length !== 1 ||
    !acceptanceEvents.some(
      (event) =>
        event.event === "reviewer_selected" &&
        event.reviewer === "semantic-review" &&
        event.covers?.join(",") === "semantic-fit" &&
        event.inputs?.length === 1 &&
        event.inputs[0].path === "reviewer-only.txt" &&
        event.inputs[0].maxBytes === 12000,
    ) ||
    !acceptanceEvents.some((event) => event.event === "workflow_passed")
  ) {
    throw new Error("Runtime acceptance receipts are incomplete, content-bearing, or unstable.");
  }

  // Hard source and composed UTF-8 prompt caps fail before reserving or launching an agent call.
  await writeFile(resolve(acceptanceTarget, "producer-only.txt"), `${"x".repeat(78)}\n`);
  const oversizedInputRun = await runWorkflow(
    skillTarget,
    acceptanceTarget,
    ["--problem", "reject an oversized declared input"],
    { ZX_WORKFLOW_AGENT_FIXTURE: "responses.json", ZX_WORKFLOW_RUN_ID: "g008-input-cap" },
    true,
  );
  if (
    oversizedInputRun.code === 0 ||
    !oversizedInputRun.stderr.includes("input exceeds maxBytes before state creation") ||
    (await stat(
      resolve(acceptanceTarget, ".zx-workflow", acceptanceDefinition.name, "g008-input-cap"),
    ).catch(() => null))
  ) {
    throw new Error("Criteria-aware input maxBytes did not fail before state creation and agent launch.");
  }
  await writeFile(resolve(acceptanceTarget, "producer-only.txt"), "PRODUCER_INPUT_SENTINEL\n");

  const producerCapDefinition = structuredClone(acceptanceDefinition);
  producerCapDefinition.stages[0].maxContextBytes = 32;
  await writeFile(
    resolve(acceptanceTarget, "workflow.plan.json"),
    `${JSON.stringify(producerCapDefinition, null, 2)}\n`,
  );
  const producerCapRun = await runWorkflow(
    skillTarget,
    acceptanceTarget,
    ["--problem", "UTF-8 🙂 producer cap"],
    { ZX_WORKFLOW_AGENT_FIXTURE: "responses.json", ZX_WORKFLOW_RUN_ID: "g008-producer-cap" },
    true,
  );
  const producerCapEvents = await readFile(
    resolve(acceptanceTarget, ".zx-workflow", acceptanceDefinition.name, "g008-producer-cap", "events.jsonl"),
    "utf8",
  );
  if (
    producerCapRun.code === 0 ||
    !producerCapEvents.includes('"contextId":"solve"') ||
    !producerCapEvents.includes('"budget":"maxContextBytes"') ||
    producerCapEvents.includes('"event":"model_selected"')
  ) {
    throw new Error("Producer maxContextBytes did not reject the composed UTF-8 prompt before launch.");
  }

  const reviewerCapDefinition = structuredClone(acceptanceDefinition);
  reviewerCapDefinition.stages[0].reviewers[0].maxContextBytes = 32;
  await writeFile(
    resolve(acceptanceTarget, "workflow.plan.json"),
    `${JSON.stringify(reviewerCapDefinition, null, 2)}\n`,
  );
  const reviewerCapRun = await runWorkflow(
    skillTarget,
    acceptanceTarget,
    ["--problem", "route every acceptance obligation"],
    { ZX_WORKFLOW_AGENT_FIXTURE: "responses.json", ZX_WORKFLOW_RUN_ID: "g008-reviewer-cap" },
    true,
  );
  const reviewerCapEvents = await readFile(
    resolve(acceptanceTarget, ".zx-workflow", acceptanceDefinition.name, "g008-reviewer-cap", "events.jsonl"),
    "utf8",
  );
  if (
    reviewerCapRun.code === 0 ||
    !reviewerCapEvents.includes('"contextId":"solve:semantic-review"') ||
    !reviewerCapEvents.includes('"budget":"maxContextBytes"') ||
    reviewerCapEvents.match(/"event":"model_selected"/g)?.length !== 1 ||
    reviewerCapEvents.includes('"event":"reviewer_selected"')
  ) {
    throw new Error("Reviewer maxContextBytes did not reject the isolated UTF-8 prompt before launch.");
  }
  await writeFile(
    resolve(acceptanceTarget, "workflow.plan.json"),
    `${JSON.stringify(acceptanceDefinition, null, 2)}\n`,
  );

  // Mutate one clause at a time and require the scaffolder and generated runtime to reject it identically.
  const invalidAcceptanceCases = [
    {
      id: "empty-criteria",
      expected: "Plan criteria must contain",
      change: (plan) => (plan.criteria = []),
    },
    {
      id: "duplicate-criterion",
      expected: "Acceptance criterion is invalid or duplicated",
      change: (plan) => plan.criteria.push({ ...plan.criteria[0] }),
    },
    {
      id: "invalid-criterion-id",
      expected: "Acceptance criterion is invalid or duplicated",
      change: (plan) => (plan.criteria[0].id = "Invalid_ID"),
    },
    {
      id: "trailing-hyphen-criterion",
      expected: "Acceptance criterion is invalid or duplicated",
      change: (plan) => (plan.criteria[0].id = "trailing-"),
    },
    {
      id: "oversized-description",
      expected: "Acceptance criterion is invalid or duplicated",
      change: (plan) => (plan.criteria[0].description = "x".repeat(1001)),
    },
    {
      id: "unknown-cover",
      expected: "Coverage must contain unique known criterion IDs",
      change: (plan) => (plan.stages[0].gate.gates[0].covers = ["unknown-criterion"]),
    },
    {
      id: "uncovered-criterion",
      expected: "Acceptance criteria lack a gate or reviewer route: semantic-fit",
      change: (plan) => (plan.stages[0].reviewers[0].covers = ["tests-pass"]),
    },
    {
      id: "all-cover",
      expected: "All gate may not declare covers",
      change: (plan) => (plan.stages[0].gate.covers = ["candidate-format"]),
    },
    {
      id: "all-id",
      expected: "All gate may not declare an ID",
      change: (plan) => (plan.stages[0].gate.id = "aggregate-route"),
    },
    {
      id: "trailing-hyphen-gate-id",
      expected: "Leaf gate ID is invalid or duplicated",
      change: (plan) => (plan.stages[0].gate.gates[0].id = "trailing-"),
    },
    {
      id: "duplicate-gate-id",
      expected: "Leaf gate ID is invalid or duplicated",
      change: (plan) => (plan.stages[0].gate.gates[1].gates[0].id = "format-route"),
    },
    {
      id: "missing-leaf-cover",
      expected: "Coverage must contain unique known criterion IDs",
      change: (plan) => delete plan.stages[0].gate.gates[0].covers,
    },
    {
      id: "duplicate-leaf-cover",
      expected: "Coverage must contain unique known criterion IDs",
      change: (plan) =>
        (plan.stages[0].gate.gates[0].covers = ["candidate-format", "candidate-format"]),
    },
    {
      id: "empty-json-path",
      expected: "JSON gate requires non-empty paths",
      change: (plan) =>
        (plan.stages[0].gate.gates[0] = {
          id: "format-route",
          kind: "json",
          required: [""],
          covers: ["candidate-format"],
        }),
    },
    {
      id: "missing-reviewer-cover",
      expected: "Criteria-aware reviewer requires explicit covers and inputs",
      change: (plan) => delete plan.stages[0].reviewers[0].covers,
    },
    {
      id: "missing-reviewer-inputs",
      expected: "Criteria-aware reviewer requires explicit covers and inputs",
      change: (plan) => delete plan.stages[0].reviewers[0].inputs,
    },
    {
      id: "inherited-producer-inputs",
      expected: "Criteria-aware reviewer cannot inherit producer inputs",
      change: (plan) => (plan.stages[0].reviewers[0].inheritProducerInputs = true),
    },
    {
      id: "invalid-producer-context-cap",
      expected: "Agent maxContextBytes must be a positive safe integer",
      change: (plan) => (plan.stages[0].maxContextBytes = 0),
    },
    {
      id: "invalid-reviewer-context-cap",
      expected: "Reviewer maxContextBytes must be a positive safe integer",
      change: (plan) => (plan.stages[0].reviewers[0].maxContextBytes = 0),
    },
    {
      id: "legacy-reviewer-cover",
      expected: "Reviewer covers require plan criteria",
      change: (plan) => {
        delete plan.criteria;
        delete plan.stages[0].gate.gates[0].covers;
        delete plan.stages[0].gate.gates[1].gates[0].covers;
      },
    },
    {
      id: "reviewer-input-traversal",
      expected: "Input reference is invalid",
      change: (plan) => (plan.stages[0].reviewers[0].inputs = [{ path: "../reviewer.txt" }]),
    },
    {
      id: "nested-command-traversal",
      expected: "Plan paths must be repository-relative",
      change: (plan) => (plan.stages[0].gate.gates[1].gates[0].cwd = "../outside"),
    },
    {
      id: "nested-command-secret",
      expected: "Do not store credential environment values",
      change: (plan) => (plan.stages[0].gate.gates[1].gates[0].env = { API_TOKEN: "fixture" }),
    },
    {
      id: "empty-all",
      expected: "All gate must be non-empty",
      change: (plan) => (plan.stages[0].gate.gates[1].gates = []),
    },
    {
      id: "excessive-depth",
      expected: "Gate tree exceeds depth",
      change: (plan) => {
        let gate = plan.stages[0].gate.gates[0];
        for (let depth = 0; depth < 8; depth += 1) {
          gate = { kind: "all", gates: [gate] };
        }
        plan.stages[0].gate = gate;
      },
    },
    {
      id: "insufficient-agent-budget",
      expected: "maxAgentCalls cannot complete the happy path: configured=1, required=2",
      change: (plan) => (plan.budgets.maxAgentCalls = 1),
    },
    {
      id: "single-backslash-root",
      expected: "Input reference is invalid",
      change: (plan) => (plan.stages[0].inputs[0].path = "\\windows-rooted.txt"),
    },
    {
      id: "unknown-stage-field",
      expected: "contains unknown fields",
      change: (plan) => (plan.stages[0].ambientFilesystem = true),
    },
    {
      id: "non-string-argv",
      expected: "Argv is invalid",
      change: (plan) => plan.agents.fixture.args.push(7),
    },
    {
      id: "stdin-prompt-argument",
      expected: "Stdin-mode agent must not include {prompt}",
      change: (plan) => {
        plan.agents.fixture.promptMode = "stdin";
        plan.agents.fixture.args.push("{prompt}");
      },
    },
    {
      id: "duplicate-prompt-transport",
      expected: "Argument-mode agent must include {prompt}",
      change: (plan) => {
        plan.agents.fixture.promptMode = "argument";
        plan.agents.fixture.args.push("{prompt}", "{prompt}");
      },
    },
    {
      id: "unknown-placeholder",
      expected: "Prompt placeholder is invalid",
      change: (plan) => plan.agents.fixture.args.push("{ambientSecret}"),
    },
    {
      id: "invalid-env-value",
      expected: "Environment entry is invalid",
      change: (plan) => (plan.agents.fixture.env = { SAFE_VALUE: 7 }),
    },
    {
      id: "reserved-artifact-sink",
      expected: "Artifact sink targets a reserved runtime path",
      change: (plan) => (plan.agents.fixture.env = { SAFE_SINK: "{runDir}/events.jsonl" }),
    },
    {
      id: "artifact-sink-traversal",
      expected: "Artifact sink must be an exact canonical",
      change: (plan) => (plan.agents.fixture.env = { SAFE_SINK: "{runDir}/../outside.jsonl" }),
    },
    {
      id: "artifact-sink-windows-alias",
      expected: "Artifact sink path is not portable",
      change: (plan) => (plan.agents.fixture.env = { SAFE_SINK: "{runDir}/events.jsonl." }),
    },
    {
      id: "artifact-sink-device-name",
      expected: "Artifact sink path is not portable",
      change: (plan) => (plan.agents.fixture.env = { SAFE_SINK: "{runDir}/NUL.jsonl" }),
    },
    {
      id: "artifact-sink-dynamic-suffix",
      expected: "Artifact sink must be an exact canonical",
      change: (plan) => (plan.agents.fixture.env = { SAFE_SINK: "{runDir}/calls-{model}.jsonl" }),
    },
    {
      id: "duplicate-artifact-sink",
      expected: "Artifact sink paths must be unique",
      change: (plan) =>
        (plan.agents.fixture.env = {
          FIRST_SINK: "{runDir}/external-calls.jsonl",
          SECOND_SINK: "{runDir}/external-calls.jsonl",
        }),
    },
    {
      id: "excessive-timeout",
      expected: "Timeout must be",
      change: (plan) => (plan.agents.fixture.timeoutMs = 86_400_001),
    },
    {
      id: "missing-producer-context-cap",
      expected: "Agent maxContextBytes",
      change: (plan) => delete plan.stages[0].maxContextBytes,
    },
    {
      id: "missing-reviewer-context-cap",
      expected: "Reviewer maxContextBytes",
      change: (plan) => delete plan.stages[0].reviewers[0].maxContextBytes,
    },
    {
      id: "excessive-input-cap",
      expected: "Input reference is invalid",
      change: (plan) => (plan.stages[0].inputs[0].maxBytes = 1_000_001),
    },
    {
      id: "excessive-input-count",
      expected: "Inputs must be an explicit array",
      change: (plan) => (plan.stages[0].inputs = Array.from({ length: 33 }, (_, index) => ({ path: `evidence/${index}.txt` }))),
    },
    {
      id: "duplicate-input",
      expected: "Input reference is duplicated",
      change: (plan) => plan.stages[0].inputs.push({ ...plan.stages[0].inputs[0] }),
    },
    {
      id: "reserved-projection-input",
      expected: "reserved reviewer projection path",
      change: (plan) => (plan.stages[0].reviewers[0].inputs[0].path = ".zx-reviewer-context/problem.txt"),
    },
    {
      id: "undeclared-auth-environment",
      expected: "Agent authEnv must contain only unique supported credential names",
      change: (plan) => (plan.agents.fixture.authEnv = ["ZX_AMBIENT_SECRET"]),
    },
  ];
  for (const invalidCase of invalidAcceptanceCases) {
    const invalidPlan = structuredClone(acceptanceDefinition);
    invalidCase.change(invalidPlan);
    const invalidPlanPath = resolve(temporaryRoot, `invalid-acceptance-${invalidCase.id}.json`);
    const invalidTarget = resolve(temporaryRoot, `invalid-acceptance-${invalidCase.id}`);
    await writeFile(invalidPlanPath, `${JSON.stringify(invalidPlan, null, 2)}\n`);
    const scaffoldFailure = await run(
      process.execPath,
      [scaffoldScript, invalidPlanPath, invalidTarget, "--skill-library", skillLibrary],
      repoRoot,
      {},
      true,
    );
    if (
      scaffoldFailure.code === 0 ||
      !scaffoldFailure.stderr.includes(invalidCase.expected) ||
      (await stat(invalidTarget).catch(() => null))
    ) {
      throw new Error(`Scaffolder accepted invalid acceptance routing: ${invalidCase.id}`);
    }

    await writeFile(resolve(acceptanceTarget, "workflow.plan.json"), `${JSON.stringify(invalidPlan, null, 2)}\n`);
    const runtimeFailure = await runWorkflow(
      skillTarget,
      acceptanceTarget,
      ["--dry-run", "--json"],
      {},
      true,
    );
    if (runtimeFailure.code === 0 || !runtimeFailure.stderr.includes(invalidCase.expected)) {
      throw new Error(`Runtime accepted invalid acceptance routing: ${invalidCase.id}`);
    }
  }
  await writeFile(
    resolve(acceptanceTarget, "workflow.plan.json"),
    `${JSON.stringify(acceptanceDefinition, null, 2)}\n`,
  );

  // TF-IDF allocation controls are strict in the shared validator, not late runtime defaults.
  const tfidfDefinition = {
    name: "tfidf-contract",
    description: "Validate bounded deterministic retrieval before execution.",
    agents: {},
    stages: [
      {
        id: "retrieve",
        kind: "tfidf",
        query: "bounded retrieval",
        roots: ["evidence"],
        extensions: [".txt"],
        output: "run/ranked.json",
        limit: 10,
        maxFiles: 100,
        maxBytesPerFile: 4096,
      },
    ],
  };
  const tfidfValidPlan = resolve(temporaryRoot, "tfidf-valid-plan.json");
  const tfidfTarget = resolve(temporaryRoot, "tfidf-contract");
  await writeFile(tfidfValidPlan, `${JSON.stringify(tfidfDefinition, null, 2)}\n`);
  await run(process.execPath, [scaffoldScript, tfidfValidPlan, tfidfTarget], repoRoot);
  const coreInventory = await readdir(tfidfTarget, { withFileTypes: true });
  if (
    coreInventory.some((entry) => !entry.isFile()) ||
    coreInventory.map((entry) => entry.name).sort().join(",") !==
      "package.json,solve.mjs,tsconfig.json,workflow.plan.json,workflow.ts"
  ) {
    throw new Error("Core scaffold exposes an unexpected public root inventory.");
  }
  const generatedRuntimeSource = await readFile(resolve(tfidfTarget, "workflow.ts"), "utf8");
  const validatorPrefix = 'const planValidatorModuleUrl: string = "data:text/javascript;base64,';
  const validatorStart = generatedRuntimeSource.indexOf(validatorPrefix);
  const validatorEnd = validatorStart < 0
    ? -1
    : generatedRuntimeSource.indexOf('";', validatorStart + validatorPrefix.length);
  const embeddedValidator = validatorEnd < 0
    ? Buffer.alloc(0)
    : Buffer.from(
        generatedRuntimeSource.slice(validatorStart + validatorPrefix.length, validatorEnd),
        "base64",
      );
  const scaffoldSource = await readFile(scaffoldScript);
  if (!embeddedValidator.equals(scaffoldSource) || generatedRuntimeSource.includes("./workflow-plan.mjs")) {
    throw new Error("Generated runtime lost exact embedded-validator provenance.");
  }
  for (const [id, change] of [
    ["limit", (plan) => (plan.stages[0].limit = 1001)],
    ["files", (plan) => (plan.stages[0].maxFiles = 100001)],
    ["bytes", (plan) => (plan.stages[0].maxBytesPerFile = 1000001)],
    ["roots", (plan) => (plan.stages[0].roots = Array(33).fill("evidence"))],
    ["extension", (plan) => (plan.stages[0].extensions = ["txt"])],
    ["ambiguous-query", (plan) => (plan.stages[0].queryFile = "query.txt")],
  ]) {
    const invalidPlan = structuredClone(tfidfDefinition);
    change(invalidPlan);
    const planPath = resolve(temporaryRoot, `tfidf-invalid-${id}.json`);
    const target = resolve(temporaryRoot, `tfidf-invalid-${id}`);
    await writeFile(planPath, `${JSON.stringify(invalidPlan, null, 2)}\n`);
    const scaffoldFailure = await run(process.execPath, [scaffoldScript, planPath, target], repoRoot, {}, true);
    await writeFile(resolve(tfidfTarget, "workflow.plan.json"), `${JSON.stringify(invalidPlan, null, 2)}\n`);
    const runtimeFailure = await runWorkflow(skillTarget, tfidfTarget, ["--dry-run", "--json"], {}, true);
    if (
      scaffoldFailure.code === 0 ||
      runtimeFailure.code === 0 ||
      (await stat(target).catch(() => null)) ||
      (await stat(resolve(tfidfTarget, ".zx-workflow")).catch(() => null))
    ) {
      throw new Error(`TF-IDF cap failed shared pre-execution validation: ${id}`);
    }
  }
  await writeFile(resolve(tfidfTarget, "workflow.plan.json"), `${JSON.stringify(tfidfDefinition, null, 2)}\n`);

  // Runtime schema rejection happens before state creation and before even the first configured subprocess.
  const preflightDefinition = {
    name: "strict-preflight",
    description: "Reject malformed authority before execution.",
    agents: {},
    stages: [
      {
        id: "must-not-run",
        kind: "command",
        command: process.execPath,
        args: ["-e", "require('node:fs').writeFileSync('process-marker','ran')"],
      },
    ],
  };
  const preflightPlan = resolve(temporaryRoot, "strict-preflight-plan.json");
  const preflightTarget = resolve(temporaryRoot, "strict-preflight");
  await writeFile(preflightPlan, `${JSON.stringify(preflightDefinition, null, 2)}\n`);
  await run(process.execPath, [scaffoldScript, preflightPlan, preflightTarget], repoRoot);
  preflightDefinition.ambientFilesystem = true;
  await writeFile(resolve(preflightTarget, "workflow.plan.json"), `${JSON.stringify(preflightDefinition, null, 2)}\n`);
  const preflightFailure = await runWorkflow(
    skillTarget,
    preflightTarget,
    ["--problem", "never execute malformed authority"],
    { ZX_WORKFLOW_RUN_ID: "validation" },
    true,
  );
  if (
    preflightFailure.code === 0 ||
    (await stat(resolve(preflightTarget, "process-marker")).catch(() => null)) ||
    (await stat(resolve(preflightTarget, ".zx-workflow")).catch(() => null))
  ) {
    throw new Error("Malformed runtime authority created state or launched a process.");
  }

  // Criteria input links are rejected during the same state-free preflight, including hard links to outside bytes.
  const linkedInputDefinition = structuredClone(acceptanceDefinition);
  linkedInputDefinition.name = "linked-input-preflight";
  linkedInputDefinition.stages[0].output = "run/linked-input.txt";
  const linkedInputPlan = resolve(temporaryRoot, "linked-input-plan.json");
  const linkedInputTarget = resolve(temporaryRoot, "linked-input-preflight");
  const outsideInput = resolve(temporaryRoot, "outside-input.txt");
  await writeFile(linkedInputPlan, `${JSON.stringify(linkedInputDefinition, null, 2)}\n`);
  await run(
    process.execPath,
    [scaffoldScript, linkedInputPlan, linkedInputTarget, "--skill-library", skillLibrary],
    repoRoot,
  );
  await writeFile(outsideInput, "OUTSIDE-LINKED-INPUT\n");
  await link(outsideInput, resolve(linkedInputTarget, "producer-only.txt"));
  await writeFile(resolve(linkedInputTarget, "reviewer-only.txt"), "REVIEWER-DECLARED\n");
  const linkedInputFailure = await runWorkflow(
    skillTarget,
    linkedInputTarget,
    ["--problem", "reject linked context before state"],
    { ZX_WORKFLOW_RUN_ID: "validation" },
    true,
  );
  if (
    linkedInputFailure.code === 0 ||
    !linkedInputFailure.stderr.includes("Hard-linked file is not accepted") ||
    (await stat(resolve(linkedInputTarget, ".zx-workflow")).catch(() => null))
  ) {
    throw new Error("Hard-linked criteria input was not rejected before state creation.");
  }

  // Observe ordered fail-fast execution independently of receipts: the third leaf must never run or log.
  const gateObserverScript =
    "require('node:fs').appendFileSync(process.argv[1],process.argv[2]);process.exit(Number(process.argv[3]))";
  const failFastDefinition = {
    name: "offline-fail-fast",
    description: "Stop a recursive all gate at its first rejecting leaf.",
    criteria: [
      { id: "x", description: "The one-character criterion and explicit leaf route pass." },
      { id: "rejecting-check", description: "The second executable leaf rejects." },
      { id: "skipped-check", description: "The final executable leaf must remain unevaluated." },
    ],
    agents: {},
    stages: [
      {
        id: "probe",
        kind: "command",
        command: process.execPath,
        args: ["-e", "process.exit(0)"],
        gate: {
          kind: "all",
          gates: [
            {
              id: "x",
              kind: "command",
              command: process.execPath,
              args: ["-e", gateObserverScript, "{runDir}/gate-order.txt", "first\n", "0"],
              covers: ["x"],
            },
            {
              kind: "all",
              gates: [
                {
                  kind: "command",
                  command: process.execPath,
                  args: ["-e", gateObserverScript, "{runDir}/gate-order.txt", "second\n", "7"],
                  covers: ["rejecting-check"],
                },
                {
                  kind: "command",
                  command: process.execPath,
                  args: ["-e", gateObserverScript, "{runDir}/gate-order.txt", "third\n", "0"],
                  covers: ["skipped-check"],
                },
              ],
            },
          ],
        },
      },
    ],
  };
  const failFastPlan = resolve(temporaryRoot, "fail-fast-plan.json");
  const failFastTarget = resolve(temporaryRoot, "fail-fast");
  await writeFile(failFastPlan, `${JSON.stringify(failFastDefinition, null, 2)}\n`);
  await run(process.execPath, [scaffoldScript, failFastPlan, failFastTarget], repoRoot);
  const failFastInspection = JSON.parse(
    (await runWorkflow(skillTarget, failFastTarget, ["--dry-run", "--json"])).stdout,
  );
  if (
    failFastInspection.acceptanceMatrix.map((criterion) => criterion.routes[0].routeId).join(",") !==
    "x,probe.gate.1.0,probe.gate.1.1"
  ) {
    throw new Error("Nested all dry-run routes do not match executable route IDs.");
  }
  const failFastRun = await runWorkflow(
    skillTarget,
    failFastTarget,
    ["--problem", "prove ordered fail-fast evaluation"],
    { ZX_WORKFLOW_RUN_ID: "g008-fail-fast" },
    true,
  );
  const failFastRunDir = resolve(
    failFastTarget,
    ".zx-workflow",
    failFastDefinition.name,
    "g008-fail-fast",
  );
  const failFastOrder = await readFile(resolve(failFastRunDir, "gate-order.txt"), "utf8");
  const failFastEvents = (await readFile(resolve(failFastRunDir, "events.jsonl"), "utf8"))
    .trim()
    .split(/\r?\n/)
    .map((line) => JSON.parse(line));
  const failFastGateEvents = failFastEvents.filter((event) => event.event === "gate_completed");
  if (
    failFastRun.code === 0 ||
    failFastOrder !== "first\nsecond\n" ||
    failFastGateEvents.length !== 2 ||
    failFastGateEvents.map((event) => `${event.route}:${event.result}`).join(",") !==
      "x:passed,probe.gate.1.0:failed" ||
    failFastEvents.some((event) => event.route === "probe.gate.1.1")
  ) {
    throw new Error("Recursive all did not execute and record leaves in ordered fail-fast form.");
  }

  const deepFailDefinition = {
    name: "deep-agent-fail-fast",
    description: "Retry producers while suppressing later gates, reviewers, and promotion after rejection.",
    criteria: [
      { id: "first-rejects", description: "The first nested leaf rejects the candidate." },
      { id: "later-skipped", description: "The later executable leaf remains unevaluated." },
      { id: "review-skipped", description: "Semantic review remains suppressed after deterministic rejection." },
    ],
    budgets: { maxAgentCalls: 2, maxWallTimeMs: 60_000 },
    agents: {
      producer: {
        provider: "fixture-process",
        command: process.execPath,
        args: [
          "-e",
          "require('node:fs').appendFileSync('producer-calls','x');process.stdout.write('REJECT')",
        ],
        promptMode: "stdin",
      },
      reviewer: {
        provider: "fixture-process",
        command: process.execPath,
        args: [
          "-e",
          "require('node:fs').writeFileSync('reviewer-marker','ran');process.stdout.write(JSON.stringify({passed:true,feedback:'ok'}))",
        ],
        promptMode: "stdin",
      },
    },
    stages: [
      {
        id: "solve",
        kind: "agent",
        agent: "producer",
        prompt: "Exercise bounded rejection.",
        inputs: [],
        maxContextBytes: 8_192,
        output: "run/never-promoted.txt",
        attempts: 2,
        models: { fast: "local-fast", strong: "local-strong" },
        gate: {
          kind: "all",
          gates: [
            {
              kind: "all",
              gates: [
                { kind: "contains", values: ["APPROVED"], covers: ["first-rejects"] },
                {
                  kind: "command",
                  command: process.execPath,
                  args: ["-e", "require('node:fs').writeFileSync('later-marker','ran')"],
                  covers: ["later-skipped"],
                },
              ],
            },
          ],
        },
        reviewers: [
          {
            id: "review",
            agent: "reviewer",
            model: "local-review",
            prompt: "This reviewer must remain suppressed.",
            inputs: [],
            inheritProducerInputs: false,
            maxContextBytes: 8_192,
            covers: ["review-skipped"],
          },
        ],
      },
    ],
  };
  const deepFailPlan = resolve(temporaryRoot, "deep-agent-fail-fast-plan.json");
  const deepFailTarget = resolve(temporaryRoot, "deep-agent-fail-fast");
  await writeFile(deepFailPlan, `${JSON.stringify(deepFailDefinition, null, 2)}\n`);
  await run(process.execPath, [scaffoldScript, deepFailPlan, deepFailTarget], repoRoot);
  const deepFailRun = await runWorkflow(
    skillTarget,
    deepFailTarget,
    ["--problem", "suppress every later authority path"],
    { ZX_WORKFLOW_RUN_ID: "validation" },
    true,
  );
  if (
    deepFailRun.code === 0 ||
    (await readFile(resolve(deepFailTarget, "producer-calls"), "utf8")) !== "xx" ||
    (await stat(resolve(deepFailTarget, "later-marker")).catch(() => null)) ||
    (await stat(resolve(deepFailTarget, "reviewer-marker")).catch(() => null)) ||
    (await stat(resolve(deepFailTarget, "run", "never-promoted.txt")).catch(() => null))
  ) {
    throw new Error("Deep fail-fast leaked into a later gate, reviewer, or promotion path.");
  }

  // G004 allowed empty deterministic predicates; legacy plans retain that exact passing behavior.
  const legacyEmptyPlan = resolve(temporaryRoot, "legacy-empty-gates-plan.json");
  const legacyEmptyTarget = resolve(temporaryRoot, "legacy-empty-gates");
  await writeFile(
    legacyEmptyPlan,
    `${JSON.stringify(
      {
        name: "legacy-empty-gates",
        description: "Preserve empty contains and JSON predicates outside criteria mode.",
        agents: {},
        stages: [
          {
            id: "empty-contains",
            kind: "command",
            command: process.execPath,
            args: ["-e", "process.stdout.write('legacy')"],
            stdout: "run/legacy.txt",
            gate: { kind: "contains", values: [] },
          },
          {
            id: "empty-json",
            kind: "command",
            command: process.execPath,
            args: ["-e", "process.stdout.write('{}')"],
            stdout: "run/legacy.json",
            gate: { kind: "json", required: [] },
          },
          {
            id: "empty-json-key",
            kind: "command",
            command: process.execPath,
            args: ["-e", "process.stdout.write(JSON.stringify({'':true}))"],
            stdout: "run/legacy-empty-key.json",
            gate: { kind: "json", required: [""] },
          },
        ],
      },
      null,
      2,
    )}\n`,
  );
  await run(process.execPath, [scaffoldScript, legacyEmptyPlan, legacyEmptyTarget], repoRoot);
  const legacyEmptyRun = await runWorkflow(
    skillTarget,
    legacyEmptyTarget,
    ["--problem", "preserve the legacy empty gate contract"],
    { ZX_WORKFLOW_RUN_ID: "g008-legacy-empty" },
  );
  if (!legacyEmptyRun.stdout.includes("Workflow passed: legacy-empty-gates")) {
    throw new Error("Legacy empty contains or JSON gate no longer passes.");
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
  ]) {
    if (!retryEvents.includes(required)) {
      throw new Error(`Runtime orchestration evidence is missing: ${required}`);
    }
  }
  if (retryEvents.includes("fixture-secret")) {
    throw new Error("Run log contains an unredacted credential.");
  }
  if (
    retryEvents.includes("token=[REDACTED]") ||
    !retryEvents.includes('"failure":{"kind":"rejected","sha256":"sha256:')
  ) {
    throw new Error("Persistent retry evidence is not typed and content-free.");
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
          argument: {
            provider: "node-argument",
            command: process.execPath,
            args: ["-e", "process.stdout.write(process.argv[1])", "{prompt}"],
            promptMode: "argument",
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
          {
            id: "argument",
            kind: "agent",
            agent: "argument",
            prompt: "Preserve placeholder-like problem bytes in one argv value.",
            output: "run/argument.txt",
            models: { fast: "local-fast", strong: "local-strong" },
            gate: { kind: "contains", values: ["file supplied problem {root} {model}"] },
          },
        ],
      },
      null,
      2,
    )}\n`,
  );
  const processTarget = resolve(temporaryRoot, "agent-process");
  await run(process.execPath, [scaffoldScript, processPlan, processTarget], repoRoot);
  await writeFile(resolve(processTarget, "problem.md"), "file supplied problem {root} {model}\n");
  await runWorkflow(
    skillTarget,
    processTarget,
    ["--problem-file", "problem.md"],
    { ZX_WORKFLOW_RUN_ID: "validation" },
  );
  const argumentTransportOutput = await readFile(resolve(processTarget, "run", "argument.txt"), "utf8");
  if (
    !argumentTransportOutput.includes("{root} {model}") ||
    argumentTransportOutput.match(/file supplied problem/g)?.length !== 1
  ) {
    throw new Error("Argument prompt transport cascaded replacements inside dynamic problem text.");
  }
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
      id: "type",
      boundary: "after:command:mutate",
      plan: {
        name: "control-type",
        description: "Reject a command that replaces a protected regular file with a directory.",
        controls: fixtureControls,
        agents: {},
        stages: [
          {
            id: "mutate",
            kind: "command",
            command: process.execPath,
            args: [
              "-e",
              `${changeMutableScript};const fs=require('node:fs');fs.rmSync('${fixtureControlPath}');fs.mkdirSync('${fixtureControlPath}')`,
            ],
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
    if (["producer", "reviewer"].includes(tamperCase.id)) {
      const callPath = resolve(target, ".zx-workflow", tamperCase.plan.name, "validation", "model-calls.jsonl");
      const callReceipts = (await readFile(callPath, "utf8"))
        .trim()
        .split(/\r?\n/)
        .map((line) => JSON.parse(line));
      const expectedCalls = tamperCase.id === "producer" ? 1 : 2;
      if (
        callReceipts.length !== expectedCalls ||
        callReceipts.at(-1).termination.postcondition !== "failed" ||
        callReceipts.some((receipt, index) => receipt.sequence !== index + 1) ||
        !verifyLedgerForTest(callReceipts)
      ) {
        throw new Error(`A completed model call escaped terminal accounting after control tamper: ${tamperCase.id}`);
      }
    }
    controlTamperTargets.push(target);
  }

  // Replacing a control parent with a link is terminal, restored locally, and never mutates the link target.
  const parentBoundaryOutside = resolve(temporaryRoot, "control-parent-outside");
  await mkdir(parentBoundaryOutside);
  await writeFile(resolve(parentBoundaryOutside, "outside-marker.txt"), "OUTSIDE-PARENT\n");
  const parentBoundaryDefinition = structuredClone(controlContractPlan);
  parentBoundaryDefinition.name = "control-parent-boundary";
  parentBoundaryDefinition.stages[0].args = [
    "-e",
    "const fs=require('node:fs');fs.rmSync('.policy',{recursive:true});fs.symlinkSync(process.argv[1],'.policy',process.platform==='win32'?'junction':'dir')",
    parentBoundaryOutside,
  ];
  const parentBoundaryPlan = resolve(temporaryRoot, "control-parent-boundary-plan.json");
  const parentBoundaryTarget = resolve(temporaryRoot, "control-parent-boundary");
  await writeFile(parentBoundaryPlan, `${JSON.stringify(parentBoundaryDefinition, null, 2)}\n`);
  await run(process.execPath, [scaffoldScript, parentBoundaryPlan, parentBoundaryTarget], repoRoot);
  const parentBoundaryFailure = await runWorkflow(
    skillTarget,
    parentBoundaryTarget,
    ["--problem", "restore a linked control parent"],
    { ZX_WORKFLOW_RUN_ID: "validation" },
    true,
  );
  const restoredParent = await lstat(resolve(parentBoundaryTarget, ".policy"));
  const parentBoundaryEvents = await readFile(
    resolve(parentBoundaryTarget, ".zx-workflow", parentBoundaryDefinition.name, "validation", "events.jsonl"),
    "utf8",
  );
  if (
    parentBoundaryFailure.code === 0 ||
    !restoredParent.isDirectory() ||
    restoredParent.isSymbolicLink() ||
    (await readFile(resolve(parentBoundaryTarget, fixtureControlPath), "utf8")) !== fixtureControlText ||
    (await readFile(resolve(parentBoundaryOutside, "outside-marker.txt"), "utf8")) !== "OUTSIDE-PARENT\n" ||
    !parentBoundaryEvents.includes('"status":"symbolic-link"') ||
    !parentBoundaryEvents.includes('"restored":true')
  ) {
    throw new Error("Protected-control parent link escaped restoration or changed its outside target.");
  }
  controlTamperTargets.push(parentBoundaryTarget);

  // A tool-capable criteria reviewer receives only its immutable problem, candidate, declared inputs, and projection.
  const isolationPlan = resolve(temporaryRoot, "reviewer-isolation-plan.json");
  const isolationTarget = resolve(temporaryRoot, "reviewer-isolation");
  const isolationDefinition = {
    name: "reviewer-isolation",
    description: "Run an acceptance reviewer from an explicit filesystem and environment projection.",
    criteria: [
      { id: "candidate", description: "The producer emits an approved candidate." },
      { id: "isolated-review", description: "The reviewer sees only its declared review context." },
    ],
    budgets: { maxAgentCalls: 2, maxWallTimeMs: 60_000 },
    agents: {
      producer: {
        provider: "fixture-process",
        command: process.execPath,
        args: ["-e", "process.stdout.write('APPROVED')"],
        promptMode: "stdin",
      },
      reviewer: {
        provider: "fixture-process",
        command: process.execPath,
        args: [
          "-e",
          [
            "const fs=require('node:fs'),p=require('node:path');",
            "const cwd=process.cwd();",
            "const passed=process.env.PROJECTED_ROOT===cwd",
            "&&process.env.ZX_WORKFLOW_RUN_DIR===p.join(cwd,'.run')",
            "&&!process.env.ZX_AMBIENT_SECRET",
            "&&process.env.OPENAI_API_KEY==='DECLARED-AUTH-SENTINEL'",
            "&&fs.existsSync('reviewer-only.txt')",
            "&&!fs.existsSync('producer-only.txt')",
            "&&!fs.existsSync('workflow.plan.json')",
            "&&!fs.existsSync('workflow.skills.json')",
            "&&fs.readFileSync('.zx-reviewer-context/problem.txt','utf8')==='IMMUTABLE-REVIEW-PROBLEM'",
            "&&fs.readFileSync('.zx-reviewer-context/candidate.txt','utf8')==='APPROVED'",
            ";process.stdout.write(JSON.stringify({passed,feedback:passed?'ok':'projection leak',evidence:[]}))",
          ].join(""),
        ],
        promptMode: "stdin",
        env: { PROJECTED_ROOT: "{root}" },
        authEnv: ["OPENAI_API_KEY"],
      },
    },
    stages: [
      {
        id: "solve",
        kind: "agent",
        agent: "producer",
        prompt: "Produce the approved marker.",
        inputs: [{ path: "producer-only.txt", maxBytes: 128 }],
        maxContextBytes: 8_192,
        output: "run/isolation.txt",
        models: { fast: "local-fast", strong: "local-strong" },
        gate: { kind: "contains", values: ["APPROVED"], covers: ["candidate"] },
        reviewers: [
          {
            id: "isolation",
            agent: "reviewer",
            model: "local-review",
            prompt: "Review the immutable problem and candidate from the isolated projection.",
            inputs: [{ path: "reviewer-only.txt", maxBytes: 128 }],
            inheritProducerInputs: false,
            maxContextBytes: 8_192,
            covers: ["isolated-review"],
          },
        ],
      },
    ],
  };
  await writeFile(isolationPlan, `${JSON.stringify(isolationDefinition, null, 2)}\n`);
  await run(process.execPath, [scaffoldScript, isolationPlan, isolationTarget], repoRoot);
  await writeFile(resolve(isolationTarget, "producer-only.txt"), "PRODUCER-PRIVATE\n");
  await writeFile(resolve(isolationTarget, "reviewer-only.txt"), "REVIEWER-DECLARED\n");
  await runWorkflow(
    skillTarget,
    isolationTarget,
    ["--problem", "IMMUTABLE-REVIEW-PROBLEM"],
    {
      OPENAI_API_KEY: "DECLARED-AUTH-SENTINEL",
      ZX_AMBIENT_SECRET: "MUST-NOT-CROSS",
      ZX_WORKFLOW_RUN_ID: "validation",
    },
  );
  const isolationRun = resolve(isolationTarget, ".zx-workflow", isolationDefinition.name, "validation");
  const isolationReceipts = (await readFile(resolve(isolationRun, "model-calls.jsonl"), "utf8"))
    .trim()
    .split(/\r?\n/)
    .map((line) => JSON.parse(line));
  const isolationEvidence = await readFile(resolve(isolationRun, "events.jsonl"), "utf8");
  if (
    isolationReceipts.length !== 2 ||
    isolationReceipts[1].context.isolatedProjection !== true ||
    isolationReceipts[1].context.inputs.map((input) => input.path).join(",") !== "reviewer-only.txt" ||
    isolationReceipts[1].context.projectionArtifacts.problem !== ".zx-reviewer-context/problem.txt" ||
    isolationReceipts[1].context.projectionArtifacts.candidate !== ".zx-reviewer-context/candidate.txt" ||
    isolationReceipts[1].auth.mode !== "api-key-env" ||
    isolationEvidence.includes("IMMUTABLE-REVIEW-PROBLEM") ||
    isolationEvidence.includes("MUST-NOT-CROSS") ||
    isolationEvidence.includes("DECLARED-AUTH-SENTINEL")
  ) {
    throw new Error("Criteria reviewer projection or content-free evidence boundary is incomplete.");
  }

  // Exact runDir/file declarations merge bounded per-call deltas without publishing a broad runDir view.
  const artifactSinkDefinition = structuredClone(isolationDefinition);
  artifactSinkDefinition.name = "declared-artifact-sinks";
  artifactSinkDefinition.budgets.maxAgentCalls = 3;
  artifactSinkDefinition.agents.producer.args = [
    "-e",
    [
      "const fs=require('node:fs'),p=require('node:path');",
      "const sink=process.env.ZX_ARTIFACT_CALLS,model=process.env.ZX_ARTIFACT_MODEL;",
      "fs.mkdirSync(p.dirname(sink),{recursive:true});",
      "fs.appendFileSync(sink,JSON.stringify({role:'producer',model})+'\\n');",
      "fs.writeFileSync(p.join(process.env.ZX_RUN_VIEW,'view-only.txt'),'private');",
      "process.stdout.write(model==='sink-strong'?'APPROVED':'REJECTED');",
    ].join(""),
  ];
  artifactSinkDefinition.agents.producer.env = {
    ZX_ARTIFACT_CALLS: "{runDir}/external-calls.jsonl",
    ZX_ARTIFACT_MODEL: "{model}",
    ZX_RUN_VIEW: "{runDir}",
  };
  artifactSinkDefinition.agents.reviewer.args = [
    "-e",
    [
      "const fs=require('node:fs'),p=require('node:path');",
      "const sink=process.env.ZX_ARTIFACT_CALLS;fs.mkdirSync(p.dirname(sink),{recursive:true});",
      "fs.appendFileSync(sink,JSON.stringify({role:'reviewer',model:process.env.ZX_ARTIFACT_MODEL})+'\\n');",
      "fs.writeFileSync(p.join(process.env.ZX_RUN_VIEW,'view-only.txt'),'private');",
      "process.stdout.write(JSON.stringify({passed:true,feedback:'ok',evidence:[]}));",
    ].join(""),
  ];
  artifactSinkDefinition.agents.reviewer.env = {
    ZX_ARTIFACT_CALLS: "{runDir}/external-calls.jsonl",
    ZX_ARTIFACT_MODEL: "{model}",
    ZX_RUN_VIEW: "{runDir}",
  };
  artifactSinkDefinition.stages[0].attempts = 2;
  artifactSinkDefinition.stages[0].models = { fast: "sink-fast", strong: "sink-strong" };
  artifactSinkDefinition.stages[0].reviewers[0].model = "sink-review";
  artifactSinkDefinition.stages[0].output = "run/artifact-sink.txt";
  artifactSinkDefinition.stages[0].gate = {
    kind: "all",
    gates: [
      artifactSinkDefinition.stages[0].gate,
      {
        id: "public-gate-receipt",
        kind: "command",
        command: process.execPath,
        args: [
          "-e",
          "require('node:fs').appendFileSync(require('node:path').join(process.argv[1],'gate-receipts.jsonl'),'public\\n')",
          "{runDir}",
        ],
        covers: ["candidate"],
      },
    ],
  };
  const artifactSinkPlan = resolve(temporaryRoot, "declared-artifact-sinks-plan.json");
  const artifactSinkTarget = resolve(temporaryRoot, "declared-artifact-sinks");
  await writeFile(artifactSinkPlan, `${JSON.stringify(artifactSinkDefinition, null, 2)}\n`);
  await run(process.execPath, [scaffoldScript, artifactSinkPlan, artifactSinkTarget], repoRoot);
  await writeFile(resolve(artifactSinkTarget, "producer-only.txt"), "PRODUCER-SINK\n");
  await writeFile(resolve(artifactSinkTarget, "reviewer-only.txt"), "REVIEWER-SINK\n");
  const artifactSinkInspection = JSON.parse(
    (await runWorkflow(skillTarget, artifactSinkTarget, ["--dry-run", "--json"])).stdout,
  );
  if (
    artifactSinkInspection.schemaVersion !== 2 ||
    artifactSinkInspection.contexts.find((context) => context.id === "solve")?.artifactSinks?.[0]?.path !==
      "external-calls.jsonl"
  ) {
    throw new Error("Schema-2 inspection omitted a declared artifact sink.");
  }
  await runWorkflow(
    skillTarget,
    artifactSinkTarget,
    ["--problem", "publish only explicitly declared artifact deltas"],
    { ZX_WORKFLOW_RUN_ID: "validation" },
  );
  const artifactSinkRun = resolve(
    artifactSinkTarget,
    ".zx-workflow",
    artifactSinkDefinition.name,
    "validation",
  );
  const artifactSinkLines = (await readFile(resolve(artifactSinkRun, "external-calls.jsonl"), "utf8"))
    .trim()
    .split(/\r?\n/)
    .map((line) => JSON.parse(line));
  const artifactSinkReceipts = (await readFile(resolve(artifactSinkRun, "model-calls.jsonl"), "utf8"))
    .trim()
    .split(/\r?\n/)
    .map((line) => JSON.parse(line));
  if (
    artifactSinkLines.map(({ role, model }) => `${role}:${model}`).join(",") !==
      "producer:sink-fast,producer:sink-strong,reviewer:sink-review" ||
    artifactSinkReceipts.length !== 3 ||
    artifactSinkReceipts.some(
      (receipt) =>
        receipt.context.artifactSinks?.[0]?.path !== "external-calls.jsonl" ||
        receipt.artifactSinks.status !== "passed" ||
        receipt.artifactSinks.published?.[0]?.bytes <= 0,
    ) ||
    (await readFile(resolve(artifactSinkRun, "gate-receipts.jsonl"), "utf8")) !== "public\n" ||
    (await stat(resolve(artifactSinkRun, "view-only.txt")).catch(() => null))
  ) {
    throw new Error("Declared artifact sinks lost call order, duplicated bytes, or published an undeclared runDir view.");
  }

  // Oversized sink output is terminal after one accountable call and is never copied to the public run root.
  const oversizedSinkDefinition = structuredClone(artifactSinkDefinition);
  oversizedSinkDefinition.name = "oversized-artifact-sink";
  oversizedSinkDefinition.criteria = [{ id: "candidate", description: "The producer emits an approved candidate." }];
  oversizedSinkDefinition.budgets.maxAgentCalls = 2;
  oversizedSinkDefinition.agents.producer.args = [
    "-e",
    "require('node:fs').writeFileSync(process.env.ZX_ARTIFACT_CALLS,Buffer.alloc(1000001));process.stdout.write('APPROVED')",
  ];
  oversizedSinkDefinition.stages[0].reviewers = [];
  oversizedSinkDefinition.stages[0].gate = {
    kind: "contains",
    values: ["APPROVED"],
    covers: ["candidate"],
  };
  oversizedSinkDefinition.stages[0].output = "run/oversized-sink.txt";
  const oversizedSinkPlan = resolve(temporaryRoot, "oversized-artifact-sink-plan.json");
  const oversizedSinkTarget = resolve(temporaryRoot, "oversized-artifact-sink");
  await writeFile(oversizedSinkPlan, `${JSON.stringify(oversizedSinkDefinition, null, 2)}\n`);
  await run(process.execPath, [scaffoldScript, oversizedSinkPlan, oversizedSinkTarget], repoRoot);
  await writeFile(resolve(oversizedSinkTarget, "producer-only.txt"), "PRODUCER-SINK\n");
  const oversizedSinkFailure = await runWorkflow(
    skillTarget,
    oversizedSinkTarget,
    ["--problem", "reject oversized artifact output"],
    { ZX_WORKFLOW_RUN_ID: "validation" },
    true,
  );
  const oversizedSinkRun = resolve(
    oversizedSinkTarget,
    ".zx-workflow",
    oversizedSinkDefinition.name,
    "validation",
  );
  const oversizedSinkReceipts = (await readFile(resolve(oversizedSinkRun, "model-calls.jsonl"), "utf8"))
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const oversizedSinkEvents = await readFile(resolve(oversizedSinkRun, "events.jsonl"), "utf8");
  if (
    oversizedSinkFailure.code === 0 ||
    oversizedSinkReceipts.length !== 1 ||
    oversizedSinkReceipts[0].artifactSinks.status !== "failed" ||
    oversizedSinkEvents.match(/\"event\":\"model_selected\"/g)?.length !== 1 ||
    (await stat(resolve(oversizedSinkRun, "external-calls.jsonl")).catch(() => null))
  ) {
    throw new Error("Oversized artifact sink output was published, retried, or left unaccounted.");
  }

  // Legacy reviewers keep their inherited producer inputs, and live receipts report that exact effective context.
  const legacyReceiptDefinition = structuredClone(isolationDefinition);
  legacyReceiptDefinition.name = "legacy-live-receipts";
  delete legacyReceiptDefinition.criteria;
  delete legacyReceiptDefinition.budgets;
  delete legacyReceiptDefinition.stages[0].maxContextBytes;
  delete legacyReceiptDefinition.stages[0].gate.covers;
  delete legacyReceiptDefinition.stages[0].reviewers[0].covers;
  delete legacyReceiptDefinition.stages[0].reviewers[0].inheritProducerInputs;
  delete legacyReceiptDefinition.stages[0].reviewers[0].maxContextBytes;
  legacyReceiptDefinition.stages[0].output = "run/legacy.txt";
  legacyReceiptDefinition.agents.reviewer.env = {};
  legacyReceiptDefinition.agents.reviewer.args = [
    "-e",
    "process.stdout.write(JSON.stringify({passed:true,feedback:'ok',evidence:[]}))",
  ];
  const legacyReceiptPlan = resolve(temporaryRoot, "legacy-live-receipts-plan.json");
  const legacyReceiptTarget = resolve(temporaryRoot, "legacy-live-receipts");
  await writeFile(legacyReceiptPlan, `${JSON.stringify(legacyReceiptDefinition, null, 2)}\n`);
  await run(process.execPath, [scaffoldScript, legacyReceiptPlan, legacyReceiptTarget], repoRoot);
  await writeFile(resolve(legacyReceiptTarget, "producer-only.txt"), "PRODUCER-LEGACY\n");
  await writeFile(resolve(legacyReceiptTarget, "reviewer-only.txt"), "REVIEWER-LEGACY\n");
  await runWorkflow(
    skillTarget,
    legacyReceiptTarget,
    ["--problem", "preserve legacy review context"],
    { ZX_WORKFLOW_RUN_ID: "validation" },
  );
  const legacyReceipts = (await readFile(
    resolve(legacyReceiptTarget, ".zx-workflow", legacyReceiptDefinition.name, "validation", "model-calls.jsonl"),
    "utf8",
  ))
    .trim()
    .split(/\r?\n/)
    .map((line) => JSON.parse(line));
  if (
    legacyReceipts.length !== 2 ||
    legacyReceipts[1].context.inheritProducerInputs !== true ||
    legacyReceipts[1].context.inputs.map((input) => input.path).join(",") !==
      "producer-only.txt,reviewer-only.txt"
  ) {
    throw new Error("Legacy live reviewer receipt omitted inherited producer inputs.");
  }

  // Atomic promotion keeps a prior regular output visible until commit and rejects link-based substitution.
  const promotionDefinition = structuredClone(legacyReceiptDefinition);
  promotionDefinition.name = "exclusive-promotion";
  promotionDefinition.stages[0].inputs = [];
  promotionDefinition.stages[0].reviewers = [];
  promotionDefinition.stages[0].output = "run/result.txt";
  const promotionPlan = resolve(temporaryRoot, "exclusive-promotion-plan.json");
  const promotionTarget = resolve(temporaryRoot, "exclusive-promotion");
  await writeFile(promotionPlan, `${JSON.stringify(promotionDefinition, null, 2)}\n`);
  await run(process.execPath, [scaffoldScript, promotionPlan, promotionTarget], repoRoot);
  await mkdir(resolve(promotionTarget, "run"));
  await writeFile(resolve(promotionTarget, "run", "result.txt"), "PRIOR-OUTPUT\n");
  const priorOutputReplacement = await runWorkflow(
    skillTarget,
    promotionTarget,
    ["--problem", "preserve the prior output"],
    { ZX_WORKFLOW_RUN_ID: "prior" },
    true,
  );
  if (
    priorOutputReplacement.code !== 0 ||
    (await readFile(resolve(promotionTarget, "run", "result.txt"), "utf8")) !== "APPROVED"
  ) {
    throw new Error("Atomic promotion did not replace a prior regular output at commit.");
  }
  const promotionAttackTargets = [];
  if (process.platform !== "win32") {
    const linkedOutputTarget = resolve(temporaryRoot, "linked-output");
    const linkedOutside = resolve(temporaryRoot, "linked-outside.txt");
    await run(process.execPath, [scaffoldScript, promotionPlan, linkedOutputTarget], repoRoot);
    await mkdir(resolve(linkedOutputTarget, "run"));
    await writeFile(linkedOutside, "OUTSIDE\n");
    await symlink(linkedOutside, resolve(linkedOutputTarget, "run", "result.txt"));
    const linkedFailure = await runWorkflow(
      skillTarget,
      linkedOutputTarget,
      ["--problem", "reject a linked output"],
      { ZX_WORKFLOW_RUN_ID: "linked" },
      true,
    );
    if (linkedFailure.code === 0 || (await readFile(linkedOutside, "utf8")) !== "OUTSIDE\n") {
      throw new Error("Promotion followed or replaced a symbolic-link target.");
    }
    promotionAttackTargets.push(linkedOutputTarget);

    const linkedParentTarget = resolve(temporaryRoot, "linked-parent-output");
    const linkedParentOutside = resolve(temporaryRoot, "linked-parent-outside");
    await run(process.execPath, [scaffoldScript, promotionPlan, linkedParentTarget], repoRoot);
    await mkdir(linkedParentOutside);
    await symlink(linkedParentOutside, resolve(linkedParentTarget, "run"), "dir");
    const linkedParentFailure = await runWorkflow(
      skillTarget,
      linkedParentTarget,
      ["--problem", "reject a linked promotion parent"],
      { ZX_WORKFLOW_RUN_ID: "linked-parent" },
      true,
    );
    if (
      linkedParentFailure.code === 0 ||
      (await stat(resolve(linkedParentOutside, "result.txt")).catch(() => null))
    ) {
      throw new Error("Promotion followed a symbolic-link parent outside the workflow root.");
    }
    promotionAttackTargets.push(linkedParentTarget);
  }

  // A subprocess can forge public-looking files, but the next receipt republishes the private hash chain.
  const forgeryDefinition = {
    name: "ledger-forgery",
    description: "Keep rollback and evidence authority outside subprocess-visible run state.",
    agents: {},
    stages: [
      {
        id: "forge",
        kind: "command",
        command: process.execPath,
        args: [
          "-e",
          "const fs=require('node:fs'),p=require('node:path');const r=process.argv[1],f='protected.txt';if(process.env.ZX_WORKFLOW_ATTEMPT==='1')fs.writeFileSync(f,'CHANGED');else fs.writeFileSync('restore-observed.txt',fs.readFileSync(f));fs.writeFileSync(p.join(r,'..','events.jsonl'),'FORGED\\n');fs.mkdirSync(p.join(r,'..','checkpoints'),{recursive:true});fs.writeFileSync(p.join(r,'..','checkpoints','fake'),'FORGED')",
          "{runDir}",
        ],
        attempts: 2,
        mutates: ["protected.txt"],
        gate: { kind: "contains", path: "protected.txt", values: ["ORIGINAL"] },
      },
    ],
  };
  const forgeryPlan = resolve(temporaryRoot, "ledger-forgery-plan.json");
  const forgeryTarget = resolve(temporaryRoot, "ledger-forgery");
  await writeFile(forgeryPlan, `${JSON.stringify(forgeryDefinition, null, 2)}\n`);
  await run(process.execPath, [scaffoldScript, forgeryPlan, forgeryTarget], repoRoot);
  await writeFile(resolve(forgeryTarget, "protected.txt"), "ORIGINAL");
  await runWorkflow(
    skillTarget,
    forgeryTarget,
    ["--problem", "reject forged authority"],
    { ZX_WORKFLOW_RUN_ID: "validation" },
  );
  const forgeryEvents = (await readFile(
    resolve(forgeryTarget, ".zx-workflow", forgeryDefinition.name, "validation", "events.jsonl"),
    "utf8",
  ))
    .trim()
    .split(/\r?\n/)
    .map((line) => JSON.parse(line));
  if (
    !verifyLedgerForTest(forgeryEvents) ||
    JSON.stringify(forgeryEvents).includes("FORGED") ||
    (await readFile(resolve(forgeryTarget, "protected.txt"), "utf8")) !== "ORIGINAL" ||
    (await readFile(resolve(forgeryTarget, "restore-observed.txt"), "utf8")) !== "ORIGINAL"
  ) {
    throw new Error("Public evidence forgery displaced the private authoritative ledger.");
  }

  // Failure to publish a completed call's private receipt is terminal and cannot consume a hidden retry.
  const ledgerFailureDefinition = {
    name: "terminal-ledger-failure",
    description: "Stop after a completed call when its public receipt cannot be published.",
    agents: {
      producer: {
        provider: "fixture-process",
        command: process.execPath,
        args: [
          "-e",
          "const fs=require('node:fs'),p=require('node:path');fs.appendFileSync('call-marker','x');fs.mkdirSync(p.join(process.env.ZX_WORKFLOW_RUN_DIR,'..','model-calls.jsonl'));process.stdout.write('APPROVED')",
        ],
        promptMode: "stdin",
      },
    },
    stages: [
      {
        id: "solve",
        kind: "agent",
        agent: "producer",
        prompt: "Produce one candidate.",
        output: "run/result.txt",
        attempts: 2,
        models: { fast: "local-fast", strong: "local-strong" },
        gate: { kind: "contains", values: ["APPROVED"] },
      },
    ],
  };
  const ledgerFailurePlan = resolve(temporaryRoot, "terminal-ledger-failure-plan.json");
  const ledgerFailureTarget = resolve(temporaryRoot, "terminal-ledger-failure");
  await writeFile(ledgerFailurePlan, `${JSON.stringify(ledgerFailureDefinition, null, 2)}\n`);
  await run(process.execPath, [scaffoldScript, ledgerFailurePlan, ledgerFailureTarget], repoRoot);
  const ledgerFailure = await runWorkflow(
    skillTarget,
    ledgerFailureTarget,
    ["--problem", "make accounting loss terminal"],
    { ZX_WORKFLOW_RUN_ID: "validation" },
    true,
  );
  const ledgerFailureEvents = await readFile(
    resolve(ledgerFailureTarget, ".zx-workflow", ledgerFailureDefinition.name, "validation", "events.jsonl"),
    "utf8",
  );
  if (
    ledgerFailure.code === 0 ||
    !ledgerFailure.stderr.includes("Authoritative model-call accounting failed") ||
    (await readFile(resolve(ledgerFailureTarget, "call-marker"), "utf8")) !== "x" ||
    ledgerFailureEvents.match(/"event":"model_selected"/g)?.length !== 1 ||
    (await stat(resolve(ledgerFailureTarget, "run", "result.txt")).catch(() => null))
  ) {
    throw new Error("Model-call ledger publication loss retried or promoted a completed unaccounted call.");
  }

  // POSIX mode-only control drift is detected, restored, and terminal just like content or type drift.
  let modeTarget = null;
  if (process.platform !== "win32") {
    const modeDefinition = structuredClone(controlContractPlan);
    modeDefinition.name = "control-mode-drift";
    modeDefinition.stages[0].args = ["-e", `require('node:fs').chmodSync('${fixtureControlPath}',0o600)`];
    const modePlan = resolve(temporaryRoot, "control-mode-drift-plan.json");
    modeTarget = resolve(temporaryRoot, "control-mode-drift");
    await writeFile(modePlan, `${JSON.stringify(modeDefinition, null, 2)}\n`);
    await run(process.execPath, [scaffoldScript, modePlan, modeTarget], repoRoot);
    await prepareFixtureControls(modeTarget);
    await chmod(resolve(modeTarget, fixtureControlPath), 0o644);
    const modeFailure = await runWorkflow(
      skillTarget,
      modeTarget,
      ["--problem", "restore control mode"],
      { ZX_WORKFLOW_RUN_ID: "validation" },
      true,
      false,
    );
    const restoredMode = (await lstat(resolve(modeTarget, fixtureControlPath))).mode & 0o777;
    if (modeFailure.code === 0 || restoredMode !== 0o644) {
      throw new Error("Mode-only protected-control drift was accepted or not restored.");
    }

    const linkDefinition = structuredClone(controlContractPlan);
    linkDefinition.name = "control-link-drift";
    linkDefinition.stages[0].args = [
      "-e",
      `const fs=require('node:fs');fs.rmSync('${fixtureControlPath}');fs.symlinkSync(process.argv[1],'${fixtureControlPath}')`,
      "outside-control.txt",
    ];
    const linkPlan = resolve(temporaryRoot, "control-link-drift-plan.json");
    const linkTarget = resolve(temporaryRoot, "control-link-drift");
    await writeFile(linkPlan, `${JSON.stringify(linkDefinition, null, 2)}\n`);
    await run(process.execPath, [scaffoldScript, linkPlan, linkTarget], repoRoot);
    await writeFile(resolve(linkTarget, "outside-control.txt"), "OUTSIDE-CONTROL\n");
    const linkFailure = await runWorkflow(
      skillTarget,
      linkTarget,
      ["--problem", "restore a linked control"],
      { ZX_WORKFLOW_RUN_ID: "validation" },
      true,
    );
    const restoredControl = await lstat(resolve(linkTarget, fixtureControlPath));
    if (
      linkFailure.code === 0 ||
      restoredControl.isSymbolicLink() ||
      (await readFile(resolve(linkTarget, fixtureControlPath), "utf8")) !== fixtureControlText ||
      (await readFile(resolve(linkTarget, "outside-control.txt"), "utf8")) !== "OUTSIDE-CONTROL\n"
    ) {
      throw new Error("Symbolic-link protected-control drift escaped safe restoration.");
    }
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
    calls[0].schemaVersion !== 3 ||
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

  // Oversized JSONL framing requests immediate tree termination and still emits one terminal call receipt.
  const framingDefinition = structuredClone(telemetryDefinition);
  framingDefinition.name = "offline-jsonl-framing-cap";
  framingDefinition.agents.metered.args[0] = "oversized-jsonl.mjs";
  framingDefinition.agents.metered.timeoutMs = 10_000;
  framingDefinition.agents.metered.env = {};
  const framingPlan = resolve(temporaryRoot, "jsonl-framing-cap-plan.json");
  const framingTarget = resolve(temporaryRoot, "jsonl-framing-cap");
  const framingState = resolve(temporaryRoot, "jsonl-framing-cap-state");
  await writeFile(framingPlan, `${JSON.stringify(framingDefinition, null, 2)}\n`);
  await run(process.execPath, [scaffoldScript, framingPlan, framingTarget], repoRoot);
  await writeFile(
    resolve(framingTarget, "oversized-jsonl.mjs"),
    [
      "import { writeFileSync } from 'node:fs';",
      "const index=process.argv.indexOf('--output-last-message');",
      "writeFileSync(process.argv[index+1],JSON.stringify({ok:true}));",
      "process.stdout.write('x'.repeat(1_100_000));",
      "setInterval(()=>{},1000);",
    ].join("\n"),
  );
  const framingStartedAt = Date.now();
  const framingFailure = await runWorkflow(
    skillTarget,
    framingTarget,
    ["--problem", "bound malformed JSONL", "--state-root", framingState],
    { CODEX_HOME: ambientCodexHome, ZX_WORKFLOW_RUN_ID: "validation" },
    true,
  );
  const framingElapsed = Date.now() - framingStartedAt;
  const framingReceipts = (await readFile(
    resolve(framingState, framingDefinition.name, "validation", "model-calls.jsonl"),
    "utf8",
  ))
    .trim()
    .split(/\r?\n/)
    .map((line) => JSON.parse(line));
  if (
    framingFailure.code === 0 ||
    framingElapsed >= 4_000 ||
    framingReceipts.length !== 1 ||
    framingReceipts[0].stream.framingError !== "line-bytes" ||
    framingReceipts[0].termination.exitCode === 0
  ) {
    throw new Error("Malformed oversized JSONL was not killed and accounted within the hard deadline.");
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

  // Require an observed live descendant before each timeout, then verify its PID is absent after containment.
  const timeoutTreeTarget = await validateProcessTreeCleanup(skillTarget, 5);

  // A cooperative zero exit after the deadline is still a failed agent attempt with full rollback evidence.
  const gracefulTimeoutTarget = await validateGracefulAgentTimeout(skillTarget, 1);

  // Supported npm shims resolve to their JavaScript CLI without a shell and preserve argv boundaries.
  const npmShimDefinition = {
    name: "npm-shim-proof",
    description: "Resolve npm safely on every supported platform.",
    agents: {},
    stages: [{ id: "npm-version", kind: "command", command: "npm", args: ["--version"] }],
  };
  const npmShimPlan = resolve(temporaryRoot, "npm-shim-plan.json");
  const npmShimTarget = resolve(temporaryRoot, "npm-shim");
  await writeFile(npmShimPlan, `${JSON.stringify(npmShimDefinition, null, 2)}\n`);
  await run(process.execPath, [scaffoldScript, npmShimPlan, npmShimTarget], repoRoot);
  await runWorkflow(
    skillTarget,
    npmShimTarget,
    ["--problem", "resolve npm without a shell"],
    { ZX_WORKFLOW_RUN_ID: "validation" },
  );

  // Windows code-assistant npm shims resolve to known package entrypoints and preserve argv plus stdin EOF.
  let assistantShimTarget = null;
  if (process.platform === "win32") {
    const shimBin = resolve(temporaryRoot, "assistant-shims", "bin");
    const probeSource = [
      "import {writeFileSync} from 'node:fs';",
      "let stdin='';",
      "process.stdin.setEncoding('utf8');",
      "process.stdin.on('data',(chunk)=>stdin+=chunk);",
      "process.stdin.on('end',()=>writeFileSync(process.argv[2],JSON.stringify({args:process.argv.slice(3),stdin,ended:true})));",
    ].join("");
    for (const [name, packagePath] of [
      ["codex", "node_modules/@openai/codex/bin/codex.js"],
      ["pi", "node_modules/@earendil-works/pi-coding-agent/dist/cli.js"],
    ]) {
      const target = resolve(shimBin, ...packagePath.split("/"));
      await mkdir(resolve(target, ".."), { recursive: true });
      await writeFile(target, probeSource);
      await writeFile(resolve(shimBin, `${name}.cmd`), "@echo off\r\nexit /b 99\r\n");
    }
    const openCodeExecutable = resolve(shimBin, "node_modules", "opencode-ai", "bin", "opencode.exe");
    await mkdir(resolve(openCodeExecutable, ".."), { recursive: true });
    await cp(process.execPath, openCodeExecutable);
    await writeFile(resolve(shimBin, "opencode.cmd"), "@echo off\r\nexit /b 99\r\n");
    const nativeProbe = resolve(temporaryRoot, "assistant-shims", "native-probe.mjs");
    await writeFile(nativeProbe, probeSource);
    const assistantShimDefinition = {
      name: "assistant-shim-proof",
      description: "Resolve supported Windows code-assistant shims without command-shell parsing.",
      agents: {},
      stages: [
        ...["codex", "pi"].map((name) => ({
          id: `${name}-shim`,
          kind: "command",
          command: resolve(shimBin, `${name}.cmd`),
          args: [`${name}.json`, "one value", "literal&value"],
        })),
        {
          id: "opencode-shim",
          kind: "command",
          command: resolve(shimBin, "opencode.cmd"),
          args: [nativeProbe, "opencode.json", "one value", "literal&value"],
        },
      ],
    };
    const assistantShimPlan = resolve(temporaryRoot, "assistant-shim-plan.json");
    assistantShimTarget = resolve(temporaryRoot, "assistant-shim-proof");
    await writeFile(assistantShimPlan, `${JSON.stringify(assistantShimDefinition, null, 2)}\n`);
    await run(process.execPath, [scaffoldScript, assistantShimPlan, assistantShimTarget], repoRoot);
    await runWorkflow(
      skillTarget,
      assistantShimTarget,
      ["--problem", "preserve assistant shim argv and EOF"],
      { ZX_WORKFLOW_RUN_ID: "validation" },
    );
    for (const name of ["codex", "pi", "opencode"]) {
      const report = JSON.parse(await readFile(resolve(assistantShimTarget, `${name}.json`), "utf8"));
      if (report.args.join("|") !== "one value|literal&value" || report.stdin !== "" || report.ended !== true) {
        throw new Error(`Windows ${name} shim changed argv boundaries or failed to close stdin.`);
      }
    }
  }

  // POSIX process groups are cleaned even when the direct child exits after starting a lingering descendant.
  let descendantTarget = null;
  if (process.platform !== "win32") {
    const descendantDefinition = {
      name: "descendant-cleanup",
      description: "Prevent a successful direct child from orphaning work after its stage boundary.",
      agents: {},
      stages: [
        {
          id: "spawn-descendant",
          kind: "command",
          command: process.execPath,
          args: [
            "-e",
            "require('node:child_process').spawn(process.execPath,['-e',\"setTimeout(()=>require('node:fs').writeFileSync('late-marker','late'),800)\"],{stdio:'ignore'});process.exit(0)",
          ],
        },
      ],
    };
    const descendantPlan = resolve(temporaryRoot, "descendant-cleanup-plan.json");
    descendantTarget = resolve(temporaryRoot, "descendant-cleanup");
    await writeFile(descendantPlan, `${JSON.stringify(descendantDefinition, null, 2)}\n`);
    await run(process.execPath, [scaffoldScript, descendantPlan, descendantTarget], repoRoot);
    await runWorkflow(
      skillTarget,
      descendantTarget,
      ["--problem", "clean descendant processes"],
      { ZX_WORKFLOW_RUN_ID: "validation" },
    );
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 1_100));
    if (await stat(resolve(descendantTarget, "late-marker")).catch(() => null)) {
      throw new Error("A descendant survived the successful direct-child process boundary.");
    }
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
    acceptanceTarget,
    tfidfTarget,
    preflightTarget,
    linkedInputTarget,
    failFastTarget,
    deepFailTarget,
    legacyEmptyTarget,
    retryTarget,
    budgetTarget,
    processTarget,
    isolationTarget,
    artifactSinkTarget,
    oversizedSinkTarget,
    legacyReceiptTarget,
    promotionTarget,
    ...promotionAttackTargets,
    forgeryTarget,
    ledgerFailureTarget,
    modeTarget,
    telemetryTarget,
    framingTarget,
    accountingTarget,
    fixtureAccountingTarget,
    tokenLimitTarget,
    wallTarget,
    timeoutTreeTarget,
    gracefulTimeoutTarget,
    npmShimTarget,
    descendantTarget,
    ...controlTamperTargets,
    noControlTarget,
    ...problemTypeTargets,
    rollbackTarget,
  ].filter(Boolean)) {
    for (const file of await findFiles(target)) {
      const content = await readFile(file, "utf8").catch(() => "");
      if (content.includes("skills/zx-workflow-author") || content.includes(skillDir)) {
        throw new Error(`Generated runtime references the source skill: ${file}`);
      }
    }
  }

  // Re-run every substantive check from a bundle-only layout; skip only this recursive portability probe.
  if (process.env.ZX_WORKFLOW_SKIP_PORTABILITY_PROBE !== "1") {
    const standaloneSkill = resolve(
      temporaryRoot,
      "standalone-root",
      "packages",
      "zx-workflow-author",
    );
    await mkdir(resolve(standaloneSkill, ".."), { recursive: true });
    await cp(skillDir, standaloneSkill, { recursive: true });
    const standaloneValidation = await run(
      process.execPath,
      [resolve(standaloneSkill, "scripts", "validate-skill.mjs")],
      resolve(temporaryRoot, "standalone-root"),
      { ZX_WORKFLOW_SKIP_PORTABILITY_PROBE: "1" },
    );
    if (!standaloneValidation.stdout.includes("zx-workflow-author validation passed.")) {
      throw new Error("Standalone bundle validation did not complete every substantive check.");
    }
  }

  console.log("zx-workflow-author validation passed.");
} finally {
  // Remove isolated fixtures so validation never pollutes the repository or a user target.
  await rm(temporaryRoot, { recursive: true, force: true });
}
}

async function validateProcessTreeCleanup(installedToolTarget, iterations) {
  // Scaffold once so focused stress exercises the same generated runtime as the complete validation.
  const timeoutTreeDefinition = {
    name: "timeout-tree-cleanup",
    description: "Terminate an observed descendant with the timed-out direct child.",
    agents: {},
    stages: [
      {
        id: "tree",
        kind: "command",
        command: process.execPath,
        args: ["tree-parent.mjs"],
        timeoutMs: 1_000,
      },
    ],
  };
  const timeoutTreePlan = resolve(temporaryRoot, "timeout-tree-plan.json");
  const timeoutTreeTarget = resolve(temporaryRoot, "timeout-tree-cleanup");
  await writeFile(timeoutTreePlan, `${JSON.stringify(timeoutTreeDefinition, null, 2)}\n`);
  await run(process.execPath, [scaffoldScript, timeoutTreePlan, timeoutTreeTarget], repoRoot);
  await writeFile(
    resolve(timeoutTreeTarget, "tree-parent.mjs"),
    [
      "import{spawn}from'node:child_process';",
      "const child=spawn(process.execPath,['tree-child.mjs'],{stdio:'ignore',env:process.env});",
      "child.once('error',()=>process.exit(2));",
      "setInterval(()=>{},1000);",
    ].join(""),
  );
  await writeFile(
    resolve(timeoutTreeTarget, "tree-child.mjs"),
    [
      "import{mkdirSync,writeFileSync}from'node:fs';",
      "import{dirname,join}from'node:path';",
      "const marker=join(process.env.ZX_WORKFLOW_RUN_DIR,'tree-child-ready.json');",
      "mkdirSync(dirname(marker),{recursive:true});",
      "writeFileSync(marker,JSON.stringify({pid:process.pid}),{flag:'wx'});",
      "setInterval(()=>{},1000);",
    ].join(""),
  );
  let toolTarget = installedToolTarget;
  if (!toolTarget) {
    await runNpm(timeoutTreeTarget, ["install", "--ignore-scripts", "--no-audit", "--no-fund"]);
    toolTarget = timeoutTreeTarget;
  }

  for (let iteration = 1; iteration <= iterations; iteration += 1) {
    const runId = `process-tree-${iteration}`;
    const timeoutTreeFailure = await runWorkflow(
      toolTarget,
      timeoutTreeTarget,
      ["--problem", "terminate the full timed-out process tree"],
      { ZX_WORKFLOW_RUN_ID: runId },
      true,
    );
    const readyPath = resolve(
      timeoutTreeTarget,
      ".zx-workflow",
      timeoutTreeDefinition.name,
      runId,
      "tree-child-ready.json",
    );
    const readyText = await readFile(readyPath, "utf8").catch(() => "");
    const descendantPid = Number(JSON.parse(readyText || "null")?.pid);
    if (!Number.isSafeInteger(descendantPid) || descendantPid <= 0 || descendantPid === process.pid) {
      throw new Error(`Process-tree fixture did not prove a live descendant before timeout: iteration ${iteration}.`);
    }
    const descendantExited = await waitForProcessAbsence(descendantPid, 500);
    if (timeoutTreeFailure.code === 0 || !descendantExited) {
      if (!descendantExited) await terminateValidationProcess(descendantPid);
      throw new Error(`A descendant survived process-tree timeout termination: iteration ${iteration}.`);
    }
  }
  return timeoutTreeTarget;
}

async function validateGracefulAgentTimeout(installedToolTarget, iterations) {
  // Reproduce a producer that emits acceptable bytes, then cooperates with termination by exiting zero.
  const definition = {
    name: "graceful-agent-timeout",
    description: "Reject timed-out agent output and restore the declared mutation.",
    budgets: { maxAgentCalls: 1, maxWallTimeMs: 5_000 },
    agents: {
      fixture: {
        provider: "fixture",
        command: process.execPath,
        args: ["graceful-timeout-agent.mjs"],
        promptMode: "stdin",
        timeoutMs: 400,
      },
    },
    stages: [
      {
        id: "bounded-handoff",
        kind: "agent",
        agent: "fixture",
        prompt: "Return the bounded handoff marker.",
        output: "release/handoff.txt",
        mutates: ["release/handoff.txt"],
        attempts: 1,
        models: { fast: "fixture-fast", strong: "fixture-strong" },
        gate: { kind: "contains", values: ["GRACEFUL-TIMEOUT-READY"] },
      },
    ],
  };
  const plan = resolve(temporaryRoot, "graceful-agent-timeout-plan.json");
  const target = resolve(temporaryRoot, "graceful-agent-timeout");
  await writeFile(plan, `${JSON.stringify(definition, null, 2)}\n`);
  await run(process.execPath, [scaffoldScript, plan, target], repoRoot);
  await writeFile(
    resolve(target, "graceful-timeout-agent.mjs"),
    [
      "import{spawn}from'node:child_process';",
      "import{existsSync}from'node:fs';",
      "import{join}from'node:path';",
      "import{setTimeout as wait}from'node:timers/promises';",
      "const marker=join(process.env.ZX_WORKFLOW_RUN_DIR,'graceful-child-ready.json');",
      "process.on('SIGTERM',()=>process.exit(0));",
      "const child=spawn(process.execPath,['graceful-timeout-child.mjs'],{stdio:'ignore',env:process.env});",
      "child.once('error',()=>process.exit(2));",
      "for(let attempt=0;attempt<100&&!existsSync(marker);attempt+=1)await wait(5);",
      "if(!existsSync(marker))process.exit(3);",
      "process.stdout.write('GRACEFUL-TIMEOUT-READY\\n');",
      "setInterval(()=>{},1000);",
    ].join(""),
  );
  await writeFile(
    resolve(target, "graceful-timeout-child.mjs"),
    [
      "import{mkdirSync,writeFileSync}from'node:fs';",
      "import{dirname,join}from'node:path';",
      "const marker=join(process.env.ZX_WORKFLOW_RUN_DIR,'graceful-child-ready.json');",
      "mkdirSync(dirname(marker),{recursive:true});",
      "writeFileSync(marker,JSON.stringify({pid:process.pid}),{flag:'wx'});",
      "process.on('SIGTERM',()=>{});",
      "setInterval(()=>{},1000);",
    ].join(""),
  );
  let toolTarget = installedToolTarget;
  if (!toolTarget) {
    await runNpm(target, ["install", "--ignore-scripts", "--no-audit", "--no-fund"]);
    toolTarget = target;
  }

  for (let iteration = 1; iteration <= iterations; iteration += 1) {
    // Seed exact bytes before every run so false success would visibly promote the pre-timeout stdout.
    const original = `ORIGINAL-GRACEFUL-TIMEOUT-${iteration}\n`;
    await mkdir(resolve(target, "release"), { recursive: true });
    await writeFile(resolve(target, "release", "handoff.txt"), original);
    const runId = `graceful-agent-timeout-${iteration}`;
    const failure = await runWorkflow(
      toolTarget,
      target,
      ["--problem", "reject timed-out output", "--state-root", ".state"],
      { ZX_WORKFLOW_RUN_ID: runId },
      true,
    );
    const runDir = resolve(target, ".state", definition.name, runId);
    const events = (await readFile(resolve(runDir, "events.jsonl"), "utf8"))
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .map(JSON.parse);
    const calls = (await readFile(resolve(runDir, "model-calls.jsonl"), "utf8"))
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .map(JSON.parse);
    const ready = JSON.parse(await readFile(resolve(runDir, "work", "graceful-child-ready.json"), "utf8"));
    const descendantPid = Number(ready.pid);
    const descendantExited = Number.isSafeInteger(descendantPid) && descendantPid > 0
      ? await waitForProcessAbsence(descendantPid, 500)
      : false;
    const callTermination = calls[0]?.termination;
    const truthfulZeroExit = process.platform === "win32" || callTermination?.exitCode === 0;
    if (
      failure.code === 0 ||
      !descendantExited ||
      (await readFile(resolve(target, "release", "handoff.txt"), "utf8")) !== original ||
      calls.length !== 1 ||
      !truthfulZeroExit ||
      callTermination?.timedOut !== true ||
      !events.some((entry) => entry.event === "attempt_failed") ||
      !events.some((entry) => entry.event === "stage_rolled_back") ||
      events.some((entry) => entry.event === "workflow_passed") ||
      !verifyLedgerForTest(events) ||
      !verifyLedgerForTest(calls)
    ) {
      if (!descendantExited && Number.isSafeInteger(descendantPid) && descendantPid > 0) {
        await terminateValidationProcess(descendantPid);
      }
      throw new Error(`A graceful agent timeout was accepted or lost rollback evidence: iteration ${iteration}.`);
    }
  }
  return target;
}

async function waitForProcessAbsence(pid, timeoutMs) {
  // Poll PID existence after the runtime reports containment; no delayed marker can bias this assertion.
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    try {
      process.kill(pid, 0);
    } catch (error) {
      if (error?.code === "ESRCH") return true;
      if (error?.code !== "EPERM") throw error;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 10));
  }
  return false;
}

async function terminateValidationProcess(pid) {
  // Clean up a failed stress fixture through a fixed argv vector; never invoke a command shell.
  const systemRoot = process.env.SystemRoot ?? process.env.WINDIR;
  const taskkill = systemRoot ? resolve(systemRoot, "System32", "taskkill.exe") : "taskkill.exe";
  await run(taskkill, ["/PID", String(pid), "/T", "/F"], repoRoot, {}, true);
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

function canonicalizeForTest(value) {
  if (Array.isArray(value)) return value.map(canonicalizeForTest);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonicalizeForTest(item)]),
  );
}

function verifyLedgerForTest(records) {
  let previous = `sha256:${"0".repeat(64)}`;
  for (const [index, record] of records.entries()) {
    const { recordSha256, ...body } = record;
    const expected = `sha256:${createHash("sha256").update(JSON.stringify(body)).digest("hex")}`;
    if (record.sequence !== index + 1 || record.previousSha256 !== previous || recordSha256 !== expected) {
      return false;
    }
    previous = recordSha256;
  }
  return true;
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
