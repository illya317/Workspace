import type { NormalizedWorkbookDto, WorkbookSheetDto, WorkbookCellDto } from "./workbook-dto";
import {
  canonicalLinesForReportType,
  collidingNormalizedLabels,
  normalizeStatementLabel,
  STATEMENT_REPORT_TYPES,
  type CanonicalStatementLine,
  type StatementReportType,
} from "./statement-lines";

/**
 * 报表识别与映射（计划 §5.4）。
 *
 * 确定性规则，不用 LLM：
 * - 只认 normalizeStatementLabel 后的 exact 匹配；
 * - exact 且唯一（canonical 侧唯一 + workbook 侧唯一）才 auto_accepted；
 * - ambiguous / duplicate / unmatched / missing 全部进入待确认清单；
 * - 隐藏 sheet 参与检测但不进入自动 best（必须人工确认）。
 */

export type LineMappingStatus = "auto_accepted" | "ambiguous" | "duplicate" | "unmatched";

export interface MappedAmountColumn {
  col: number;
  /** header 行的期间文本（如 期末余额/本期金额），仅展示用途。 */
  headerText: string | null;
}

export interface DetectedStatementStructure {
  sheetName: string;
  sheetIndex: number;
  visibility: "visible" | "hidden" | "veryHidden";
  reportType: StatementReportType;
  /** canonical label 命中数（检测置信度；阈值见 MIN_LABEL_HITS）。 */
  score: number;
  headerRow: number | null;
  labelColumn: number;
  blockStartRow: number;
  blockEndRow: number;
  amountColumns: MappedAmountColumn[];
  mergedHeader: boolean;
}

export interface LineMappingEntry {
  /** workbook 行原始 label。 */
  label: string;
  normalizedLabel: string;
  row: number;
  /** label 单元格 A1。 */
  labelCell: string;
  status: LineMappingStatus;
  /** auto_accepted / duplicate 时命中的 canonical lineCode。 */
  lineCode: string | null;
  /** ambiguous 时的候选 lineCode 列表。 */
  candidates: string[];
  /** 每个金额列对应的该 row 单元格 A1（与 amountColumns 顺序一致）。 */
  amountCells: string[];
}

export interface MissingCanonicalLine {
  lineCode: string;
  label: string;
}

export interface StatementMappingProposal {
  structure: DetectedStatementStructure;
  lines: LineMappingEntry[];
  missingLines: MissingCanonicalLine[];
  autoAcceptedCount: number;
  /** duplicate/ambiguous/unmatched/missing 总数；>0 即 mappingRequired。 */
  pendingCount: number;
}

export interface StatementMappingDetection {
  proposals: StatementMappingProposal[];
  /** 可见 sheet 中得分最高的唯一候选；并列或全隐藏时为 null（必须人工确认）。 */
  best: StatementMappingProposal | null;
  warnings: string[];
}

/** 一个 sheet 至少命中这么多 canonical label 才视为候选报表 sheet。 */
export const MIN_LABEL_HITS = 3;

function columnLabelA1(col: number): string {
  let value = col + 1;
  let label = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    value = Math.floor((value - 1) / 26);
  }
  return label;
}

function cellA1(row: number, col: number): string {
  return `${columnLabelA1(col)}${row + 1}`;
}

type GridCell = WorkbookCellDto;

function buildGrid(sheet: WorkbookSheetDto): Map<number, Map<number, GridCell>> {
  const grid = new Map<number, Map<number, GridCell>>();
  for (const cell of sheet.cells) {
    let row = grid.get(cell.row);
    if (!row) {
      row = new Map();
      grid.set(cell.row, row);
    }
    row.set(cell.col, cell);
  }
  return grid;
}

function labelTextOf(cell: GridCell | undefined): string | null {
  if (!cell) return null;
  if (typeof cell.value === "string" && cell.value.trim()) return cell.value;
  return null;
}

function isNumericCell(cell: GridCell | undefined): boolean {
  if (!cell) return false;
  if (typeof cell.value === "number") return true;
  if (cell.formula !== null && typeof cell.cachedValue === "number") return true;
  return false;
}

interface SheetReportScore {
  reportType: StatementReportType;
  labelColumn: number;
  hits: Map<number, GridCell>; // row -> label cell
}

