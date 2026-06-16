import type { QcLayoutBlock, QcLayoutCell } from "@/server/services/production/qc";
import { clone, emptyCell } from "./editor-utils";

export interface TableAnchor {
  row: number;
  col: number;
  cellIndex: number;
  cell: QcLayoutCell;
}

export interface TableGridSlot {
  row: number;
  col: number;
  anchorRow: number;
  anchorCol: number;
  cellIndex: number;
  cell: QcLayoutCell;
  isAnchor: boolean;
}

export interface TableGridModel {
  rowCount: number;
  columnCount: number;
  matrix: Array<Array<TableGridSlot | null>>;
  anchors: TableAnchor[];
  columnWeights: number[];
  rowHeights: string[];
}

function positiveNumber(value?: string) {
  const match = String(value || "").match(/-?\d+(?:\.\d+)?/);
  const number = match ? Number(match[0]) : NaN;
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

function fallbackColumnCount(block: QcLayoutBlock) {
  return Math.max(
    block.columnWidths?.length || 0,
    ...(block.rows || []).map((row) => row.reduce((sum, cell) => sum + Math.max(1, cell.colspan || 1), 0)),
  );
}

export function ensureTableMetrics(block: QcLayoutBlock): QcLayoutBlock {
  const columnCount = Math.max(1, fallbackColumnCount(block));
  const rowCount = Math.max(1, block.rows?.length || 0);
  const columnWidths = block.columnWidths?.length === columnCount
    ? block.columnWidths
    : Array.from({ length: columnCount }, () => `${100 / columnCount}%`);
  const rowHeights = block.rowHeights?.length === rowCount
    ? block.rowHeights
    : Array.from({ length: rowCount }, () => "68px");
  return { ...block, columnWidths, rowHeights };
}

export function parseColumnWeights(widths: string[] | undefined, columnCount: number) {
  const base = widths?.length === columnCount ? widths : Array.from({ length: columnCount }, () => `${100 / columnCount}%`);
  return base.map((width) => positiveNumber(width) || 1);
}

export function normalizeColumnWidths(weights: number[]) {
  const safe = weights.map((weight) => (Number.isFinite(weight) && weight > 0 ? weight : 1));
  const total = safe.reduce((sum, value) => sum + value, 0) || safe.length;
  return safe.map((weight) => `${((weight / total) * 100).toFixed(4).replace(/\.?0+$/, "")}%`);
}

export function extractTableAnchors(block: QcLayoutBlock): TableAnchor[] {
  const rows = block.rows || [];
  const occupancy: boolean[][] = [];
  const anchors: TableAnchor[] = [];
  rows.forEach((row, rowIndex) => {
    let col = 0;
    occupancy[rowIndex] ||= [];
    row.forEach((cell, cellIndex) => {
      while (occupancy[rowIndex][col]) col += 1;
      const rowspan = Math.max(1, cell.rowspan || 1);
      const colspan = Math.max(1, cell.colspan || 1);
      anchors.push({ row: rowIndex, col, cellIndex, cell: clone(cell) });
      for (let rowOffset = 0; rowOffset < rowspan; rowOffset += 1) {
        occupancy[rowIndex + rowOffset] ||= [];
        for (let colOffset = 0; colOffset < colspan; colOffset += 1) {
          occupancy[rowIndex + rowOffset][col + colOffset] = true;
        }
      }
      col += colspan;
    });
  });
  return anchors;
}

function buildMatrix(anchors: TableAnchor[], rowCount: number, columnCount: number) {
  const matrix: Array<Array<TableGridSlot | null>> = Array.from({ length: rowCount }, () => Array.from({ length: columnCount }, () => null));
  anchors.forEach((anchor) => {
    const rowspan = Math.max(1, anchor.cell.rowspan || 1);
    const colspan = Math.max(1, anchor.cell.colspan || 1);
    for (let rowOffset = 0; rowOffset < rowspan; rowOffset += 1) {
      for (let colOffset = 0; colOffset < colspan; colOffset += 1) {
        const row = anchor.row + rowOffset;
        const col = anchor.col + colOffset;
        if (row < rowCount && col < columnCount) {
          matrix[row][col] = {
            row,
            col,
            anchorRow: anchor.row,
            anchorCol: anchor.col,
            cellIndex: anchor.cellIndex,
            cell: anchor.cell,
            isAnchor: rowOffset === 0 && colOffset === 0,
          };
        }
      }
    }
  });
  return matrix;
}

function covers(anchor: TableAnchor, row: number, col: number) {
  return row >= anchor.row
    && row < anchor.row + Math.max(1, anchor.cell.rowspan || 1)
    && col >= anchor.col
    && col < anchor.col + Math.max(1, anchor.cell.colspan || 1);
}

function sortAnchors(anchors: TableAnchor[]) {
  return anchors
    .slice()
    .sort((left, right) => left.row - right.row || left.col - right.col);
}

function anchorsToRows(anchors: TableAnchor[], rowCount: number) {
  return Array.from({ length: rowCount }, (_, rowIndex) => (
    sortAnchors(anchors)
      .filter((anchor) => anchor.row === rowIndex)
      .map((anchor) => clone(anchor.cell))
  ));
}

function composeTableBlock(
  block: QcLayoutBlock,
  anchors: TableAnchor[],
  rowCount: number,
  columnWeights: number[],
  rowHeights: string[],
) {
  const next = clone(block);
  next.rows = anchorsToRows(anchors, rowCount);
  next.columnWidths = normalizeColumnWidths(columnWeights);
  next.rowHeights = rowHeights.slice(0, rowCount);
  return ensureTableMetrics(next);
}

function composeFromCurrent(block: QcLayoutBlock, anchors: TableAnchor[]) {
  const normalized = ensureTableMetrics(block);
  const rowCount = Math.max(1, normalized.rows?.length || 0);
  const columnCount = Math.max(1, fallbackColumnCount(normalized));
  return composeTableBlock(
    normalized,
    anchors,
    rowCount,
    parseColumnWeights(normalized.columnWidths, columnCount),
    (normalized.rowHeights || []).slice(0, rowCount),
  );
}

function clonedAnchors(block: QcLayoutBlock) {
  const normalized = ensureTableMetrics(block);
  return {
    block: normalized,
    anchors: extractTableAnchors(normalized).map((anchor) => ({ ...anchor, cell: clone(anchor.cell) })),
    rowCount: Math.max(1, normalized.rows?.length || 0),
    columnCount: Math.max(1, fallbackColumnCount(normalized)),
    columnWeights: parseColumnWeights(normalized.columnWidths, Math.max(1, fallbackColumnCount(normalized))),
    rowHeights: (normalized.rowHeights || []).slice(),
  };
}

export function buildTableGridModel(block: QcLayoutBlock): TableGridModel {
  const normalized = ensureTableMetrics(block);
  const anchors = extractTableAnchors(normalized);
  const rowCount = Math.max(1, normalized.rows?.length || 0);
  const columnCount = Math.max(1, fallbackColumnCount(normalized));
  return {
    rowCount,
    columnCount,
    matrix: buildMatrix(anchors, rowCount, columnCount),
    anchors,
    columnWeights: parseColumnWeights(normalized.columnWidths, columnCount),
    rowHeights: (normalized.rowHeights || []).slice(0, rowCount),
  };
}

export function insertColumnAt(block: QcLayoutBlock, insertIndex: number) {
  const { block: normalized, anchors, rowCount, columnCount, columnWeights, rowHeights } = clonedAnchors(block);
  const safeIndex = Math.max(0, Math.min(columnCount, insertIndex));
  anchors.forEach((anchor) => {
    const end = anchor.col + Math.max(1, anchor.cell.colspan || 1);
    if (anchor.col >= safeIndex) anchor.col += 1;
    else if (anchor.col < safeIndex && end > safeIndex) anchor.cell.colspan = Math.max(1, anchor.cell.colspan || 1) + 1;
  });
  for (let row = 0; row < rowCount; row += 1) {
    if (!anchors.some((anchor) => covers(anchor, row, safeIndex))) anchors.push({ row, col: safeIndex, cellIndex: 0, cell: emptyCell() });
  }
  const nextWeights = columnWeights.slice();
  const left = columnWeights[Math.max(0, safeIndex - 1)] || columnWeights[0] || 1;
  const right = columnWeights[Math.min(columnWeights.length - 1, safeIndex)] || left;
  nextWeights.splice(safeIndex, 0, Math.max(0.6, (left + right) / 2));
  return composeTableBlock(normalized, anchors, rowCount, nextWeights, rowHeights);
}

export function deleteColumnAt(block: QcLayoutBlock, columnIndex: number) {
  const { block: normalized, anchors, rowCount, columnCount, columnWeights, rowHeights } = clonedAnchors(block);
  if (columnCount <= 1) return normalized;
  const safeIndex = Math.max(0, Math.min(columnCount - 1, columnIndex));
  const nextAnchors = anchors.flatMap((anchor) => {
    const nextAnchor = { ...anchor, cell: clone(anchor.cell) };
    const span = Math.max(1, nextAnchor.cell.colspan || 1);
    const end = nextAnchor.col + span;
    if (safeIndex < nextAnchor.col) {
      nextAnchor.col -= 1;
      return [nextAnchor];
    }
    if (safeIndex >= nextAnchor.col && safeIndex < end) {
      if (span > 1) {
        nextAnchor.cell.colspan = span - 1;
        return [nextAnchor];
      }
      return [];
    }
    return [nextAnchor];
  });
  const nextWeights = columnWeights.slice();
  nextWeights.splice(safeIndex, 1);
  return composeTableBlock(normalized, nextAnchors, rowCount, nextWeights, rowHeights);
}

export function insertRowAt(block: QcLayoutBlock, insertIndex: number) {
  const { block: normalized, anchors, rowCount, columnCount, columnWeights, rowHeights } = clonedAnchors(block);
  const safeIndex = Math.max(0, Math.min(rowCount, insertIndex));
  anchors.forEach((anchor) => {
    const end = anchor.row + Math.max(1, anchor.cell.rowspan || 1);
    if (anchor.row >= safeIndex) anchor.row += 1;
    else if (anchor.row < safeIndex && end > safeIndex) anchor.cell.rowspan = Math.max(1, anchor.cell.rowspan || 1) + 1;
  });
  for (let col = 0; col < columnCount; col += 1) {
    if (!anchors.some((anchor) => covers(anchor, safeIndex, col))) anchors.push({ row: safeIndex, col, cellIndex: 0, cell: emptyCell() });
  }
  const nextHeights = rowHeights.slice();
  nextHeights.splice(safeIndex, 0, rowHeights[Math.max(0, safeIndex - 1)] || rowHeights[0] || "68px");
  return composeTableBlock(normalized, anchors, rowCount + 1, columnWeights, nextHeights);
}

export function deleteRowAt(block: QcLayoutBlock, rowIndex: number) {
  const { block: normalized, anchors, rowCount, columnWeights, rowHeights } = clonedAnchors(block);
  if (rowCount <= 1) return normalized;
  const safeIndex = Math.max(0, Math.min(rowCount - 1, rowIndex));
  const nextAnchors = anchors.flatMap((anchor) => {
    const nextAnchor = { ...anchor, cell: clone(anchor.cell) };
    const span = Math.max(1, nextAnchor.cell.rowspan || 1);
    const end = nextAnchor.row + span;
    if (safeIndex < nextAnchor.row) {
      nextAnchor.row -= 1;
      return [nextAnchor];
    }
    if (safeIndex >= nextAnchor.row && safeIndex < end) {
      if (span > 1) {
        if (safeIndex === nextAnchor.row) nextAnchor.row = safeIndex;
        nextAnchor.cell.rowspan = span - 1;
        return [nextAnchor];
      }
      return [];
    }
    return [nextAnchor];
  });
  const nextHeights = rowHeights.slice();
  nextHeights.splice(safeIndex, 1);
  return composeTableBlock(normalized, nextAnchors, rowCount - 1, columnWeights, nextHeights);
}

export function resizeColumnBoundary(block: QcLayoutBlock, columnIndex: number, deltaWeight: number) {
  const { block: normalized, rowCount, columnWeights, rowHeights, anchors } = clonedAnchors(block);
  if (columnIndex < 0 || columnIndex >= columnWeights.length - 1) return normalized;
  const nextWeights = columnWeights.slice();
  const minWeight = 0.8;
  const safeDelta = Math.max(
    -(nextWeights[columnIndex] - minWeight),
    Math.min(nextWeights[columnIndex + 1] - minWeight, deltaWeight),
  );
  const left = nextWeights[columnIndex] + safeDelta;
  const right = nextWeights[columnIndex + 1] - safeDelta;
  nextWeights[columnIndex] = left;
  nextWeights[columnIndex + 1] = right;
  return composeTableBlock(normalized, anchors, rowCount, nextWeights, rowHeights);
}

export function resizeRowHeight(block: QcLayoutBlock, rowIndex: number, nextHeightPx: number) {
  const { block: normalized, anchors, rowCount, columnWeights, rowHeights } = clonedAnchors(block);
  if (rowIndex < 0 || rowIndex >= rowHeights.length) return normalized;
  const nextHeights = rowHeights.slice();
  nextHeights[rowIndex] = `${Math.max(44, Math.round(nextHeightPx))}px`;
  return composeTableBlock(normalized, anchors, rowCount, columnWeights, nextHeights);
}

export function canMergeRange(block: QcLayoutBlock, range: { rowStart: number; rowEnd: number; colStart: number; colEnd: number }) {
  const normalized = ensureTableMetrics(block);
  const model = buildTableGridModel(normalized);
  if (range.rowStart === range.rowEnd && range.colStart === range.colEnd) return false;
  for (let row = range.rowStart; row <= range.rowEnd; row += 1) {
    for (let col = range.colStart; col <= range.colEnd; col += 1) {
      const slot = model.matrix[row]?.[col];
      if (!slot || !slot.isAnchor) return false;
      if (Math.max(1, slot.cell.rowspan || 1) !== 1 || Math.max(1, slot.cell.colspan || 1) !== 1) return false;
    }
  }
  return true;
}

export function mergeRange(block: QcLayoutBlock, range: { rowStart: number; rowEnd: number; colStart: number; colEnd: number }) {
  if (!canMergeRange(block, range)) return ensureTableMetrics(block);
  const anchors = extractTableAnchors(ensureTableMetrics(block)).map((anchor) => ({ ...anchor, cell: clone(anchor.cell) }));
  const nextAnchors = anchors.filter((anchor) => (
    anchor.row < range.rowStart
    || anchor.row > range.rowEnd
    || anchor.col < range.colStart
    || anchor.col > range.colEnd
  ));
  const topLeft = anchors.find((anchor) => anchor.row === range.rowStart && anchor.col === range.colStart);
  if (!topLeft) return ensureTableMetrics(block);
  topLeft.cell.rowspan = range.rowEnd - range.rowStart + 1;
  topLeft.cell.colspan = range.colEnd - range.colStart + 1;
  nextAnchors.push(topLeft);
  return composeFromCurrent(block, nextAnchors);
}

export function canSplitCell(block: QcLayoutBlock, row: number, col: number) {
  const anchors = extractTableAnchors(ensureTableMetrics(block));
  const anchor = anchors.find((item) => item.row === row && item.col === col);
  if (!anchor) return false;
  return Math.max(1, anchor.cell.rowspan || 1) > 1 || Math.max(1, anchor.cell.colspan || 1) > 1;
}

export function splitCell(block: QcLayoutBlock, row: number, col: number) {
  const anchors = extractTableAnchors(ensureTableMetrics(block)).map((anchor) => ({ ...anchor, cell: clone(anchor.cell) }));
  const target = anchors.find((anchor) => anchor.row === row && anchor.col === col);
  if (!target) return ensureTableMetrics(block);
  const rowspan = Math.max(1, target.cell.rowspan || 1);
  const colspan = Math.max(1, target.cell.colspan || 1);
  if (rowspan === 1 && colspan === 1) return ensureTableMetrics(block);
  const nextAnchors = anchors.filter((anchor) => !(anchor.row === row && anchor.col === col));
  nextAnchors.push({
    ...target,
    cell: { ...target.cell, rowspan: 1, colspan: 1 },
  });
  for (let rowOffset = 0; rowOffset < rowspan; rowOffset += 1) {
    for (let colOffset = 0; colOffset < colspan; colOffset += 1) {
      if (rowOffset === 0 && colOffset === 0) continue;
      nextAnchors.push({
        row: row + rowOffset,
        col: col + colOffset,
        cellIndex: 0,
        cell: emptyCell(),
      });
    }
  }
  return composeFromCurrent(block, nextAnchors);
}
