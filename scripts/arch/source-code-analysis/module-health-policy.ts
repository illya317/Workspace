import { promises as fs } from "node:fs";
import path from "node:path";

export const MODULE_HEALTH_REVIEW_MAX_AGE_DAYS = 90;
export const MODULE_HEALTH_REVIEW_POLICY_PATH =
  "scripts/arch/source-code-analysis/module-health-reviews.json";

export const DEFAULT_MODULE_HEALTH_THRESHOLDS = {
  implementationLines: 10_000,
  implementationFiles: 80,
  outgoingLeafDependencies: 15,
  orchestrationLines: 3_000,
} as const;

export type SourceModuleKind = "module" | "entry" | "orchestrator" | "appendOnlyHistory" | "retired";

export type ModuleHealthWarningCode =
  | "high-leaf-fan-out"
  | "legacy-implementation-bypass"
  | "oversized-leaf-files"
  | "oversized-leaf-lines"
  | "oversized-orchestration"
  | "retired-module-referenced";

export interface ModuleHealthMetrics {
  moduleKey: string;
  key: string;
  kind: SourceModuleKind;
  childCount: number;
  implementationLines: number;
  implementationFileCount: number;
  outgoingLeafDependencyCount: number;
  legacyImplementationBypassCount: number;
  referencedByActiveModuleCount: number;
}

export interface ModuleHealthThresholds {
  implementationLines: number;
  implementationFiles: number;
  outgoingLeafDependencies: number;
  orchestrationLines: number;
}

export interface ModuleHealthWarning {
  moduleId: string;
  code: ModuleHealthWarningCode;
  actual: number;
  threshold: number;
  requiresHygieneReview: true;
}

export interface ModuleHealthReviewEvidence {
  moduleId: string;
  warningCodes: ModuleHealthWarningCode[];
  implementationLines: number;
  implementationFileCount: number;
  outgoingLeafDependencyCount: number;
  legacyImplementationBypassCount: number;
  referencedByActiveModuleCount: number;
  interfaceDigest: string;
  dependencyDigest: string;
  debtDigest: string;
}

export type ModuleHealthReviewDecision = "accepted" | "deepen" | "split";

export interface ModuleHealthReviewReceipt {
  schemaVersion: 1;
  moduleId: string;
  decision: ModuleHealthReviewDecision;
  reviewer: string;
  reason: string;
  reviewedAt: string;
  expiresAt: string;
  evidence: ModuleHealthReviewEvidence;
}

export interface ModuleHealthReviewPolicy {
  schemaVersion: 1;
  reviews: ModuleHealthReviewReceipt[];
}

export type ModuleHealthReviewInvalidationReason =
  | "decision-requires-remediation"
  | "dependency-changed"
  | "debt-changed"
  | "expired"
  | "files-grew-over-ten-percent"
  | "interface-changed"
  | "lines-grew-over-ten-percent"
  | "module-mismatch"
  | "new-warning";

export interface ModuleHealthReviewStatus {
  valid: boolean;
  reason: ModuleHealthReviewInvalidationReason | null;
}

function moduleId(metrics: Pick<ModuleHealthMetrics, "moduleKey" | "key">) {
  return metrics.moduleKey + "/" + metrics.key;
}

function assertNonNegativeInteger(value: number, field: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("[source-code-analysis] invalid module health metric: " + field);
  }
}

function normalizedThresholds(
  overrides: Partial<ModuleHealthThresholds>,
): ModuleHealthThresholds {
  const thresholds = { ...DEFAULT_MODULE_HEALTH_THRESHOLDS, ...overrides };
  for (const [field, value] of Object.entries(thresholds)) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new Error("[source-code-analysis] invalid module health threshold: " + field);
    }
  }
  return thresholds;
}

function warning(
  metrics: ModuleHealthMetrics,
  code: ModuleHealthWarningCode,
  actual: number,
  threshold: number,
): ModuleHealthWarning {
  return {
    moduleId: moduleId(metrics),
    code,
    actual,
    threshold,
    requiresHygieneReview: true,
  };
}

/**
 * Size the implementation owned by every node. A parent is exempt only when
 * it is a pure aggregation node with no implementation of its own; otherwise
 * its residual files are still the smallest declared ownership unit.
 */
