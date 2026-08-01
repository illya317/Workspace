import { promises as fs } from "node:fs";
import path from "node:path";

import {
  SOURCE_CODE_ANALYSIS_CAPABILITY_CONTRACT_REASONS,
  SOURCE_CODE_ANALYSIS_DEPENDENCY_KINDS,
  type SourceCodeAnalysisCapabilityContractReason,
  type SourceCodeAnalysisCapabilityContractViolation,
  type SourceCodeAnalysisDependencyKind,
  type SourceCodeAnalysisRole,
} from "../../../packages/platform/source-code-analysis-contract";
import {
  SOURCE_CAPABILITY_DECLARATIONS,
  matchesCapabilityRule,
  sourceCapabilityDeclarationId,
  type SourceCapabilityDeclaration,
} from "./capabilities";

export const CAPABILITY_CONTRACT_BASELINE_PATH =
  "scripts/arch/source-code-analysis/capability-contract-baseline.json";

interface CapabilityContractFile {
  path: string;
  moduleKey: string;
  capabilityKey?: string | null;
  role: SourceCodeAnalysisRole;
}

export interface CapabilityContractBaseline {
  schemaVersion: 1;
  legacyViolations: Array<Pick<
    SourceCodeAnalysisCapabilityContractViolation,
    "sourcePath" | "targetPath" | "kind" | "reason"
  > & { occurrences: number }>;
}

const ROOT_COMPOSITION_ROLES = new Set<SourceCodeAnalysisRole>(["composition", "assembly", "ui", "input"]);
const PUBLIC_INTERFACE_ROLES = new Set<SourceCodeAnalysisRole>(["contract", "assembly"]);

function declarationMap(declarations: readonly SourceCapabilityDeclaration[]) {
  return new Map(declarations.map((declaration) => [sourceCapabilityDeclarationId(declaration), declaration]));
}

function parentKey(
  moduleKey: string,
  capabilityKey: string | null,
  declarations: ReadonlyMap<string, SourceCapabilityDeclaration>,
) {
  if (capabilityKey === null) return null;
  return declarations.get(`${moduleKey}\0${capabilityKey}`)?.parentKey ?? null;
}

function isAncestor(
  moduleKey: string,
  possibleAncestorKey: string | null,
  descendantKey: string | null,
  declarations: ReadonlyMap<string, SourceCapabilityDeclaration>,
) {
  if (descendantKey === possibleAncestorKey) return false;
  if (possibleAncestorKey === null) return descendantKey !== null;
  let cursor = descendantKey;
  while (cursor !== null) {
    cursor = parentKey(moduleKey, cursor, declarations);
    if (cursor === possibleAncestorKey) return true;
  }
  return false;
}

/**
 * Recursive dependency policy:
 * - imports inside one node are internal Implementation;
 * - cross-branch and child-to-ancestor imports may only target a contract role
 *   (the public Interface/Seam);
 * - an ancestor may compose descendants only from a composition boundary.
 */
export function capabilityContractViolationReason(
  source: CapabilityContractFile,
  target: CapabilityContractFile,
  _kind: SourceCodeAnalysisDependencyKind,
  declarations: readonly SourceCapabilityDeclaration[] = SOURCE_CAPABILITY_DECLARATIONS,
): SourceCodeAnalysisCapabilityContractReason | null {
  if (source.moduleKey !== target.moduleKey) return null;
  if (source.capabilityKey === target.capabilityKey) return null;
  if (source.role === "test" || source.role === "tooling" || target.role === "test") return null;
  if (PUBLIC_INTERFACE_ROLES.has(target.role)) return null;

  const byId = declarationMap(declarations);
  const sourceKey = source.capabilityKey ?? null;
  const targetKey = target.capabilityKey ?? null;
  const targetDeclaration = targetKey === null ? null : byId.get(`${target.moduleKey}\0${targetKey}`);
  if (targetDeclaration?.interface.some((rule) => matchesCapabilityRule(target.path, rule))) return null;
  const sourceDeclaration = sourceKey === null ? null : byId.get(`${source.moduleKey}\0${sourceKey}`);
  if (sourceDeclaration?.kind === "entry" && ROOT_COMPOSITION_ROLES.has(source.role)) return null;
  if (isAncestor(source.moduleKey, sourceKey, targetKey, byId)) {
    return ROOT_COMPOSITION_ROLES.has(source.role) ? null : "ancestorImportsDescendantImplementation";
  }
  if (isAncestor(source.moduleKey, targetKey, sourceKey, byId)) {
    return "descendantImportsAncestorImplementation";
  }
  return "crossBranchImplementationDependency";
}

