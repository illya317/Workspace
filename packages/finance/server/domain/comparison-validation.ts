import {
  failCommand,
  okCommand,
  type DomainValidationResult,
} from "@workspace/platform/server/domain-validation";
import type { AmountOriginQuery } from "@workspace/finance/types/statement-explanation";

/**
 * 报表对比证据的领域校验（Package 6）。
 * Zod envelope 留在 route 接缝（statements/comparison/route-commands.ts）；
 * 这里只做已解析输入的命令归一与业务规则（remap 必须 CAS、confirm 必须带目标、
 * 标识正整数），保持 service 之前的一致校验口径。
 */

export interface ComparisonTargetRefEntityInput {
  kind: "entity";
  companyId: number;
  year: number;
  month: number;
  periodKind: "monthly" | "cumulative";
  reportType: "balance" | "income" | "cashflow";
  targetFingerprint: string;
}

export interface ComparisonTargetRefConsolidatedInput {
  kind: "consolidated";
  parentCompanyId: number;
  batchId: number;
  outputSnapshotId: number;
  reportType: "balance" | "income" | "cashflow";
  targetFingerprint: string;
}

export type ComparisonTargetRefInput =
  | ComparisonTargetRefEntityInput
  | ComparisonTargetRefConsolidatedInput;

export interface ComparisonAmountColumnInput {
  col: number;
  headerText: string | null;
}

export interface ComparisonStructureMappingInput {
  sheetName: string;
  sheetIndex: number;
  visibility: "visible" | "hidden" | "veryHidden";
  reportType: "balance" | "income" | "cashflow";
  score: number;
  headerRow: number | null;
  labelColumn: number;
  blockStartRow: number;
  blockEndRow: number;
  amountColumns: ComparisonAmountColumnInput[];
  mergedHeader: boolean;
}

export interface ComparisonLineMappingInput {
  label: string;
  normalizedLabel: string;
  row: number;
  labelCell: string;
  status: "auto_accepted" | "ambiguous" | "duplicate" | "unmatched";
  lineCode: string | null;
  candidates: string[];
  amountCells: string[];
}

export interface SaveComparisonMappingInput {
  /** 提供即 remap（必须带 expectedRevision CAS）；缺省即对证据包首次确认。 */
  mappingId?: number | undefined;
  expectedRevision?: number | undefined;
  target?: ComparisonTargetRefInput | undefined;
  structureMapping: ComparisonStructureMappingInput;
  lineMapping: ComparisonLineMappingInput[];
}

export type SaveComparisonMappingCommand =
  | {
      mode: "confirm";
      packageId: number;
      target: ComparisonTargetRefInput;
      structureMapping: ComparisonStructureMappingInput;
      lineMapping: ComparisonLineMappingInput[];
      confirmedBy: number;
    }
  | {
      mode: "remap";
      mappingId: number;
      expectedRevision: number;
      structureMapping: ComparisonStructureMappingInput;
      lineMapping: ComparisonLineMappingInput[];
      confirmedBy: number;
    };

export function buildSaveComparisonMappingCommand(input: {
  packageId: number;
  body: SaveComparisonMappingInput;
  userId: number;
}): DomainValidationResult<SaveComparisonMappingCommand> {
  const { body } = input;
  if (body.mappingId !== undefined) {
    if (body.expectedRevision === undefined) {
      return failCommand("重确认映射必须携带 expectedRevision", 400, "expectedRevision");
    }
    return okCommand({
      mode: "remap",
      mappingId: body.mappingId,
      expectedRevision: body.expectedRevision,
      structureMapping: body.structureMapping,
      lineMapping: body.lineMapping,
      confirmedBy: input.userId,
    });
  }
  if (body.expectedRevision !== undefined) {
    return failCommand("首次确认映射不接受 expectedRevision", 400, "expectedRevision");
  }
  if (!body.target) return failCommand("首次确认映射必须携带对比目标 target", 400, "target");
  return okCommand({
    mode: "confirm",
    packageId: input.packageId,
    target: body.target,
    structureMapping: body.structureMapping,
    lineMapping: body.lineMapping,
    confirmedBy: input.userId,
  });
}

export interface CreateComparisonRunCommand {
  mappingId: number;
  createdBy: number;
}

export function buildCreateComparisonRunCommand(input: {
  mappingId: number;
  userId: number;
}): DomainValidationResult<CreateComparisonRunCommand> {
  if (!Number.isSafeInteger(input.mappingId) || input.mappingId <= 0) {
    return failCommand("映射标识不合法", 400, "mappingId");
  }
  return okCommand({ mappingId: input.mappingId, createdBy: input.userId });
}

export interface ArchiveComparisonPackageCommand {
  packageId: number;
  archivedBy: number;
}

export function buildArchiveComparisonPackageCommand(input: {
  packageId: number;
  userId: number;
}): DomainValidationResult<ArchiveComparisonPackageCommand> {
  if (!Number.isSafeInteger(input.packageId) || input.packageId <= 0) {
    return failCommand("证据包标识不合法", 400, "packageId");
  }
  return okCommand({ packageId: input.packageId, archivedBy: input.userId });
}

export function buildAmountOriginQueryCommand(input: {
  body: AmountOriginQuery;
}): DomainValidationResult<AmountOriginQuery> {
  return okCommand(input.body);
}