function scoreSheetForReportType(
  sheet: WorkbookSheetDto,
  grid: Map<number, Map<number, GridCell>>,
  reportType: StatementReportType,
): SheetReportScore | null {
  const canonical = canonicalLinesForReportType(reportType);
  const labels = new Set(canonical.map((line) => line.normalizedLabel));
  const hitsByColumn = new Map<number, Map<number, GridCell>>();
  for (const [rowIndex, row] of grid) {
    for (const [colIndex, cell] of row) {
      const text = labelTextOf(cell);
      if (!text) continue;
      if (!labels.has(normalizeStatementLabel(text))) continue;
      let hits = hitsByColumn.get(colIndex);
      if (!hits) {
        hits = new Map();
        hitsByColumn.set(colIndex, hits);
      }
      hits.set(rowIndex, cell);
    }
  }
  let bestColumn = -1;
  let bestHits: Map<number, GridCell> | null = null;
  for (const [colIndex, hits] of hitsByColumn) {
    if (!bestHits || hits.size > bestHits.size) {
      bestColumn = colIndex;
      bestHits = hits;
    }
  }
  if (!bestHits || bestHits.size < MIN_LABEL_HITS) return null;
  return { reportType, labelColumn: bestColumn, hits: bestHits };
}

function detectHeaderRow(
  grid: Map<number, Map<number, GridCell>>,
  blockStartRow: number,
  labelColumn: number,
): number | null {
  for (let rowIndex = blockStartRow - 1; rowIndex >= 0; rowIndex -= 1) {
    const row = grid.get(rowIndex);
    if (!row) continue;
    for (const [colIndex, cell] of row) {
      if (colIndex < labelColumn) continue;
      if (cell.value !== null || cell.text !== null) return rowIndex;
    }
  }
  return null;
}

function headerIntersectsMerge(sheet: WorkbookSheetDto, headerRow: number, labelColumn: number): boolean {
  return sheet.merges.some(
    (merge) => merge.s.r <= headerRow && merge.e.r >= headerRow && merge.e.c > merge.s.c && merge.e.c >= labelColumn,
  );
}

function detectAmountColumns(
  grid: Map<number, Map<number, GridCell>>,
  blockRows: readonly number[],
  labelColumn: number,
  headerRow: number | null,
): MappedAmountColumn[] {
  const threshold = Math.max(1, Math.floor(blockRows.length / 2));
  const columns: MappedAmountColumn[] = [];
  const candidateCols = new Set<number>();
  for (const rowIndex of blockRows) {
    const row = grid.get(rowIndex);
    if (!row) continue;
    for (const colIndex of row.keys()) {
      if (colIndex !== labelColumn) candidateCols.add(colIndex);
    }
  }
  for (const colIndex of [...candidateCols].sort((a, b) => a - b)) {
    let numeric = 0;
    for (const rowIndex of blockRows) {
      if (isNumericCell(grid.get(rowIndex)?.get(colIndex))) numeric += 1;
    }
    if (numeric < threshold) continue;
    const headerCell = headerRow === null ? undefined : grid.get(headerRow)?.get(colIndex);
    columns.push({
      col: colIndex,
      headerText: labelTextOf(headerCell) ?? (headerCell?.text ?? null),
    });
  }
  return columns;
}

function mapLines(
  grid: Map<number, Map<number, GridCell>>,
  reportType: StatementReportType,
  labelColumn: number,
  amountColumns: readonly MappedAmountColumn[],
  blockStartRow: number,
  blockEndRow: number,
): { lines: LineMappingEntry[]; missingLines: MissingCanonicalLine[] } {
  const canonical = canonicalLinesForReportType(reportType);
  const byNormalized = new Map<string, CanonicalStatementLine[]>();
  for (const line of canonical) {
    const list = byNormalized.get(line.normalizedLabel) ?? [];
    list.push(line);
    byNormalized.set(line.normalizedLabel, list);
  }
  const colliding = collidingNormalizedLabels(reportType);

  const lines: LineMappingEntry[] = [];
  const rowsByLineCode = new Map<string, number[]>();
  for (let rowIndex = blockStartRow; rowIndex <= blockEndRow; rowIndex += 1) {
    const labelCell = grid.get(rowIndex)?.get(labelColumn);
    const text = labelTextOf(labelCell);
    if (!text) continue;
    const normalized = normalizeStatementLabel(text);
    const matches = byNormalized.get(normalized) ?? [];
    const amountCells = amountColumns.map((column) => cellA1(rowIndex, column.col));
    let status: LineMappingStatus;
    let lineCode: string | null = null;
    let candidates: string[] = [];
    if (matches.length === 0) {
      status = "unmatched";
    } else if (matches.length > 1 || colliding.has(normalized)) {
      status = "ambiguous";
      candidates = matches.map((line) => line.lineCode);
    } else {
      lineCode = matches[0]!.lineCode;
      status = "auto_accepted";
      const rows = rowsByLineCode.get(lineCode) ?? [];
      rows.push(lines.length);
      rowsByLineCode.set(lineCode, rows);
    }
    lines.push({
      label: text,
      normalizedLabel: normalized,
      row: rowIndex,
      labelCell: cellA1(rowIndex, labelColumn),
      status,
      lineCode,
      candidates,
      amountCells,
    });
  }

  // workbook 侧重复命中同一 canonical 行 → 全部降级为 duplicate（待确认）。
  for (const [, indexes] of rowsByLineCode) {
    if (indexes.length > 1) {
      for (const index of indexes) {
        lines[index] = { ...lines[index]!, status: "duplicate" };
      }
    }
  }

  const matchedCodes = new Set(lines.map((line) => line.lineCode).filter((code): code is string => code !== null));
  const missingLines: MissingCanonicalLine[] = canonical
    .filter((line) => !line.isHeader && !matchedCodes.has(line.lineCode))
    .map((line) => ({ lineCode: line.lineCode, label: line.label }));
  return { lines, missingLines };
}

