import assert from "node:assert/strict";
import test from "node:test";

import {
  authoritativeLibraryArtifactSchema,
  authoritativeLibraryArtifactsSchema,
  decodeAuthoritativeLibraryContent,
  encodeAuthoritativeLibraryContent,
} from "./authoritative-library-source-contract";

test("authoritative Library artifact preserves binary content and provenance", () => {
  const content = Buffer.from([0, 1, 2, 127, 255]);
  const artifact = authoritativeLibraryArtifactSchema.parse({
    sourceKey: "finance-report",
    ownerUnitId: "finance",
    identityKey: "latest-verified-financial-statements",
    title: "已验证财务报表",
    summary: "来源于已发布批次",
    fileName: "财务报表.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    extension: "xlsx",
    contentBase64: encodeAuthoritativeLibraryContent(content),
    asOfDate: "2025-12-31",
    verifiedAt: "2026-07-21T04:07:30.024Z",
    evidence: ["FinanceConsolidationBatch#1:published"],
  });

  assert.deepEqual(decodeAuthoritativeLibraryContent(artifact), content);
});

test("authoritative Library source may return multiple independently versioned artifacts", () => {
  const base = {
    sourceKey: "finance-report",
    ownerUnitId: "finance",
    summary: "2025.12 财务报表。",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    extension: "xlsx",
    contentBase64: "AA==",
    asOfDate: "2025-12-31",
    verifiedAt: "2026-07-21T04:07:30.024Z",
    evidence: ["FinanceConsolidationBatch#1:published"],
  };
  const artifacts = authoritativeLibraryArtifactsSchema.parse([
    { ...base, identityKey: "standalone-01", title: "01 单体财务报表", fileName: "01-单体.xlsx" },
    { ...base, identityKey: "consolidated", title: "合并财务报表", fileName: "合并.xlsx" },
  ]);

  assert.equal(artifacts.length, 2);
  assert.notEqual(artifacts[0]?.identityKey, artifacts[1]?.identityKey);
});

test("authoritative Library artifact rejects an invalid cutoff date", () => {
  assert.equal(authoritativeLibraryArtifactSchema.safeParse({
    sourceKey: "organization-chart",
    ownerUnitId: "hr",
    identityKey: "current-organization-chart",
    title: "组织架构",
    summary: "Workspace HR",
    fileName: "组织架构.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    extension: "xlsx",
    contentBase64: "AA==",
    asOfDate: "2026-02-31",
    verifiedAt: "2026-07-26T00:00:00.000Z",
    evidence: ["Department:active"],
  }).success, false);
});
