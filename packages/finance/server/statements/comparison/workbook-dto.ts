import type {
  WorkbookDiagnostic,
  WorkbookScalarValue,
  WorkbookTraceResult,
  WorkbookTracedCell,
} from "@workspace/platform/formula";

import { canonicalFingerprint } from "../amount-explanation/fingerprint";

/**
 * 归一化 workbook DTO（计划 §5.3）。
 *
 * - DTO 版本化（WORKBOOK_DTO_VERSION），形状变化必须升版本。
 * - cells 保留 address/type/raw value/formatted text/cached value/formula/number format；
 *   cached 与 recalculated 是两个独立通道，重算值只出现在 recalculation channel，
 *   绝不写回 cached（mismatch 是证据，不是自动更正）。
 * - warnings 与 unsupported structures 显式记录，不静默丢弃。
 */

export const WORKBOOK_DTO_VERSION = 1;

export interface WorkbookFileIdentity {
  fileName: string;
  mimeType: string;
  fileSize: number;
  /** 原始字节 SHA-256（hex），证据身份指纹。 */
  sha256: string;
}

export interface WorkbookCellDto {
  /** A1 地址（不带 sheet 前缀）。 */
  a1: string;
  /** 0-based 行/列。 */
  row: number;
  col: number;
  /** SheetJS 单元格类型：n/s/b/str/e/d 等原样保留。 */
  type: string;
  /** 原始值（JSON-safe scalar；不可序列化的值已降级为字符串并记 warning）。 */
  value: WorkbookScalarValue;
  /** SheetJS 格式化文本（.w），仅展示用途，绝不用于金额比较。 */
  text: string | null;
  /** 原公式文本（不含前导 =）。 */
  formula: string | null;
  /** 源 workbook 缓存值（仅公式单元格；undefined = 未提供）。 */
  cachedValue?: WorkbookScalarValue;
  numberFormat: string | null;
}

export interface WorkbookMergeRangeDto {
  s: { r: number; c: number };
  e: { r: number; c: number };
}

export type WorkbookSheetVisibility = "visible" | "hidden" | "veryHidden";

export interface WorkbookSheetDto {
  name: string;
  index: number;
  visibility: WorkbookSheetVisibility;
  /** SheetJS !ref（如 "A1:C10"），空 sheet 为 null。 */
  usedRange: string | null;
  merges: WorkbookMergeRangeDto[];
  mergesTruncated: boolean;
  cells: WorkbookCellDto[];
}

export interface WorkbookNamedRangeDto {
  name: string;
  ref: string;
}

export interface WorkbookCalculationMetadataDto {
  mode: string | null;
  fullCalcOnLoad: boolean | null;
}

export interface WorkbookParseScanDto {
  sheetCount: number;
  cellCount: number;
  formulaCellCount: number;
  /** preflight 拒绝外部链接后 parse 复核仍为 0；任何残留都会 fail closed 而非出现在这里。 */
  rejectedExternalLinks: number;
  warnings: string[];
  unsupported: string[];
}

/** worker 解析产物（不含宿主侧文件身份）。 */
export interface ParsedWorkbookPayload {
  parser: { id: string; version: string };
  calculation: WorkbookCalculationMetadataDto;
  namedRanges: WorkbookNamedRangeDto[];
  sheets: WorkbookSheetDto[];
  scan: WorkbookParseScanDto;
}

/** 版本化归一化 workbook DTO（计划 §5.3 完整形状）。 */
export interface NormalizedWorkbookDto {
  version: typeof WORKBOOK_DTO_VERSION;
  file: WorkbookFileIdentity;
  /** 归一化内容（sheet 清单 + cells + named ranges + scan）的 SHA-256 指纹。 */
  workbookFingerprint: string;
  parser: { id: string; version: string };
  calculation: WorkbookCalculationMetadataDto;
  namedRanges: WorkbookNamedRangeDto[];
  sheets: WorkbookSheetDto[];
  scan: WorkbookParseScanDto;
}

/** 重算通道：由 Platform workbook 公式适配器单独产出，与 cached 并存。 */
export interface WorkbookRecalculatedCellDto {
  formula: string | null;
  cachedValue: WorkbookScalarValue;
  cachedValueProvided: boolean;
  recalculatedValue: WorkbookScalarValue;
  recalculatedError: { type: string; message: string } | null;
  evaluation: string;
  trust: string;
  /** A1（跨 sheet 时为 "Sheet!A1"）地址，按预算展开。 */
  precedents: string[];
  dependents: string[];
  unsupportedFeatures: string[];
}

