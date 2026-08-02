#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { resolveDeployGraph } from "../../../scripts/deploy/deploy-graph";

const SHA = /^[0-9a-f]{40}$/;
const TARGET = /^(?:monolith|[a-z][a-z0-9-]*)$/;

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => [key, canonicalize(entry)]));
}

const canonicalJson = (value) => JSON.stringify(canonicalize(value));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: "wx" });
    fs.renameSync(temporary, file);
  } finally { fs.rmSync(temporary, { force: true }); }
}

function currentDeployedBaseline(baselineRoot, target, targetMode) {
  const pointerFile = path.join(baselineRoot, target, targetMode, "current.json");
  if (!fs.existsSync(pointerFile)) return { source: null, reason: "deployed-baseline-missing" };
  try {
    const receipt = JSON.parse(fs.readFileSync(pointerFile, "utf8"));
    const { receiptDigest, ...unsigned } = receipt;
    const source = unsigned?.source?.commitSha;
    if (unsigned?.schemaVersion !== 1 || unsigned?.kind !== "workspace-deployed-release-baseline"
      || unsigned?.target?.id !== target || unsigned?.target?.mode !== targetMode
      || !SHA.test(source ?? "") || receiptDigest !== sha256(canonicalJson(unsigned))) {
      return { source: null, reason: "deployed-baseline-invalid" };
    }
    return { source, reason: "deployed-baseline-matched" };
  } catch {
    return { source: null, reason: "deployed-baseline-unreadable" };
  }
}

function isAncestor(repository, baseline, source) {
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", baseline, source], { cwd: repository, stdio: "ignore" });
    return true;
  } catch { return false; }
}

function changedFiles(repository, baseline, source) {
  return execFileSync("git", ["diff", "--name-only", "-z", baseline, source], {
    cwd: repository,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  }).split("\0").filter(Boolean).sort();
}

function withinRoot(file, root) {
  const normalized = root.replace(/\/$/, "");
  return file === normalized || file.startsWith(`${normalized}/`);
}

export function createReleaseExecutionPlan({
  repository = process.cwd(), baselineRoot, source, target, targetMode, output,
  graph = null, now = () => new Date().toISOString(),
} = {}) {
  const root = fs.realpathSync(path.resolve(repository));
  if (!SHA.test(source ?? "") || !TARGET.test(target ?? "")) throw new Error("release execution plan identity is invalid");
  const mode = target === "monolith" ? "activate" : targetMode;
  if (!new Set(["activate", "shadow"]).has(mode)) throw new Error("release execution plan target mode is invalid");
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  if (head !== source) throw new Error("release execution plan source differs from frozen HEAD");

  let strategy = "serial";
  let reason = target === "monolith" ? "monolith-resource-boundary" : "unit-baseline-required";
  let baselineSource = null;
  let files = [];
  let privateSourceRoots = [];
  if (target !== "monolith") {
    const baseline = currentDeployedBaseline(path.resolve(baselineRoot), target, mode);
    baselineSource = baseline.source;
    reason = baseline.reason;
    if (baselineSource && isAncestor(root, baselineSource, source)) {
      const deployGraph = graph ?? resolveDeployGraph({ repositoryRoot: root });
      const unit = deployGraph.units.find((entry) => entry.id === target);
      if (!unit) throw new Error(`release execution target is not a deploy unit: ${target}`);
      privateSourceRoots = [...unit.privateSourceRoots].map((entry) => entry.replace(/\/$/, "")).sort();
      files = changedFiles(root, baselineSource, source);
      if (files.length === 0) reason = "candidate-has-no-delta";
      else if (files.every((file) => privateSourceRoots.some((rootPath) => withinRoot(file, rootPath)))) {
        strategy = "parallel";
        reason = "private-unit-delta";
      } else reason = "shared-or-unknown-delta";
    } else if (baselineSource) reason = "deployed-baseline-not-ancestor";
  }

  const unsigned = {
    schemaVersion: 1,
    kind: "workspace-release-execution-plan",
    source,
    target: { id: target, mode },
    baselineSource,
    changedFiles: files,
    privateSourceRoots,
    sourceArtifactStrategy: strategy,
    reason,
    createdAt: now(),
  };
  const plan = { ...unsigned, receiptDigest: sha256(canonicalJson(unsigned)) };
  if (output) atomicJson(path.resolve(output), plan);
  return plan;
}

function parse(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag?.startsWith("--") || !value || value.startsWith("--")) throw new Error(`invalid argument near ${flag}`);
    values.set(flag.slice(2), value);
  }
  return {
    repository: values.get("repository"),
    baselineRoot: values.get("baseline-root"),
    source: values.get("source"),
    target: values.get("target"),
    targetMode: values.get("target-mode"),
    output: values.get("output"),
  };
}

export function main(argv = process.argv.slice(2)) {
  const plan = createReleaseExecutionPlan(parse(argv));
  process.stdout.write(`release execution plan: ${plan.sourceArtifactStrategy} (${plan.reason})\n`);
  return plan;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(); } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
