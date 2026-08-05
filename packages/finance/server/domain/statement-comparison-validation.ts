import {
  failCommand,
  okCommand,
  type DomainValidationResult,
} from "@workspace/platform/server/domain-validation";

/**
 * 报表对比证据导入的 domain 校验（写入链路第二层：业务可写字段、跨字段规则）。
 * 不含 Prisma/DB 访问；service 在任何写入前调用这里的校验器。
 * 安全包线校验（ZIP/XXE/宏）在 comparison/preflight，这里只管业务形状。
 */

/** service 侧把校验失败转成这个错误（业务形状 400，区别于状态机 StatementComparisonStateError）。 */
export class StatementComparisonValidationError extends Error {
  readonly name = "StatementComparisonValidationError";
}

function positiveInteger(value: number) {
  return Number.isSafeInteger(value) && value > 0;
}

interface LineMappingLike {
  status: string;
  lineCode: string | null;
}

interface StructureMappingLike {
  reportType: string;
  sheetName: string;
}

/** 上传命令的业务字段校验。 */
export function validateComparisonUploadCommand(input: {
  fileName: string;
  fileSize: number;
  uploadedBy: number;
}): DomainValidationResult<typeof input> {
  if (!input.fileName.trim()) return failCommand("文件名不能为空", 400, "fileName");
  if (!positiveInteger(input.fileSize)) return failCommand("文件大小不合法", 400, "fileSize");
  if (!positiveInteger(input.uploadedBy)) return failCommand("上传人不合法", 400, "uploadedBy");
  return okCommand(input);
}

/** mapping 确认/重确认：歧义/重复行必须先人工处置；确认时目标报表类型必须一致。 */
export function validateComparisonMappingConfirmation(input: {
  structureMapping: StructureMappingLike;
  lineMapping: readonly LineMappingLike[];
  targetReportType?: string;
}): DomainValidationResult<typeof input> {
  if (!input.structureMapping.sheetName.trim()) {
    return failCommand("映射缺少来源 sheet", 400, "structureMapping.sheetName");
  }
  if (input.targetReportType !== undefined && input.structureMapping.reportType !== input.targetReportType) {
    return failCommand("映射报表类型与对比目标不一致", 400, "structureMapping.reportType");
  }
  if (input.lineMapping.length === 0) return failCommand("行映射不能为空", 400, "lineMapping");
  const unresolved = input.lineMapping.filter(
    (line) => line.status === "ambiguous" || line.status === "duplicate",
  );
  if (unresolved.length > 0) {
    return failCommand(`仍有 ${unresolved.length} 行映射处于歧义/重复状态，必须先人工确认`, 400, "lineMapping");
  }
  return okCommand(input);
}

/** 建 run 命令的业务字段校验。 */
export function validateComparisonRunCommand(input: {
  mappingId: number;
  createdBy: number;
}): DomainValidationResult<typeof input> {
  if (!positiveInteger(input.mappingId)) return failCommand("映射标识不合法", 400, "mappingId");
  if (!positiveInteger(input.createdBy)) return failCommand("创建人不合法", 400, "createdBy");
  return okCommand(input);
}

export interface ComparisonRunLineValidationShape {
  lineCode: string;
  sourceSheet: string | null;
  sourceCell: string | null;
}

/** run 行写入：lineCode/sourceCell 唯一性先于数据库唯一约束给出业务错误。 */
export function validateComparisonRunLines(
  lines: readonly ComparisonRunLineValidationShape[],
): DomainValidationResult<readonly ComparisonRunLineValidationShape[]> {
  if (lines.length === 0) return failCommand("对比运行行不能为空", 400, "lines");
  const lineCodes = new Set<string>();
  const sourceCells = new Set<string>();
  for (const line of lines) {
    if (!line.lineCode.trim()) return failCommand("报表行 code 不能为空", 400, "lineCode");
    if (lineCodes.has(line.lineCode)) {
      return failCommand(`报表行 ${line.lineCode} 在本次运行中重复`, 400, "lineCode");
    }
    lineCodes.add(line.lineCode);
    if (line.sourceSheet !== null && line.sourceCell !== null) {
      const key = `${line.sourceSheet}!${line.sourceCell}`;
      if (sourceCells.has(key)) {
        return failCommand(`来源单元格 ${key} 在本次运行中重复`, 400, "sourceCell");
      }
      sourceCells.add(key);
    }
  }
  return okCommand(lines);
}

/** run 失败登记命令的业务字段校验。 */
export function validateComparisonRunFailure(input: {
  runId: number;
  failureCode: string;
}): DomainValidationResult<typeof input> {
  if (!positiveInteger(input.runId)) return failCommand("对比运行标识不合法", 400, "runId");
  if (!input.failureCode.trim()) return failCommand("失败代码不能为空", 400, "failureCode");
  return okCommand(input);
}

/** CAS 失效命令的业务字段校验。 */
export function validateComparisonMappingRevision(input: {
  mappingId: number;
  expectedRevision: number;
}): DomainValidationResult<typeof input> {
  if (!positiveInteger(input.mappingId)) return failCommand("映射标识不合法", 400, "mappingId");
  if (!positiveInteger(input.expectedRevision)) {
    return failCommand("映射 revision 不合法", 400, "expectedRevision");
  }
  return okCommand(input);
}

/** 证据包归档命令的业务字段校验。 */
export function validateComparisonPackageArchive(input: {
  packageId: number;
  archivedBy: number;
}): DomainValidationResult<typeof input> {
  if (!positiveInteger(input.packageId)) return failCommand("证据包标识不合法", 400, "packageId");
  if (!positiveInteger(input.archivedBy)) return failCommand("归档操作人不合法", 400, "archivedBy");
  return okCommand(input);
}