export interface WorkbookRecalculationChannel {
  adapterId: string;
  adapterVersion: string;
  truncated: boolean;
  /** host 侧适配器调用失败时记录为 error，不让证据静默缺失。 */
  adapterError: string | null;
  /** key 为 "Sheet!A1"。 */
  cells: Record<string, WorkbookRecalculatedCellDto>;
  diagnostics: WorkbookDiagnostic[];
  stats: { visitedNodes: number; maxDepthReached: number; edgeCount: number };
}

/** 入库的归一化 workbook 快照：DTO + 独立重算通道。 */
export interface WorkbookAnalysisSnapshot {
  dto: NormalizedWorkbookDto;
  recalculation: WorkbookRecalculationChannel;
}

export function cellChannelKey(sheet: string, a1: string): string {
  return `${sheet}!${a1}`;
}

/** 由 worker 产物组装版本化 DTO，并计算归一化内容指纹。 */
export function buildNormalizedWorkbookDto(
  file: WorkbookFileIdentity,
  payload: ParsedWorkbookPayload,
): NormalizedWorkbookDto {
  const workbookFingerprint = canonicalFingerprint(payload);
  return { version: WORKBOOK_DTO_VERSION, file, workbookFingerprint, ...payload };
}

function tracedCellToDto(cell: WorkbookTracedCell): [string, WorkbookRecalculatedCellDto] {
  const addressToKey = (address: { sheet: string; row: number; col: number }): string =>
    formatAddress(address.sheet, address.row, address.col);
  return [
    formatAddress(cell.address.sheet, cell.address.row, cell.address.col),
    {
      formula: cell.formula,
      cachedValue: cell.cachedValue,
      cachedValueProvided: cell.cachedValueProvided,
      recalculatedValue: cell.recalculatedValue,
      recalculatedError: cell.recalculatedError,
      evaluation: cell.evaluation,
      trust: cell.trust,
      precedents: cell.precedents.map(addressToKey),
      dependents: cell.dependents.map(addressToKey),
      unsupportedFeatures: [...cell.unsupportedFeatures],
    },
  ];
}

function formatAddress(sheet: string, row: number, col: number): string {
  return `${sheet}!${columnLabel(col)}${row + 1}`;
}

function columnLabel(col: number): string {
  let value = col + 1;
  let label = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    value = Math.floor((value - 1) / 26);
  }
  return label;
}

/** 把 Platform 适配器的 trace 结果组装为独立重算通道（cached/recalculated 双通道）。 */
export function buildRecalculationChannel(trace: WorkbookTraceResult): WorkbookRecalculationChannel {
  const cells: Record<string, WorkbookRecalculatedCellDto> = {};
  for (const cell of trace.cells) {
    const [key, dto] = tracedCellToDto(cell);
    cells[key] = dto;
  }
  return {
    adapterId: trace.adapterId,
    adapterVersion: trace.adapterVersion,
    truncated: trace.truncated,
    adapterError: null,
    cells,
    diagnostics: [...trace.diagnostics],
    stats: { ...trace.stats },
  };
}

/** 适配器调用失败时的显式错误通道（不是静默缺失）。 */
export function failedRecalculationChannel(adapterId: string, adapterVersion: string, message: string): WorkbookRecalculationChannel {
  return {
    adapterId,
    adapterVersion,
    truncated: false,
    adapterError: message,
    cells: {},
    diagnostics: [],
    stats: { visitedNodes: 0, maxDepthReached: 0, edgeCount: 0 },
  };
}

// ─── worker 产物的运行时形状校验（fail closed）─────────────────────

export class WorkbookDtoValidationError extends Error {
  readonly name = "WorkbookDtoValidationError";
}

function isScalar(value: unknown): value is WorkbookScalarValue {
  return value === null || ["number", "string", "boolean"].includes(typeof value);
}

function requireRecord(value: unknown, what: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new WorkbookDtoValidationError(`${what} 必须是对象`);
  }
  return value as Record<string, unknown>;
}

function requireString(value: unknown, what: string): string {
  if (typeof value !== "string") throw new WorkbookDtoValidationError(`${what} 必须是字符串`);
  return value;
}

function requireInteger(value: unknown, what: string): number {
  if (!Number.isInteger(value)) throw new WorkbookDtoValidationError(`${what} 必须是整数`);
  return value as number;
}

function optionalString(value: unknown, what: string): string | null {
  if (value === null || value === undefined) return null;
  return requireString(value, what);
}

