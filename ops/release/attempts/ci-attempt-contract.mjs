import { createHash } from "node:crypto";
import { chmod, mkdir, open, readFile, rename, stat, unlink } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";

export const ATTEMPT_SCHEMA = "workspace.release-ci-attempt/v2";
export const RECURRENCE_EXIT_CODE = 42;
export const DEFAULT_LANES = Object.freeze([
  "candidate-freeze",
  "artifact-preflight",
  "database",
  "source",
  "artifact-build",
  "static-acceptance",
  "rehearsal",
  "application-ready",
]);

export const FINAL_STATUSES = new Set(["passed", "failed", "blocked", "reused"]);
export const PASSING_STATUSES = new Set(["passed", "reused"]);
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,159}$/;
export const ERROR_CODE = /^[a-z0-9][a-z0-9._-]{0,95}$/;
const HEX_DIGEST = /^[a-f0-9]{7,128}$/;

export class AttemptContractError extends Error {
  constructor(message) {
    super(message);
    this.name = "AttemptContractError";
  }
}

export class RecurrenceError extends Error {
  constructor(recurrences) {
    super(`P1: ${recurrences.length} resolved CI blocker fingerprint(s) recurred`);
    this.name = "RecurrenceError";
    this.recurrences = recurrences;
    this.exitCode = RECURRENCE_EXIT_CODE;
  }
}

export function assert(condition, message) {
  if (!condition) throw new AttemptContractError(message);
}

export function assertIdentifier(value, label) {
  assert(typeof value === "string" && IDENTIFIER.test(value), `${label} must be a stable identifier`);
}

export function assertDigest(value, label, { nullable = false } = {}) {
  if (nullable && value == null) return;
  assert(typeof value === "string" && HEX_DIGEST.test(value), `${label} must be a lowercase hexadecimal digest`);
}

export function nowIso() {
  return new Date().toISOString();
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function normalizeLaneLog(value) {
  return value
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\b(?:password|passwd|token|secret|api[_-]?key)(\s*[=:]\s*)[^\s]+/gi, (_, separator) => `credential${separator}<redacted>`)
    .replace(/\b\d{4}-\d{2}-\d{2}[T ][0-9:.+-]+Z?\b/g, "<timestamp>")
    .replace(/\b(?:pid|process)[=: ]+\d+\b/gi, "pid=<pid>")
    .replace(/\/tmp\/[A-Za-z0-9._/-]+/g, "<tmp-path>")
    .replace(/\b(?:localhost|127\.0\.0\.1|0\.0\.0\.0):\d{2,5}\b/g, "<host>:<port>")
    .replace(/\bport[=: ]+\d{2,5}\b/gi, "port=<port>")
    .replace(/\b[a-f0-9]{7,64}\b/gi, "<revision>")
    .replace(/\bci-\d{8}T\d{6}Z-[A-Za-z0-9-]+\b/g, "<run-id>")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function durationMs(startedAt, completedAt) {
  if (!startedAt || !completedAt) return null;
  return Math.max(0, Date.parse(completedAt) - Date.parse(startedAt));
}

export function emptyLane() {
  return {
    status: "pending",
    startedAt: null,
    completedAt: null,
    durationMs: null,
    commandId: null,
    commandDigest: null,
    evidence: [],
    failure: null,
    receiptDigest: null,
  };
}

export async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

export async function writeDraft(file, value) {
  await mkdir(dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  await open(temporary, "wx", 0o600).then(async (handle) => {
    try {
      await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`);
      await handle.sync();
    } finally {
      await handle.close();
    }
  });
  await rename(temporary, file);
}

export async function writeNewDraft(file, value) {
  await mkdir(dirname(file), { recursive: true });
  const handle = await open(file, "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`);
    await handle.sync();
  } catch (error) {
    await handle.close();
    await unlink(file).catch(() => {});
    throw error;
  }
  await handle.close();
}

export async function writeFinal(file, value) {
  await mkdir(dirname(file), { recursive: true });
  const handle = await open(file, "wx", 0o444);
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`);
    await handle.sync();
  } catch (error) {
    await handle.close();
    await unlink(file).catch(() => {});
    throw error;
  }
  await handle.close();
  await chmod(file, 0o444);
}

export function validateDraft(attempt) {
  assert(attempt?.schema === ATTEMPT_SCHEMA, "attempt receipt schema is unsupported");
  assert(attempt.finalizedAt == null, "attempt receipt is already finalized");
  assertIdentifier(attempt.runId, "run id");
  assertIdentifier(attempt.target, "target");
  assertIdentifier(attempt.targetMode, "target mode");
  assert(Array.isArray(attempt.requiredLanes) && attempt.requiredLanes.length > 0, "required lanes are missing");
  for (const lane of attempt.requiredLanes) {
    assertIdentifier(lane, "lane");
    assert(attempt.lanes?.[lane], `lane ${lane} is missing`);
  }
}

export function safeRepositoryPath(repository, path) {
  assert(typeof path === "string" && path.length > 0 && path.length <= 512, "evidence path is invalid");
  assert(!path.includes("\0") && !path.includes("\n") && !path.includes("\r"), "evidence path contains control characters");
  const root = resolve(repository);
  const absolute = resolve(root, path);
  const rel = relative(root, absolute);
  assert(rel !== "" && rel !== ".." && !rel.startsWith(`..${sep}`), "evidence must be a file below the repository root");
  return { absolute, relative: rel.split(sep).join("/") };
}

export async function digestEvidence(repository, specifications) {
  const evidence = [];
  for (const specification of specifications) {
    const separator = specification.indexOf(":");
    assert(separator > 0, "evidence must use kind:path syntax");
    const kind = specification.slice(0, separator);
    const path = specification.slice(separator + 1);
    assertIdentifier(kind, "evidence kind");
    const safe = safeRepositoryPath(repository, path);
    const fileStat = await stat(safe.absolute);
    assert(fileStat.isFile(), `evidence is not a file: ${safe.relative}`);
    evidence.push({
      kind,
      path: safe.relative,
      sha256: sha256(await readFile(safe.absolute)),
      sizeBytes: fileStat.size,
    });
  }
  return evidence.sort((left, right) => `${left.kind}:${left.path}`.localeCompare(`${right.kind}:${right.path}`));
}

export function failureFingerprint({ lane, commandDigest, errorCode, exitCode, normalizedMessageDigest }) {
  return sha256([lane, commandDigest, errorCode, String(exitCode), normalizedMessageDigest].join("\0"));
}