export function evaluateModuleHealth(
  modules: readonly ModuleHealthMetrics[],
  thresholdOverrides: Partial<ModuleHealthThresholds> = {},
) {
  const thresholds = normalizedThresholds(thresholdOverrides);
  const ids = modules.map(moduleId);
  if (new Set(ids).size !== ids.length) {
    throw new Error("[source-code-analysis] duplicate module health id");
  }

  const warnings: ModuleHealthWarning[] = [];
  for (const metrics of modules) {
    for (const field of [
      "childCount",
      "implementationLines",
      "implementationFileCount",
      "outgoingLeafDependencyCount",
      "legacyImplementationBypassCount",
      "referencedByActiveModuleCount",
    ] as const) {
      assertNonNegativeInteger(metrics[field], field);
    }

    if (metrics.kind === "retired") {
      if (metrics.referencedByActiveModuleCount > 0) {
        warnings.push(warning(
          metrics,
          "retired-module-referenced",
          metrics.referencedByActiveModuleCount,
          0,
        ));
      }
      continue;
    }

    if (metrics.legacyImplementationBypassCount > 0) {
      warnings.push(warning(
        metrics,
        "legacy-implementation-bypass",
        metrics.legacyImplementationBypassCount,
        0,
      ));
    }
    if (metrics.kind === "appendOnlyHistory") continue;
    if (metrics.childCount !== 0
      && metrics.implementationLines === 0
      && metrics.implementationFileCount === 0) continue;

    const orchestration = metrics.kind === "entry" || metrics.kind === "orchestrator";
    if (orchestration && metrics.implementationLines >= thresholds.orchestrationLines) {
      warnings.push(warning(
        metrics,
        "oversized-orchestration",
        metrics.implementationLines,
        thresholds.orchestrationLines,
      ));
    } else if (!orchestration && metrics.implementationLines >= thresholds.implementationLines) {
      warnings.push(warning(
        metrics,
        "oversized-leaf-lines",
        metrics.implementationLines,
        thresholds.implementationLines,
      ));
    }
    if (orchestration) continue;
    if (metrics.implementationFileCount >= thresholds.implementationFiles) {
      warnings.push(warning(
        metrics,
        "oversized-leaf-files",
        metrics.implementationFileCount,
        thresholds.implementationFiles,
      ));
    }
    if (metrics.outgoingLeafDependencyCount >= thresholds.outgoingLeafDependencies) {
      warnings.push(warning(
        metrics,
        "high-leaf-fan-out",
        metrics.outgoingLeafDependencyCount,
        thresholds.outgoingLeafDependencies,
      ));
    }
  }
  return warnings.sort((left, right) =>
    (left.moduleId + "\0" + left.code).localeCompare(right.moduleId + "\0" + right.code));
}

export function moduleHealthReviewEvidence(
  metrics: ModuleHealthMetrics,
  warnings: readonly ModuleHealthWarning[],
  digests: Pick<ModuleHealthReviewEvidence, "interfaceDigest" | "dependencyDigest" | "debtDigest">,
): ModuleHealthReviewEvidence {
  const id = moduleId(metrics);
  return {
    moduleId: id,
    warningCodes: warnings
      .filter((item) => item.moduleId === id)
      .map((item) => item.code)
      .sort(),
    implementationLines: metrics.implementationLines,
    implementationFileCount: metrics.implementationFileCount,
    outgoingLeafDependencyCount: metrics.outgoingLeafDependencyCount,
    legacyImplementationBypassCount: metrics.legacyImplementationBypassCount,
    referencedByActiveModuleCount: metrics.referencedByActiveModuleCount,
    interfaceDigest: digests.interfaceDigest,
    dependencyDigest: digests.dependencyDigest,
    debtDigest: digests.debtDigest,
  };
}

function grewOverTenPercent(current: number, reviewed: number) {
  return current > reviewed * 1.1;
}

export function moduleHealthReviewStatus(
  receipt: ModuleHealthReviewReceipt,
  current: ModuleHealthReviewEvidence,
  now = new Date(),
): ModuleHealthReviewStatus {
  if (receipt.decision !== "accepted") {
    return { valid: false, reason: "decision-requires-remediation" };
  }
  if (receipt.moduleId !== current.moduleId || receipt.evidence.moduleId !== current.moduleId) {
    return { valid: false, reason: "module-mismatch" };
  }
  if (Date.parse(receipt.expiresAt) <= now.getTime()) return { valid: false, reason: "expired" };
  if (receipt.evidence.interfaceDigest !== current.interfaceDigest) {
    return { valid: false, reason: "interface-changed" };
  }
  if (receipt.evidence.dependencyDigest !== current.dependencyDigest) {
    return { valid: false, reason: "dependency-changed" };
  }
  if (receipt.evidence.debtDigest !== current.debtDigest) {
    return { valid: false, reason: "debt-changed" };
  }
  const reviewedWarnings = new Set(receipt.evidence.warningCodes);
  if (current.warningCodes.some((code) => !reviewedWarnings.has(code))) {
    return { valid: false, reason: "new-warning" };
  }
  if (grewOverTenPercent(current.implementationLines, receipt.evidence.implementationLines)) {
    return { valid: false, reason: "lines-grew-over-ten-percent" };
  }
  if (grewOverTenPercent(current.implementationFileCount, receipt.evidence.implementationFileCount)) {
    return { valid: false, reason: "files-grew-over-ten-percent" };
  }
  return { valid: true, reason: null };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]) {
  return Object.keys(value).sort().join("\0") === [...expected].sort().join("\0");
}

