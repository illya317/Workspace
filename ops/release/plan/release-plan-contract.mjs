#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import {
  appendFileSync,
  chmodSync,
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

export const RELEASE_STAGES = ["prepare", "validate", "build", "deploy"];
export const TERMINAL_STAGE_STATUSES = ["succeeded", "failed", "cancelled", "skipped_by_fast"];
const EXECUTORS = new Set(["local", "cnb"]);
const TREE_PATTERN = /^[0-9a-f]{40}$/;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function requireObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value;
}

function requireExactKeys(value, expected, label) {
  const actual = Object.keys(requireObject(value, label)).sort();
  if (JSON.stringify(actual) !== JSON.stringify([...expected].sort())) {
    throw new Error(`${label} has unsupported or missing fields`);
  }
  return value;
}

function requireIsoTime(value, label) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) throw new Error(`${label} must be an ISO timestamp`);
  return value;
}

function requireStage(stage) {
  if (!RELEASE_STAGES.includes(stage)) throw new Error(`stage must be one of: ${RELEASE_STAGES.join(", ")}`);
  return stage;
}

function validateTarget(target) {
  requireObject(target, "target");
  if (target.kind === "monolith" && Object.keys(target).length === 1) return target;
  if (target.kind === "unit"
    && /^[a-z][a-z0-9-]*$/.test(target.unitId ?? "")
    && ["shadow", "activate"].includes(target.mode)
    && Object.keys(target).sort().join(",") === "kind,mode,unitId") return target;
  throw new Error("release target is invalid");
}

function validateExecutors(executors) {
  requireExactKeys(executors, RELEASE_STAGES, "executors");
  let enteredCnb = false;
  for (const stage of RELEASE_STAGES) {
    if (!EXECUTORS.has(executors[stage])) throw new Error(`executor for ${stage} must be local or cnb`);
    if (stage === "prepare" && executors[stage] !== "local") {
      throw new Error("prepare=cnb is reserved until the remote preparation adapter is available");
    }
    if (executors[stage] === "cnb") enteredCnb = true;
    if (enteredCnb && executors[stage] === "local") {
      throw new Error("executor flow cannot return from cnb to local");
    }
  }
  if (executors.build === "local" && executors.deploy === "cnb") {
    throw new Error("deploy=cnb after build=local is reserved until the artifact capsule handoff adapter is enabled");
  }
  return executors;
}

export function validateReleasePlan(plan) {
  requireExactKeys(plan, [
    "schemaVersion", "kind", "planId", "mode", "fastReason", "source", "configurationDigest",
    "target", "executors", "stages", "createdAt",
  ], "release plan");
  if (plan.schemaVersion !== 1 || plan.kind !== "workspace-release-plan"
    || !/^plan-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{12}$/.test(plan.planId ?? "")) {
    throw new Error("release plan identity is invalid");
  }
  requireExactKeys(plan.source, ["commitSha", "treeId", "contentDigest"], "release plan source");
  if (!TREE_PATTERN.test(plan.source.commitSha ?? "") || !TREE_PATTERN.test(plan.source.treeId ?? "")
    || !DIGEST_PATTERN.test(plan.source.contentDigest ?? "") || !DIGEST_PATTERN.test(plan.configurationDigest ?? "")) {
    throw new Error("release plan source or configuration identity is invalid");
  }
  if (!new Set(["standard", "fast"]).has(plan.mode)) throw new Error("release mode must be standard or fast");
  if (plan.mode === "fast") {
    if (typeof plan.fastReason !== "string" || plan.fastReason.trim().length < 8) {
      throw new Error("fast release requires a reason with at least 8 characters");
    }
  } else if (plan.fastReason !== null) throw new Error("standard release cannot contain a fast reason");
  validateTarget(plan.target);
  validateExecutors(plan.executors);
  if (JSON.stringify(plan.stages) !== JSON.stringify(RELEASE_STAGES)) throw new Error("release stage order is immutable");
  requireIsoTime(plan.createdAt, "createdAt");
  return plan;
}

function locations(root, planId = "") {
  const absoluteRoot = path.resolve(root);
  return {
    root: absoluteRoot,
    current: path.join(absoluteRoot, "current.json"),
    directory: planId ? path.join(absoluteRoot, "plans", planId) : "",
    plan: planId ? path.join(absoluteRoot, "plans", planId, "plan.json") : "",
    events: planId ? path.join(absoluteRoot, "plans", planId, "events.ndjson") : "",
    lock: planId ? path.join(absoluteRoot, "plans", planId, ".events.lock") : "",
  };
}