function proposeForSheet(sheet: WorkbookSheetDto): StatementMappingProposal | null {
  const grid = buildGrid(sheet);
  const scores: SheetReportScore[] = [];
  for (const reportType of STATEMENT_REPORT_TYPES) {
    const score = scoreSheetForReportType(sheet, grid, reportType);
    if (score) scores.push(score);
  }
  if (scores.length === 0) return null;
  scores.sort((a, b) => b.hits.size - a.hits.size);
  // 报表类型并列 → 不自动判定，取最高分但由 pending 机制兜底（score 相同的
  // 并列场景由调用方 warnings 呈现；这里确定性取字典序第一保证可复现）。
  const best = scores[0]!;
  const blockRows = [...best.hits.keys()].sort((a, b) => a - b);
  const blockStartRow = blockRows[0]!;
  let blockEndRow = blockRows[blockRows.length - 1]!;
  // 下沿扩展：命中区间之后连续的 label 行视为同一 block（覆盖 unmatched 尾部行）。
  while (labelTextOf(grid.get(blockEndRow + 1)?.get(best.labelColumn)) !== null) {
    blockEndRow += 1;
  }
  const headerRow = detectHeaderRow(grid, blockStartRow, best.labelColumn);
  const amountColumns = detectAmountColumns(grid, blockRows, best.labelColumn, headerRow);
  const { lines, missingLines } = mapLines(
    grid,
    best.reportType,
    best.labelColumn,
    amountColumns,
    blockStartRow,
    blockEndRow,
  );
  const autoAcceptedCount = lines.filter((line) => line.status === "auto_accepted").length;
  const pendingCount = lines.length - autoAcceptedCount + missingLines.length;
  return {
    structure: {
      sheetName: sheet.name,
      sheetIndex: sheet.index,
      visibility: sheet.visibility,
      reportType: best.reportType,
      score: best.hits.size,
      headerRow,
      labelColumn: best.labelColumn,
      blockStartRow,
      blockEndRow,
      amountColumns,
      mergedHeader: headerRow !== null && headerIntersectsMerge(sheet, headerRow, best.labelColumn),
    },
    lines,
    missingLines,
    autoAcceptedCount,
    pendingCount,
  };
}

/**
 * 检测候选 statement sheet/block 并生成映射提案。
 * `opts.reportType` 可强制报表类型（用户已选定目标时），否则按命中数自动判定。
 */
export function detectStatementMapping(
  dto: NormalizedWorkbookDto,
  opts: { reportType?: StatementReportType } = {},
): StatementMappingDetection {
  const warnings: string[] = [];
  const proposals: StatementMappingProposal[] = [];
  for (const sheet of dto.sheets) {
    const proposal = proposeForSheet(sheet);
    if (!proposal) continue;
    if (opts.reportType && proposal.structure.reportType !== opts.reportType) continue;
    if (sheet.visibility !== "visible") {
      warnings.push(`sheet「${sheet.name}」处于隐藏状态，命中 ${proposal.structure.score} 个报表行，需人工确认`);
    }
    if (proposal.missingLines.length > 0) {
      warnings.push(`sheet「${sheet.name}」缺少 ${proposal.missingLines.length} 个 canonical 报表行`);
    }
    proposals.push(proposal);
  }
  const visible = proposals.filter((proposal) => proposal.structure.visibility === "visible");
  let best: StatementMappingProposal | null = null;
  if (visible.length > 0) {
    const sorted = [...visible].sort((a, b) => b.structure.score - a.structure.score);
    if (sorted.length === 1 || sorted[0]!.structure.score > sorted[1]!.structure.score) {
      best = sorted[0]!;
    } else {
      warnings.push("多个 sheet 命中数并列，无法自动选择，需人工确认");
    }
  } else if (proposals.length > 0) {
    warnings.push("候选报表 sheet 均为隐藏 sheet，需人工确认");
  }
  return { proposals, best, warnings };
}
