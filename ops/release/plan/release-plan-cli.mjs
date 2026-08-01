import {
  RELEASE_STAGES,
  beginReleaseStage,
  createReleasePlan,
  finishReleaseStage,
  releasePlanSnapshot,
  skipFastValidation,
} from "./release-plan.mjs";

function options(argv) {
  const [command, ...rest] = argv;
  const result = { command };
  for (let index = 0; index < rest.length; index += 1) {
    const key = rest[index];
    if (["--new-plan", "--json", "--defer-fast-validation"].includes(key)) {
      result[key.slice(2).replaceAll("-", "_")] = true;
    } else if (key?.startsWith("--")) {
      const value = rest[++index];
      if (value === undefined || value.startsWith("--")) throw new Error(`${key} is missing a value`);
      result[key.slice(2).replaceAll("-", "_")] = value;
    } else throw new Error(`unknown argument: ${key ?? "<empty>"}`);
  }
  return result;
}

export function main(argv = process.argv.slice(2)) {
  const input = options(argv);
  if (!input.root) throw new Error("--root is required");
  if (input.command === "create") {
    const result = createReleasePlan({
      root: input.root,
      source: { commitSha: input.source, treeId: input.tree, contentDigest: input.content },
      configurationDigest: input.configuration,
      mode: input.mode ?? "standard",
      fastReason: input.fast_reason ?? null,
      target: JSON.parse(input.target ?? '{"kind":"monolith"}'),
      executors: JSON.parse(input.executors ?? '{}'),
      forceNew: input.new_plan ?? false,
      deferFastValidation: input.defer_fast_validation ?? false,
    });
    process.stdout.write(`${JSON.stringify({ planId: result.plan.planId, reused: result.reused })}\n`);
    return result;
  }
  if (input.command === "skip-fast-validation") {
    const result = skipFastValidation({ root: input.root, evidence: JSON.parse(input.evidence ?? "{}") });
    process.stdout.write(`${JSON.stringify({ action: result.action, planId: result.plan.planId })}\n`);
    return result;
  }
  if (input.command === "begin") {
    const result = beginReleaseStage({
      root: input.root,
      stage: input.stage,
      executor: input.executor,
      expected: {
        sourceSha: input.source,
        treeId: input.tree,
        contentDigest: input.content,
        configurationDigest: input.configuration,
      },
    });
    process.stdout.write(`${JSON.stringify({ action: result.action, planId: result.plan.planId })}\n`);
    return result;
  }
  if (input.command === "finish") {
    const result = finishReleaseStage({
      root: input.root, stage: input.stage, status: input.status,
      evidence: JSON.parse(input.evidence ?? "{}"),
    });
    process.stdout.write(`${JSON.stringify({ planId: result.plan.planId, stage: input.stage, status: input.status })}\n`);
    return result;
  }
  if (input.command === "status" || input.command === "snapshot") {
    const snapshot = releasePlanSnapshot(input.root);
    if (input.command === "snapshot" || input.json) process.stdout.write(`${JSON.stringify(snapshot, null, 2)}\n`);
    else {
      const target = snapshot.plan.target.kind === "monolith"
        ? "monolith" : `${snapshot.plan.target.unitId}:${snapshot.plan.target.mode}`;
      process.stdout.write(`plan ${snapshot.plan.planId} (${snapshot.plan.mode}, target=${target})\n`);
      if (snapshot.plan.fastReason) process.stdout.write(`fast reason: ${snapshot.plan.fastReason}\n`);
      for (const stage of RELEASE_STAGES) {
        process.stdout.write(`${stage.padEnd(8)} ${snapshot.stages[stage].padEnd(16)} ${snapshot.plan.executors[stage]}\n`);
      }
    }
    return snapshot;
  }
  throw new Error("usage: release-plan.mjs create|skip-fast-validation|begin|finish|status|snapshot --root DIR ...");
}