function atomicWrite(file, value) {
  mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${process.pid}-${randomUUID()}`;
  try {
    writeFileSync(temporary, value, { mode: 0o600 });
    chmodSync(temporary, 0o600);
    renameSync(temporary, file);
  } finally {
    rmSync(temporary, { force: true });
  }
}

function readJson(file, label) {
  try { return JSON.parse(readFileSync(file, "utf8")); } catch { throw new Error(`${label} is missing or invalid JSON`); }
}

export function readCurrentPlan(root) {
  const base = locations(root);
  const pointer = readJson(base.current, "current release plan pointer");
  requireExactKeys(pointer, ["schemaVersion", "kind", "planId"], "current release plan pointer");
  if (pointer.schemaVersion !== 1 || pointer.kind !== "workspace-current-release-plan") {
    throw new Error("current release plan pointer contract is invalid");
  }
  const plan = validateReleasePlan(readJson(locations(root, pointer.planId).plan, "release plan"));
  if (plan.planId !== pointer.planId) throw new Error("current release plan pointer does not match plan");
  return plan;
}

function readEvents(root, plan) {
  const file = locations(root, plan.planId).events;
  let source;
  try { source = readFileSync(file, "utf8"); } catch { throw new Error("release event ledger is missing"); }
  const events = source.split("\n").filter(Boolean).map((line) => {
    try { return JSON.parse(line); } catch { throw new Error("release event ledger contains invalid JSON"); }
  });
  let previousHash = null;
  const states = Object.fromEntries(RELEASE_STAGES.map((stage) => [stage, { status: "pending" }]));
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    requireExactKeys(event, ["schemaVersion", "kind", "sequence", "planId", "stage", "status", "executor", "at", "evidence", "previousHash", "hash"], `release event ${index + 1}`);
    const unsigned = { ...event };
    delete unsigned.hash;
    requireStage(event.stage);
    if (event.schemaVersion !== 1 || event.kind !== "workspace-release-stage-event"
      || event.sequence !== index + 1 || event.planId !== plan.planId || event.previousHash !== previousHash
      || event.hash !== sha256(canonical(unsigned)) || plan.executors[event.stage] !== event.executor) {
      throw new Error(`release event ${index + 1} violates the append-only ledger contract`);
    }
    requireIsoTime(event.at, `release event ${index + 1} timestamp`);
    requireObject(event.evidence, `release event ${index + 1} evidence`);
    const before = states[event.stage].status;
    const isInitialTerminal = index < 2 && before === "pending"
      && ((event.stage === "prepare" && event.status === "succeeded")
        || (event.stage === "validate" && plan.mode === "fast" && event.status === "skipped_by_fast"));
    if (event.status === "running") {
      if (before !== "pending") throw new Error(`stage ${event.stage} cannot start from ${before}`);
    } else if (TERMINAL_STAGE_STATUSES.includes(event.status)) {
      if (before !== "running" && !isInitialTerminal) throw new Error(`stage ${event.stage} cannot finish from ${before}`);
    } else throw new Error(`release event ${index + 1} status is invalid`);
    states[event.stage] = { status: event.status, event };
    previousHash = event.hash;
  }
  return { events, states, headHash: previousHash };
}

function appendEvent(root, plan, { stage, status, evidence = {}, now = () => new Date().toISOString() }) {
  const files = locations(root, plan.planId);
  let lock;
  try {
    lock = openSync(files.lock, "wx", 0o600);
  } catch {
    throw new Error("release event ledger is busy; refusing concurrent stage mutation");
  }
  try {
    const ledger = readEvents(root, plan);
    const unsigned = {
      schemaVersion: 1,
      kind: "workspace-release-stage-event",
      sequence: ledger.events.length + 1,
      planId: plan.planId,
      stage,
      status,
      executor: plan.executors[stage],
      at: now(),
      evidence,
      previousHash: ledger.headHash,
    };
    const event = { ...unsigned, hash: sha256(canonical(unsigned)) };
    appendFileSync(files.events, `${JSON.stringify(event)}\n`, { mode: 0o600 });
    return event;
  } finally {
    if (lock !== undefined) closeSync(lock);
    rmSync(files.lock, { force: true });
  }
}

function planContract(plan) {
  return canonical({
    mode: plan.mode,
    fastReason: plan.fastReason,
    source: plan.source,
    configurationDigest: plan.configurationDigest,
    target: plan.target,
    executors: plan.executors,
    stages: plan.stages,
  });
}

export function createReleasePlan({
  root,
  source,
  configurationDigest,
  mode = "standard",
  fastReason = null,
  target = { kind: "monolith" },
  executors = Object.fromEntries(RELEASE_STAGES.map((stage) => [stage, "local"])),
  forceNew = false,
  deferFastValidation = false,
  now = () => new Date().toISOString(),
  uuid = () => randomUUID(),
}) {
  if (!root) throw new Error("release plan root is required");
  const createdAt = now();
  const planId = `plan-${createdAt.replace(/[-:]/g, "").replace(/\.\d{3}/, "")}-${uuid().replaceAll("-", "").slice(0, 12)}`;
  const plan = validateReleasePlan({
    schemaVersion: 1,
    kind: "workspace-release-plan",
    planId,
    mode,
    fastReason: mode === "fast" ? fastReason : null,
    source,
    configurationDigest,
    target,
    executors,
    stages: RELEASE_STAGES,
    createdAt,
  });
  if (!forceNew) {
    try {
      const current = readCurrentPlan(root);
      if (planContract(current) === planContract(plan)) {
        const states = readEvents(root, current).states;
        if (RELEASE_STAGES.some((stage) => ["failed", "cancelled"].includes(states[stage].status))) {
          throw new Error("current release plan is terminal failed; use --new-plan after review");
        }
        return { plan: current, reused: true };
      }
      throw new Error("a different current release plan exists; use --new-plan to replace the pointer");
    } catch (error) {
      if (!String(error?.message).includes("missing or invalid JSON")) throw error;
    }
  }
  const files = locations(root, plan.planId);
  mkdirSync(path.dirname(files.directory), { recursive: true, mode: 0o700 });
  mkdirSync(files.directory, { recursive: false, mode: 0o700 });
  atomicWrite(files.plan, `${JSON.stringify(plan, null, 2)}\n`);
  atomicWrite(files.events, "");
  appendEvent(root, plan, { stage: "prepare", status: "succeeded", evidence: { configurationDigest }, now });
  if (mode === "fast" && !deferFastValidation) {
    appendEvent(root, plan, { stage: "validate", status: "skipped_by_fast", evidence: { reason: fastReason }, now });
  }
  atomicWrite(locations(root).current, `${JSON.stringify({
    schemaVersion: 1,
    kind: "workspace-current-release-plan",
    planId: plan.planId,
  }, null, 2)}\n`);
  return { plan, reused: false };
}

export function skipFastValidation({ root, evidence = {}, now = () => new Date().toISOString() }) {
  const plan = readCurrentPlan(root);
  if (plan.mode !== "fast") throw new Error("only a fast Plan can skip validation");
  const ledger = readEvents(root, plan);
  const state = ledger.states.validate.status;
  if (state === "skipped_by_fast") return { action: "reuse", plan, ledger };
  if (state !== "pending") throw new Error(`fast validation cannot be skipped from ${state}`);
  if (!/^[0-9a-f]{64}$/.test(evidence.taskGraphDigest ?? "")) {
    throw new Error("fast validation skip requires a frozen task graph digest");
  }
  appendEvent(root, plan, {
    stage: "validate",
    status: "skipped_by_fast",
    evidence: { ...evidence, reason: plan.fastReason },
    now,
  });
  return { action: "skip", plan, ledger: readEvents(root, plan) };
}

export function assertPlanIdentity(plan, expected = {}) {
  const pairs = [
    ["commitSha", expected.sourceSha],
    ["treeId", expected.treeId],
    ["contentDigest", expected.contentDigest],
  ];
  for (const [key, value] of pairs) {
    if (value && plan.source[key] !== value) throw new Error(`current plan ${key} differs from the frozen candidate`);
  }
  if (expected.configurationDigest && plan.configurationDigest !== expected.configurationDigest) {
    throw new Error("current plan private configuration digest has changed");
  }
  return plan;
}

function assertPrerequisites(plan, states, stage) {
  if (stage === "prepare") return;
  if (states.prepare.status !== "succeeded") throw new Error("prepare must succeed before later stages");
  if (stage === "deploy") {
    if (states.build.status !== "succeeded") throw new Error("build must succeed before deploy");
    const expectedValidation = plan.mode === "fast" ? "skipped_by_fast" : "succeeded";
    if (states.validate.status !== expectedValidation) {
      throw new Error(`${plan.mode} deploy requires validate=${expectedValidation}`);
    }
  }
}

export function beginReleaseStage({ root, stage, executor, expected = {} }) {
  requireStage(stage);
  const plan = assertPlanIdentity(readCurrentPlan(root), expected);
  if (executor && plan.executors[stage] !== executor) throw new Error(`stage ${stage} is sealed to executor ${plan.executors[stage]}`);
  const ledger = readEvents(root, plan);
  const state = ledger.states[stage].status;
  if (state === "succeeded" || state === "skipped_by_fast") return { action: "reuse", plan, ledger };
  if (state === "failed" || state === "cancelled") {
    throw new Error(`stage ${stage} is terminal ${state}; create a new plan instead of rerunning it`);
  }
  assertPrerequisites(plan, ledger.states, stage);
  if (state === "running") throw new Error(`stage ${stage} is already running; inspect it instead of starting a duplicate`);
  appendEvent(root, plan, { stage, status: "running", evidence: {} });
  return { action: "run", plan, ledger: readEvents(root, plan) };
}

export function finishReleaseStage({ root, stage, status, evidence = {} }) {
  requireStage(stage);
  if (!new Set(["succeeded", "failed", "cancelled"]).has(status)) throw new Error("finish status is invalid");
  const plan = readCurrentPlan(root);
  const ledger = readEvents(root, plan);
  if (ledger.states[stage].status !== "running") throw new Error(`stage ${stage} is not running`);
  appendEvent(root, plan, { stage, status, evidence });
  return { plan, ledger: readEvents(root, plan) };
}

export function releasePlanSnapshot(root) {
  const plan = readCurrentPlan(root);
  const ledger = readEvents(root, plan);
  return {
    schemaVersion: 1,
    kind: "workspace-release-plan-snapshot",
    plan,
    stages: Object.fromEntries(RELEASE_STAGES.map((stage) => [stage, ledger.states[stage].status])),
    ledgerHead: ledger.headHash,
  };
}