function validateCell(value: unknown, sheetName: string): WorkbookCellDto {
  const record = requireRecord(value, `sheet ${sheetName} 的 cell`);
  const cell: WorkbookCellDto = {
    a1: requireString(record.a1, "cell.a1"),
    row: requireInteger(record.row, "cell.row"),
    col: requireInteger(record.col, "cell.col"),
    type: requireString(record.type, "cell.type"),
    value: isScalar(record.value) ? record.value : null,
    text: optionalString(record.text, "cell.text"),
    formula: optionalString(record.formula, "cell.formula"),
    numberFormat: optionalString(record.numberFormat, "cell.numberFormat"),
  };
  if (!isScalar(record.value)) {
    throw new WorkbookDtoValidationError(`cell ${sheetName}!${cell.a1} 的 value 不是 JSON scalar`);
  }
  if (record.cachedValue !== undefined) {
    if (!isScalar(record.cachedValue)) {
      throw new WorkbookDtoValidationError(`cell ${sheetName}!${cell.a1} 的 cachedValue 不是 JSON scalar`);
    }
    cell.cachedValue = record.cachedValue;
  }
  return cell;
}

/** 校验 worker 返回的解析产物形状；任何漂移都 fail closed（不信任 worker 输出）。 */
export function validateParsedWorkbookPayload(value: unknown): ParsedWorkbookPayload {
  const record = requireRecord(value, "worker 解析产物");
  const parser = requireRecord(record.parser, "parser");
  const calculation = requireRecord(record.calculation, "calculation");
  const scan = requireRecord(record.scan, "scan");
  if (!Array.isArray(record.sheets)) {
    throw new WorkbookDtoValidationError("sheets 必须是数组");
  }
  const sheets: WorkbookSheetDto[] = record.sheets.map((sheetValue) => {
    const sheet = requireRecord(sheetValue, "sheet");
    const name = requireString(sheet.name, "sheet.name");
    const visibility = sheet.visibility;
    if (visibility !== "visible" && visibility !== "hidden" && visibility !== "veryHidden") {
      throw new WorkbookDtoValidationError(`sheet ${name} 的 visibility 非法`);
    }
    if (!Array.isArray(sheet.cells)) {
      throw new WorkbookDtoValidationError(`sheet ${name} 的 cells 必须是数组`);
    }
    const merges = Array.isArray(sheet.merges)
      ? sheet.merges.map((mergeValue) => {
          const merge = requireRecord(mergeValue, "merge");
          const s = requireRecord(merge.s, "merge.s");
          const e = requireRecord(merge.e, "merge.e");
          return {
            s: { r: requireInteger(s.r, "merge.s.r"), c: requireInteger(s.c, "merge.s.c") },
            e: { r: requireInteger(e.r, "merge.e.r"), c: requireInteger(e.c, "merge.e.c") },
          };
        })
      : [];
    return {
      name,
      index: requireInteger(sheet.index, "sheet.index"),
      visibility,
      usedRange: optionalString(sheet.usedRange, "sheet.usedRange"),
      merges,
      mergesTruncated: sheet.mergesTruncated === true,
      cells: sheet.cells.map((cellValue) => validateCell(cellValue, name)),
    };
  });
  const namedRanges: WorkbookNamedRangeDto[] = Array.isArray(record.namedRanges)
    ? record.namedRanges.map((namedValue) => {
        const named = requireRecord(namedValue, "namedRange");
        return { name: requireString(named.name, "namedRange.name"), ref: requireString(named.ref, "namedRange.ref") };
      })
    : [];
  const stringArray = (input: unknown, what: string): string[] =>
    Array.isArray(input) ? input.map((item) => requireString(item, what)) : [];
  return {
    parser: { id: requireString(parser.id, "parser.id"), version: requireString(parser.version, "parser.version") },
    calculation: {
      mode: optionalString(calculation.mode, "calculation.mode"),
      fullCalcOnLoad: typeof calculation.fullCalcOnLoad === "boolean" ? calculation.fullCalcOnLoad : null,
    },
    namedRanges,
    sheets,
    scan: {
      sheetCount: requireInteger(scan.sheetCount, "scan.sheetCount"),
      cellCount: requireInteger(scan.cellCount, "scan.cellCount"),
      formulaCellCount: requireInteger(scan.formulaCellCount, "scan.formulaCellCount"),
      rejectedExternalLinks: requireInteger(scan.rejectedExternalLinks, "scan.rejectedExternalLinks"),
      warnings: stringArray(scan.warnings, "scan.warnings[]"),
      unsupported: stringArray(scan.unsupported, "scan.unsupported[]"),
    },
  };
}

/** 重算通道指纹（审计/复现辅助）。 */
export function recalculationFingerprint(channel: WorkbookRecalculationChannel): string {
  return canonicalFingerprint(channel);
}