function isIsoTimestamp(value: unknown) {
  return typeof value === "string"
    && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString() === value;
}

export function parseModuleHealthReviewReceipt(value: unknown): ModuleHealthReviewReceipt {
  const receiptKeys = [
    "schemaVersion", "moduleId", "decision", "reviewer", "reason", "reviewedAt", "expiresAt", "evidence",
  ];
  if (!isRecord(value)
    || !exactKeys(value, receiptKeys)
    || value.schemaVersion !== 1
    || typeof value.moduleId !== "string"
    || !value.moduleId.includes("/")
    || !["accepted", "deepen", "split"].includes(String(value.decision))
    || typeof value.reviewer !== "string"
    || value.reviewer.trim().length === 0
    || typeof value.reason !== "string"
    || value.reason.trim().length < 10
    || !isIsoTimestamp(value.reviewedAt)
    || !isIsoTimestamp(value.expiresAt)
    || !isRecord(value.evidence)) {
    throw new Error("[source-code-analysis] invalid module health review receipt");
  }
  const evidenceKeys = [
    "moduleId", "warningCodes", "implementationLines", "implementationFileCount",
    "outgoingLeafDependencyCount", "legacyImplementationBypassCount",
    "referencedByActiveModuleCount", "interfaceDigest", "dependencyDigest", "debtDigest",
  ];
  const evidence = value.evidence;
  const numericFields = [
    "implementationLines", "implementationFileCount", "outgoingLeafDependencyCount",
    "legacyImplementationBypassCount", "referencedByActiveModuleCount",
  ] as const;
  const validWarnings = new Set<ModuleHealthWarningCode>([
    "high-leaf-fan-out",
    "legacy-implementation-bypass",
    "oversized-leaf-files",
    "oversized-leaf-lines",
    "oversized-orchestration",
    "retired-module-referenced",
  ]);
  if (!exactKeys(evidence, evidenceKeys)
    || evidence.moduleId !== value.moduleId
    || !Array.isArray(evidence.warningCodes)
    || evidence.warningCodes.some((code) => typeof code !== "string" || !validWarnings.has(code as ModuleHealthWarningCode))
    || evidence.warningCodes.join("\0") !== [...evidence.warningCodes].sort().join("\0")
    || new Set(evidence.warningCodes).size !== evidence.warningCodes.length
    || numericFields.some((field) => !Number.isSafeInteger(evidence[field]) || Number(evidence[field]) < 0)
    || ["interfaceDigest", "dependencyDigest", "debtDigest"].some((field) =>
      typeof evidence[field] !== "string" || String(evidence[field]).length < 8)) {
    throw new Error("[source-code-analysis] invalid module health review evidence");
  }
  const reviewedAt = Date.parse(String(value.reviewedAt));
  const expiresAt = Date.parse(String(value.expiresAt));
  if (expiresAt <= reviewedAt
    || expiresAt - reviewedAt > MODULE_HEALTH_REVIEW_MAX_AGE_DAYS * 24 * 60 * 60 * 1000) {
    throw new Error("[source-code-analysis] module health review expiry must be within 90 days");
  }
  return value as unknown as ModuleHealthReviewReceipt;
}

export function parseModuleHealthReviewPolicy(value: unknown): ModuleHealthReviewPolicy {
  if (!isRecord(value)
    || !exactKeys(value, ["schemaVersion", "reviews"])
    || value.schemaVersion !== 1
    || !Array.isArray(value.reviews)) {
    throw new Error("[source-code-analysis] invalid module health review policy");
  }
  const reviews = value.reviews.map(parseModuleHealthReviewReceipt);
  const moduleIds = reviews.map((review) => review.moduleId);
  if (new Set(moduleIds).size !== moduleIds.length) {
    throw new Error("[source-code-analysis] duplicate module health review");
  }
  if (moduleIds.join("\0") !== [...moduleIds].sort().join("\0")) {
    throw new Error("[source-code-analysis] module health reviews must be sorted");
  }
  return { schemaVersion: 1, reviews };
}

export async function readModuleHealthReviewPolicy(repositoryRoot: string) {
  return parseModuleHealthReviewPolicy(JSON.parse(await fs.readFile(
    path.join(repositoryRoot, MODULE_HEALTH_REVIEW_POLICY_PATH),
    "utf8",
  )) as unknown);
}
