import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import {
  assert, assertDigest, assertIdentifier, canonicalJson, digestEvidence,
  failureFingerprint, sha256, writeFinal,
} from "./ci-attempt-contract.mjs";

export const DEPLOY_ADMISSION_SCHEMA = "workspace.deploy-admission/v1";
const GIT_OBJECT_ID = /^[a-f0-9]{40}$/;

function receiptDigest(receipt) {
  return sha256(canonicalJson({ ...receipt, receiptDigest: null }));
}

function optionalIdentity({ commit, tree, contentDigest }, label) {
  if (!commit && !tree && !contentDigest) return null;
  assert(GIT_OBJECT_ID.test(commit ?? ""), `${label} commit must be a full Git object id`);
  if (tree != null) assert(GIT_OBJECT_ID.test(tree), `${label} tree must be a full Git object id`);
  if (contentDigest != null) assertDigest(contentDigest, `${label} content digest`);
  return { commit, ...(tree ? { tree } : {}), ...(contentDigest ? { contentDigest } : {}) };
}

function codes(values, label) {
  assert(Array.isArray(values), `${label} must be an array`);
  for (const value of values) assertIdentifier(value, label);
  return [...new Set(values)].sort();
}

export async function recordDeployAdmission(options) {
  const {
    root, repository, attemptId, target, targetMode, source, controller,
    startedAt, completedAt, status, failureCodes, blockedCodes, log,
  } = options;
  assertIdentifier(attemptId, "deploy admission attempt id");
  assertIdentifier(target, "deploy target");
  assertIdentifier(targetMode, "deploy target mode");
  assert(["failed", "blocked"].includes(status), "deploy admission status is invalid");
  const failures = codes(failureCodes, "deploy admission failure code");
  const blocked = codes(blockedCodes, "deploy admission blocked code");
  assert(status === "failed" ? failures.length > 0 : failures.length === 0 && blocked.length > 0,
    "deploy admission status does not match its findings");
  const started = Date.parse(startedAt);
  const completed = Date.parse(completedAt);
  assert(Number.isFinite(started) && Number.isFinite(completed) && completed >= started,
    "deploy admission timestamps are invalid");
  const sourceIdentity = optionalIdentity(source, "source");
  const controllerIdentity = optionalIdentity(controller, "controller");
  const [evidence] = await digestEvidence(repository, [`deploy-admission-log:${log}`]);
  const commandDigest = sha256("publish-entry-preflight-v1");
  const receipt = {
    schema: DEPLOY_ADMISSION_SCHEMA,
    kind: "workspace-deploy-admission",
    attemptId,
    target,
    targetMode,
    source: sourceIdentity,
    controller: controllerIdentity,
    command: { id: "publish-entry-preflight-v1", digest: commandDigest },
    status,
    startedAt,
    completedAt,
    durationMs: completed - started,
    evidence,
    failures: failures.map((errorCode) => ({
      errorCode,
      fingerprint: failureFingerprint({
        lane: "deploy-admission", commandDigest, errorCode, exitCode: 1,
        normalizedMessageDigest: sha256(errorCode),
      }),
    })),
    blocked,
    receiptDigest: null,
  };
  receipt.receiptDigest = receiptDigest(receipt);
  await writeFinal(path.join(root, "admissions", `${attemptId}.json`), receipt);
  return receipt;
}

export async function readDeployAdmissions(root) {
  const directory = path.join(root, "admissions");
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const receipts = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const file = path.join(directory, entry.name);
    const receipt = JSON.parse(await readFile(file, "utf8"));
    assert(receipt?.schema === DEPLOY_ADMISSION_SCHEMA, `unsupported deploy admission schema: ${file}`);
    assert(receipt.receiptDigest === receiptDigest(receipt), `deploy admission receipt digest mismatch: ${file}`);
    receipts.push(receipt);
  }
  return receipts;
}
