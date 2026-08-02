#!/usr/bin/env node

import fs from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { assertDeployUnitArtifact } from "../../deploy-unit-release.mjs";
import { inspectArchive } from "./artifact-inspection.mjs";

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value == null) throw new Error(`invalid argument near ${key ?? "end"}`);
    const name = key.slice(2);
    if (!new Set(["artifact", "manifest", "target", "contract", "output"]).has(name) || options[name]) {
      throw new Error(`unsupported or duplicate argument ${key}`);
    }
    options[name] = value;
  }
  for (const name of ["artifact", "manifest", "target"]) {
    if (!options[name]) throw new Error(`--${name} is required`);
  }
  return options;
}

export function assertArtifactStaticAcceptance({ artifact, manifest, target, contract }) {
  const parsedManifest = JSON.parse(fs.readFileSync(manifest, "utf8"));
  const artifactSha256 = sha256File(artifact);
  const artifactSize = fs.statSync(artifact).size;
  if (target === "monolith") {
    if (parsedManifest.artifact?.sha256 !== artifactSha256
      || parsedManifest.artifact?.sizeBytes !== artifactSize) {
      throw new Error("monolith artifact digest or size differs from manifest");
    }
  } else {
    if (!contract) throw new Error("deploy-unit static acceptance requires --contract");
    assertDeployUnitArtifact({
      manifestFile: manifest,
      artifactFile: artifact,
      contractFile: contract,
    });
  }
  return inspectArchive({ artifact, manifest: parsedManifest, target });
}

const sha256File = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const canonicalJson = (value) => JSON.stringify(value);

export function validateArtifactStaticAcceptance(receipt, { artifact, manifest, target }) {
  const { receiptDigest, ...unsigned } = receipt ?? {};
  if (receipt?.schemaVersion !== 1 || receipt?.kind !== "workspace-artifact-static-acceptance"
    || receipt?.status !== "passed" || receipt?.target !== target
    || receipt?.artifact?.sha256 !== sha256File(artifact)
    || receipt?.artifact?.manifestSha256 !== sha256File(manifest)
    || typeof receipt?.inspection?.serverEntry !== "string"
    || typeof receipt?.inspection?.buildId !== "string"
    || receipt?.inspection?.basePath !== "/workspace"
    || !Number.isSafeInteger(receipt?.inspection?.entryCount) || receipt.inspection.entryCount <= 0
    || !Number.isFinite(Date.parse(receipt?.completedAt ?? ""))
    || !/^[0-9a-f]{64}$/.test(receiptDigest ?? "")
    || receiptDigest !== createHash("sha256").update(canonicalJson(unsigned)).digest("hex")) {
    throw new Error("artifact static acceptance receipt does not match the exact artifact");
  }
  return receipt;
}

export function createArtifactStaticAcceptance(options) {
  const inspection = assertArtifactStaticAcceptance(options);
  const unsigned = {
    schemaVersion: 1,
    kind: "workspace-artifact-static-acceptance",
    status: "passed",
    target: options.target,
    artifact: { sha256: sha256File(options.artifact), manifestSha256: sha256File(options.manifest) },
    inspection,
    completedAt: new Date().toISOString(),
  };
  const receipt = {
    ...unsigned,
    receiptDigest: createHash("sha256").update(canonicalJson(unsigned)).digest("hex"),
  };
  if (options.output) {
    const output = path.resolve(options.output);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    const temporary = `${output}.${process.pid}.${randomUUID()}.tmp`;
    try {
      fs.writeFileSync(temporary, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600, flag: "wx" });
      fs.renameSync(temporary, output);
    } finally { fs.rmSync(temporary, { force: true }); }
  }
  return receipt;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const result = createArtifactStaticAcceptance(parseArguments(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify({ status: "MATCH", ...result })}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
