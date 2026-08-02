import { readFile } from "node:fs/promises";

import {
  assert, assertDigest, canonicalJson, safeRepositoryPath, sha256, writeFinal,
} from "./ci-attempt-contract.mjs";

export const DEPLOY_RETRY_FENCE_SCHEMA = "workspace.deploy-retry-fence-ready/v1";
const GIT_OBJECT_ID = /^[a-f0-9]{40}$/;

function receiptDigest(receipt) {
  return sha256(canonicalJson({ ...receipt, receiptDigest: null }));
}

function identity(options) {
  assert(typeof options.target === "string" && options.target.length > 0, "retry fence target is missing");
  assert(typeof options.targetMode === "string" && options.targetMode.length > 0, "retry fence target mode is missing");
  assertDigest(options.sourceContentDigest, "retry fence source content digest");
  assert(GIT_OBJECT_ID.test(options.sourceCommit), "retry fence source commit is invalid");
  assert(GIT_OBJECT_ID.test(options.controllerCommit), "retry fence controller commit is invalid");
  return {
    target: options.target,
    targetMode: options.targetMode,
    sourceContentDigest: options.sourceContentDigest,
    sourceCommit: options.sourceCommit,
    controllerCommit: options.controllerCommit,
  };
}

export function deployLedgerDigest(groups) {
  return sha256(canonicalJson(groups));
}

export async function createDeployRetryFenceReceipt(options) {
  const safe = safeRepositoryPath(options.repository, options.file);
  const receipt = {
    schema: DEPLOY_RETRY_FENCE_SCHEMA,
    kind: "workspace-deploy-retry-fence-ready",
    status: "ready",
    command: "ops/publish.sh deploy",
    ...identity(options),
    ledgerDigest: deployLedgerDigest(options.groups),
    issuedAt: new Date().toISOString(),
    receiptDigest: null,
  };
  receipt.receiptDigest = receiptDigest(receipt);
  await writeFinal(safe.absolute, receipt);
  return { file: safe.relative, receipt };
}

export async function verifyDeployRetryFenceReceipt(options) {
  const safe = safeRepositoryPath(options.repository, options.file);
  const receipt = JSON.parse(await readFile(safe.absolute, "utf8"));
  assert(receipt?.schema === DEPLOY_RETRY_FENCE_SCHEMA
    && receipt.kind === "workspace-deploy-retry-fence-ready"
    && receipt.status === "ready"
    && receipt.command === "ops/publish.sh deploy",
  "deploy retry fence receipt contract is invalid");
  assert(receipt.receiptDigest === receiptDigest(receipt), "deploy retry fence receipt digest mismatch");
  const expected = identity(options);
  for (const [key, value] of Object.entries(expected)) {
    assert(receipt[key] === value, `deploy retry fence ${key} mismatch`);
  }
  assert(receipt.ledgerDigest === deployLedgerDigest(options.groups), "deploy retry fence ledger changed after admission");
  return receipt;
}
