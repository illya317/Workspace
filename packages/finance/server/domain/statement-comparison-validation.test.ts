import assert from "node:assert/strict";
import test from "node:test";

import {
  validateComparisonMappingConfirmation,
  validateComparisonMappingRevision,
  validateComparisonPackageArchive,
  validateComparisonRunCommand,
  validateComparisonRunFailure,
  validateComparisonRunLines,
  validateComparisonUploadCommand,
} from "./statement-comparison-validation";

const structure = { reportType: "balance", sheetName: "报表一" };
const confirmedLine = { status: "auto_accepted", lineCode: "cash" };

test("上传命令：缺文件大小/上传人即失败", () => {
  assert.equal(validateComparisonUploadCommand({ fileName: "a.xlsx", fileSize: 10, uploadedBy: 1 }).ok, true);
  assert.equal(validateComparisonUploadCommand({ fileName: " ", fileSize: 10, uploadedBy: 1 }).ok, false);
  assert.equal(validateComparisonUploadCommand({ fileName: "a.xlsx", fileSize: 0, uploadedBy: 1 }).ok, false);
  assert.equal(validateComparisonUploadCommand({ fileName: "a.xlsx", fileSize: 10, uploadedBy: 0 }).ok, false);
});

test("mapping 确认：歧义行/类型不一致/空行映射被拒绝", () => {
  assert.equal(
    validateComparisonMappingConfirmation({
      structureMapping: structure,
      lineMapping: [confirmedLine],
      targetReportType: "balance",
    }).ok,
    true,
  );
  const ambiguous = validateComparisonMappingConfirmation({
    structureMapping: structure,
    lineMapping: [{ status: "ambiguous", lineCode: null }],
    targetReportType: "balance",
  });
  assert.equal(ambiguous.ok, false);
  const mismatch = validateComparisonMappingConfirmation({
    structureMapping: structure,
    lineMapping: [confirmedLine],
    targetReportType: "income",
  });
  assert.equal(mismatch.ok, false);
  assert.equal(
    validateComparisonMappingConfirmation({ structureMapping: structure, lineMapping: [] }).ok,
    false,
  );
  // remap 场景不传 targetReportType：不校验类型一致性。
  assert.equal(
    validateComparisonMappingConfirmation({
      structureMapping: { reportType: "income", sheetName: "报表一" },
      lineMapping: [confirmedLine],
    }).ok,
    true,
  );
});

test("run 行：lineCode/sourceCell 重复先于唯一约束", () => {
  const line = { lineCode: "cash", sourceSheet: "报表一", sourceCell: "B2" };
  assert.equal(validateComparisonRunLines([line]).ok, true);
  assert.equal(validateComparisonRunLines([]).ok, false);
  assert.equal(validateComparisonRunLines([line, { ...line, sourceCell: "C2" }]).ok, false);
  assert.equal(validateComparisonRunLines([line, { ...line, lineCode: "ar" }]).ok, false);
  assert.equal(validateComparisonRunLines([{ ...line, lineCode: " " }]).ok, false);
  // 系统侧缺失行（无来源单元格）不参与 sourceCell 唯一性。
  assert.equal(
    validateComparisonRunLines([
      { lineCode: "cash", sourceSheet: null, sourceCell: null },
      { lineCode: "ar", sourceSheet: null, sourceCell: null },
    ]).ok,
    true,
  );
});

test("run/失效/归档命令的标识字段校验", () => {
  assert.equal(validateComparisonRunCommand({ mappingId: 1, createdBy: 1 }).ok, true);
  assert.equal(validateComparisonRunCommand({ mappingId: 0, createdBy: 1 }).ok, false);
  assert.equal(validateComparisonRunFailure({ runId: 1, failureCode: "x" }).ok, true);
  assert.equal(validateComparisonRunFailure({ runId: 1, failureCode: " " }).ok, false);
  assert.equal(validateComparisonMappingRevision({ mappingId: 1, expectedRevision: 1 }).ok, true);
  assert.equal(validateComparisonMappingRevision({ mappingId: 1, expectedRevision: 0 }).ok, false);
  assert.equal(validateComparisonPackageArchive({ packageId: 1, archivedBy: 1 }).ok, true);
  assert.equal(validateComparisonPackageArchive({ packageId: -1, archivedBy: 1 }).ok, false);
  assert.equal(validateComparisonPackageArchive({ packageId: 1, archivedBy: 0 }).ok, false);
});
