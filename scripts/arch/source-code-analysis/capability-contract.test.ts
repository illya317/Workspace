import assert from "node:assert/strict";
import test from "node:test";

import type { SourceCapabilityDeclaration } from "./capabilities";
import {
  capabilityContractViolationReason,
  classifyCapabilityContractViolations,
  parseCapabilityContractBaseline,
} from "./capability-contract";

const declarations: SourceCapabilityDeclaration[] = [
  { moduleKey: "finance", key: "entry", kind: "entry", parentKey: null, label: "接入层", include: [], interface: [] },
  { moduleKey: "finance", key: "report-host", kind: "orchestrator", parentKey: null, label: "报表组合", include: [], interface: [] },
  { moduleKey: "finance", key: "ledger", kind: "module", parentKey: null, label: "总账", include: [], interface: [] },
  { moduleKey: "finance", key: "vouchers", kind: "module", parentKey: "ledger", label: "凭证", include: [], interface: [] },
  { moduleKey: "finance", key: "voucher-import", kind: "module", parentKey: "vouchers", label: "凭证导入", include: [], interface: [] },
  {
    moduleKey: "finance",
    key: "statements",
    kind: "module",
    parentKey: null,
    label: "报表",
    include: [],
    interface: [],
  },
];

const file = (capabilityKey: string | null, role: "application" | "assembly" | "contract" | "composition" | "input" | "ui") => ({
  path: `packages/finance/${capabilityKey ?? "root"}/${role}.ts`,
  moduleKey: "finance",
  capabilityKey,
  role,
});

test("recursive contract allows public Interfaces at any depth and blocks cousin Implementation imports", () => {
  assert.equal(capabilityContractViolationReason(
    file("voucher-import", "application"),
    file("statements", "contract"),
    "valueImport",
    declarations,
  ), null);
  assert.equal(capabilityContractViolationReason(
    file("voucher-import", "application"),
    file("statements", "application"),
    "valueImport",
    declarations,
  ), "crossBranchImplementationDependency");
  assert.equal(capabilityContractViolationReason(
    file("voucher-import", "application"),
    file("statements", "application"),
    "valueImport",
    declarations.map((declaration) => declaration.key === "statements"
      ? { ...declaration, interface: [{ kind: "file", path: file("statements", "application").path }] }
      : declaration),
  ), null);
});

test("recursive contract permits ancestor composition but rejects ordinary parent-child implementation shortcuts", () => {
  assert.equal(capabilityContractViolationReason(
    file("entry", "input"),
    file("voucher-import", "application"),
    "valueImport",
    declarations,
  ), null);
  assert.equal(capabilityContractViolationReason(
    file("ledger", "composition"),
    file("voucher-import", "application"),
    "valueImport",
    declarations,
  ), null);
  assert.equal(capabilityContractViolationReason(
    file("ledger", "application"),
    file("voucher-import", "application"),
    "valueImport",
    declarations,
  ), "ancestorImportsDescendantImplementation");
  assert.equal(capabilityContractViolationReason(
    file("voucher-import", "application"),
    file("ledger", "application"),
    "valueImport",
    declarations,
  ), "descendantImportsAncestorImplementation");
});

test("an explicit orchestrator may assemble another Module without making every UI file public", () => {
  assert.equal(capabilityContractViolationReason(
    file("report-host", "ui"),
    file("statements", "application"),
    "valueImport",
    declarations,
  ), null);
  assert.equal(capabilityContractViolationReason(
    file("report-host", "application"),
    file("statements", "application"),
    "valueImport",
    declarations,
  ), "crossBranchImplementationDependency");
});

test("contract debt baseline is exact and rejects duplicate fingerprints", () => {
  const violation = {
    sourcePath: "packages/finance/a.ts",
    targetPath: "packages/finance/b.ts",
    kind: "valueImport" as const,
    reason: "crossBranchImplementationDependency" as const,
    occurrences: 1,
  };
  assert.deepEqual(parseCapabilityContractBaseline({ schemaVersion: 1, legacyViolations: [violation] }), {
    schemaVersion: 1,
    legacyViolations: [violation],
  });
  assert.throws(() => parseCapabilityContractBaseline({ schemaVersion: 1, legacyViolations: [violation, violation] }), /duplicate/);
});

test("contract debt baseline rejects both new edges and extra occurrences while requiring decreases to ratchet", () => {
  const violation = {
    sourcePath: "packages/finance/a.ts",
    sourceModuleKey: "finance",
    sourceCapabilityKey: "ledger",
    sourceRole: "application" as const,
    targetPath: "packages/finance/b.ts",
    targetModuleKey: "finance",
    targetCapabilityKey: "statements",
    targetRole: "application" as const,
    kind: "valueImport" as const,
    reason: "crossBranchImplementationDependency" as const,
  };
  const oneAllowed = { schemaVersion: 1 as const, legacyViolations: [{
    sourcePath: violation.sourcePath,
    targetPath: violation.targetPath,
    kind: violation.kind,
    reason: violation.reason,
    occurrences: 1,
  }] };
  const expanded = classifyCapabilityContractViolations([violation, violation], oneAllowed);
  assert.equal(expanded.legacy.length, 1);
  assert.equal(expanded.added.length, 1);
  assert.equal(expanded.stale.length, 0);

  const decreased = classifyCapabilityContractViolations([violation], {
    schemaVersion: 1,
    legacyViolations: [{ ...oneAllowed.legacyViolations[0], occurrences: 2 }],
  });
  assert.equal(decreased.added.length, 0);
  assert.equal(decreased.stale.length, 1);
});