export function capabilityContractViolationFingerprint(
  violation: Pick<SourceCodeAnalysisCapabilityContractViolation, "sourcePath" | "targetPath" | "kind" | "reason">,
) {
  return [violation.sourcePath, violation.targetPath, violation.kind, violation.reason].join("\0");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function parseCapabilityContractBaseline(parsed: unknown): CapabilityContractBaseline {
  if (!isRecord(parsed) || parsed.schemaVersion !== 1 || !Array.isArray(parsed.legacyViolations)) {
    throw new Error("[source-code-analysis] invalid capability contract baseline");
  }
  if (Object.keys(parsed).sort().join("\0") !== ["legacyViolations", "schemaVersion"].sort().join("\0")) {
    throw new Error("[source-code-analysis] capability contract baseline has unknown top-level keys");
  }
  const legacyViolations = parsed.legacyViolations.map((value) => {
    if (!isRecord(value)
      || typeof value.sourcePath !== "string"
      || typeof value.targetPath !== "string"
      || typeof value.kind !== "string"
      || !SOURCE_CODE_ANALYSIS_DEPENDENCY_KINDS.includes(value.kind as SourceCodeAnalysisDependencyKind)
      || typeof value.reason !== "string"
      || !SOURCE_CODE_ANALYSIS_CAPABILITY_CONTRACT_REASONS.includes(
        value.reason as SourceCodeAnalysisCapabilityContractReason,
      )
      || typeof value.occurrences !== "number"
      || !Number.isInteger(value.occurrences)
      || value.occurrences <= 0) {
      throw new Error("[source-code-analysis] invalid capability contract baseline violation");
    }
    if (Object.keys(value).sort().join("\0") !== ["kind", "occurrences", "reason", "sourcePath", "targetPath"].sort().join("\0")) {
      throw new Error("[source-code-analysis] capability contract baseline violation has unknown keys");
    }
    return value as CapabilityContractBaseline["legacyViolations"][number];
  });
  const fingerprints = legacyViolations.map(capabilityContractViolationFingerprint);
  if (new Set(fingerprints).size !== fingerprints.length) {
    throw new Error("[source-code-analysis] duplicate capability contract baseline violation");
  }
  if (fingerprints.join("\n") !== [...fingerprints].sort().join("\n")) {
    throw new Error("[source-code-analysis] capability contract baseline must be sorted");
  }
  return { schemaVersion: 1, legacyViolations };
}

export function classifyCapabilityContractViolations(
  violations: readonly SourceCodeAnalysisCapabilityContractViolation[],
  baseline: CapabilityContractBaseline,
) {
  const baselineByFingerprint = new Map(baseline.legacyViolations.map((violation) => [
    capabilityContractViolationFingerprint(violation),
    violation,
  ]));
  const currentOccurrences = new Map<string, number>();
  const legacy: SourceCodeAnalysisCapabilityContractViolation[] = [];
  const added: SourceCodeAnalysisCapabilityContractViolation[] = [];
  for (const violation of violations) {
    const fingerprint = capabilityContractViolationFingerprint(violation);
    const occurrence = (currentOccurrences.get(fingerprint) ?? 0) + 1;
    currentOccurrences.set(fingerprint, occurrence);
    const allowedOccurrences = baselineByFingerprint.get(fingerprint)?.occurrences ?? 0;
    (occurrence <= allowedOccurrences ? legacy : added).push(violation);
  }
  const stale = baseline.legacyViolations.filter((violation) =>
    (currentOccurrences.get(capabilityContractViolationFingerprint(violation)) ?? 0) < violation.occurrences);
  return { legacy, added, stale };
}

export async function readCapabilityContractBaseline(repositoryRoot: string) {
  return parseCapabilityContractBaseline(JSON.parse(await fs.readFile(
    path.join(repositoryRoot, CAPABILITY_CONTRACT_BASELINE_PATH),
    "utf8",
  )) as unknown);
}
