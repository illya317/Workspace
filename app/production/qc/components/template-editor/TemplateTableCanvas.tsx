"use client";

import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import ConfirmModal from "@/app/components/ConfirmModal";
import type { QcLayoutBlock } from "@/server/services/production/qc";
import { blockLabel, encodeParts } from "./editor-utils";
import {
  buildTableGridModel,
  canMergeRange,
  canSplitCell,
  deleteColumnAt,
  deleteRowAt,
  ensureTableMetrics,
  insertColumnAt,
  insertRowAt,
  mergeRange,
  resizeColumnBoundary,
  resizeRowHeight,
  splitCell,
} from "./table-grid-utils";

interface CellSelection {
  row: number;
  cell: number;
}

interface Props {
  block?: QcLayoutBlock;
  blockIndex: number;
  selectedCell?: CellSelection;
  onSelectCell: (selection?: CellSelection) => void;
  onChange: (nextBlock: QcLayoutBlock) => void;
}

interface CellRange {
  rowStart: number;
  rowEnd: number;
  colStart: number;
  colEnd: number;
}

type TableSelection =
  | { type: "cell"; range: CellRange }
  | { type: "row"; start: number; end: number }
  | { type: "column"; start: number; end: number };

type DeleteTarget =
  | { type: "cell"; range: CellRange }
  | { type: "row"; start: number; end: number }
  | { type: "column"; start: number; end: number };

interface ContextMenuState {
  x: number;
  y: number;
  selection: TableSelection;
}

interface AnchorRangeTarget {
  row: number;
  col: number;
  range: CellRange;
}

function columnLabel(index: number) {
  let current = index;
  let label = "";
  do {
    label = String.fromCharCode(65 + (current % 26)) + label;
    current = Math.floor(current / 26) - 1;
  } while (current >= 0);
  return label;
}

function displayCellText(block: QcLayoutBlock) {
  return (block.title || block.label || block.text || "").trim();
}

function parsePixels(value?: string) {
  const match = String(value || "").match(/-?\d+(?:\.\d+)?/);
  const number = match ? Number(match[0]) : NaN;
  return Number.isFinite(number) && number > 0 ? number : 68;
}

function normalizeRange(range: CellRange): CellRange {
  return {
    rowStart: Math.min(range.rowStart, range.rowEnd),
    rowEnd: Math.max(range.rowStart, range.rowEnd),
    colStart: Math.min(range.colStart, range.colEnd),
    colEnd: Math.max(range.colStart, range.colEnd),
  };
}

function sameSelection(left?: TableSelection, right?: TableSelection | null) {
  if (!left || !right || left.type !== right.type) return false;
  if (left.type === "cell" && right.type === "cell") {
    const leftRange = normalizeRange(left.range);
    const rightRange = normalizeRange(right.range);
    return leftRange.rowStart === rightRange.rowStart
      && leftRange.rowEnd === rightRange.rowEnd
      && leftRange.colStart === rightRange.colStart
      && leftRange.colEnd === rightRange.colEnd;
  }
  return left.start === right.start && left.end === right.end;
}

function selectionToRange(selection: TableSelection, rowCount: number, columnCount: number): CellRange {
  if (selection.type === "cell") return normalizeRange(selection.range);
  if (selection.type === "row") {
    return {
      rowStart: Math.min(selection.start, selection.end),
      rowEnd: Math.max(selection.start, selection.end),
      colStart: 0,
      colEnd: Math.max(0, columnCount - 1),
    };
  }
  return {
    rowStart: 0,
    rowEnd: Math.max(0, rowCount - 1),
    colStart: Math.min(selection.start, selection.end),
    colEnd: Math.max(selection.start, selection.end),
  };
}

function describeSelection(selection: DeleteTarget) {
  if (selection.type === "row") {
    const start = Math.min(selection.start, selection.end) + 1;
    const end = Math.max(selection.start, selection.end) + 1;
    return start === end ? `第 ${start} 行` : `第 ${start}-${end} 行`;
  }
  if (selection.type === "column") {
    const start = columnLabel(Math.min(selection.start, selection.end));
    const end = columnLabel(Math.max(selection.start, selection.end));
    return start === end ? `${start} 列` : `${start}-${end} 列`;
  }
  const range = normalizeRange(selection.range);
  return `${range.rowStart + 1}-${range.rowEnd + 1} 行 / ${columnLabel(range.colStart)}-${columnLabel(range.colEnd)} 列`;
}

function rangeFromAnchor(row: number, col: number, rowspan = 1, colspan = 1): CellRange {
  return {
    rowStart: row,
    rowEnd: row + Math.max(1, rowspan) - 1,
    colStart: col,
    colEnd: col + Math.max(1, colspan) - 1,
  };
}

function splitTargetFromRange(model: NonNullable<ReturnType<typeof buildTableGridModel>>, range: CellRange): AnchorRangeTarget | undefined {
  const slot = model.matrix[range.rowStart]?.[range.colStart];
  if (!slot || !slot.isAnchor) return undefined;
  const anchorRange = normalizeRange(
    rangeFromAnchor(
      slot.anchorRow,
      slot.anchorCol,
      Math.max(1, slot.cell.rowspan || 1),
      Math.max(1, slot.cell.colspan || 1),
    ),
  );
  const normalizedRange = normalizeRange(range);
  if (
    anchorRange.rowStart !== normalizedRange.rowStart
    || anchorRange.rowEnd !== normalizedRange.rowEnd
    || anchorRange.colStart !== normalizedRange.colStart
    || anchorRange.colEnd !== normalizedRange.colEnd
  ) {
    return undefined;
  }
  if (Math.max(1, slot.cell.rowspan || 1) === 1 && Math.max(1, slot.cell.colspan || 1) === 1) {
    return undefined;
  }
  return { row: slot.anchorRow, col: slot.anchorCol, range: anchorRange };
}

export default function TemplateTableCanvas({ block, blockIndex, selectedCell, onSelectCell, onChange }: Props) {
  const normalizedBlock = useMemo(() => (block?.type === "table" ? ensureTableMetrics(block) : block), [block]);
  const model = useMemo(() => (normalizedBlock?.type === "table" ? buildTableGridModel(normalizedBlock) : null), [normalizedBlock]);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const dragOriginRef = useRef<{ row: number; col: number } | null>(null);
  const [selection, setSelection] = useState<TableSelection>();
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  useEffect(() => {
    setSelection(undefined);
    setMenu(null);
  }, [normalizedBlock]);

  useEffect(() => {
    function handleMouseUp() {
      dragOriginRef.current = null;
    }
    window.addEventListener("mouseup", handleMouseUp);
    return () => window.removeEventListener("mouseup", handleMouseUp);
  }, []);

  const selectedAnchor = useMemo(() => {
    if (!model || !selectedCell) return undefined;
    return model.anchors.find((anchor) => anchor.row === selectedCell.row && anchor.cellIndex === selectedCell.cell);
  }, [model, selectedCell]);

  function updateSelection(nextSelection: TableSelection, nextCell?: CellSelection) {
    setSelection(nextSelection);
    if (nextCell) onSelectCell(nextCell);
    else onSelectCell(undefined);
  }

  function startColumnResize(index: number, startX: number) {
    if (!normalizedBlock || normalizedBlock.type !== "table" || !model || !gridRef.current || index >= model.columnWeights.length - 1) return;
    const startBlock = normalizedBlock;
    const totalWeight = model.columnWeights.reduce((sum, value) => sum + value, 0) || model.columnWeights.length;
    const tableWidth = Math.max(320, gridRef.current.clientWidth - 44);
    function handleMove(event: PointerEvent) {
      const deltaWeight = ((event.clientX - startX) / tableWidth) * totalWeight;
      onChange(resizeColumnBoundary(startBlock, index, deltaWeight));
    }
    function handleUp() {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    }
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  }

  function startRowResize(index: number, startY: number) {
    if (!normalizedBlock || normalizedBlock.type !== "table" || !model) return;
    const startBlock = normalizedBlock;
    const baseHeight = parsePixels(model.rowHeights[index]);
    function handleMove(event: PointerEvent) {
      onChange(resizeRowHeight(startBlock, index, baseHeight + (event.clientY - startY)));
    }
    function handleUp() {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    }
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  }

  function isSlotSelected(row: number, col: number) {
    if (!selection) return false;
    if (selection.type === "cell") {
      const range = normalizeRange(selection.range);
      return row >= range.rowStart && row <= range.rowEnd && col >= range.colStart && col <= range.colEnd;
    }
    if (selection.type === "row") {
      const start = Math.min(selection.start, selection.end);
      const end = Math.max(selection.start, selection.end);
      return row >= start && row <= end;
    }
    const start = Math.min(selection.start, selection.end);
    const end = Math.max(selection.start, selection.end);
    return col >= start && col <= end;
  }

  function isRowSelected(index: number) {
    return selection?.type === "row"
      && index >= Math.min(selection.start, selection.end)
      && index <= Math.max(selection.start, selection.end);
  }

  function isColumnSelected(index: number) {
    return selection?.type === "column"
      && index >= Math.min(selection.start, selection.end)
      && index <= Math.max(selection.start, selection.end);
  }

  function openContextMenu(event: MouseEvent, nextSelection: TableSelection) {
    event.preventDefault();
    if (!sameSelection(selection, nextSelection)) updateSelection(nextSelection);
    setMenu({
      x: Math.min(window.innerWidth - 220, event.clientX),
      y: Math.min(window.innerHeight - 180, event.clientY),
      selection: nextSelection,
    });
  }

  function selectColumn(index: number, extend: boolean) {
    const nextSelection = selection?.type === "column" && extend
      ? { type: "column" as const, start: selection.start, end: index }
      : { type: "column" as const, start: index, end: index };
    updateSelection(nextSelection);
  }

  function selectRow(index: number, extend: boolean) {
    const nextSelection = selection?.type === "row" && extend
      ? { type: "row" as const, start: selection.start, end: index }
      : { type: "row" as const, start: index, end: index };
    updateSelection(nextSelection);
  }

  function selectSingleCell(row: number, col: number, cellIndex: number, rowspan = 1, colspan = 1) {
    updateSelection(
      { type: "cell", range: rangeFromAnchor(row, col, rowspan, colspan) },
      { row, cell: cellIndex },
    );
  }

  function handleMerge() {
    if (!normalizedBlock || normalizedBlock.type !== "table" || !model || !menu) return;
    const range = selectionToRange(menu.selection, model.rowCount, model.columnCount);
    if (!canMergeRange(normalizedBlock, range)) return;
    const nextBlock = mergeRange(normalizedBlock, range);
    onChange(nextBlock);
    const nextModel = buildTableGridModel(nextBlock);
    const topLeft = nextModel.anchors.find((anchor) => anchor.row === range.rowStart && anchor.col === range.colStart);
    if (topLeft) {
      updateSelection({ type: "cell", range }, { row: topLeft.row, cell: topLeft.cellIndex });
    } else {
      updateSelection({ type: "cell", range });
    }
    setMenu(null);
  }

  function handleSplit() {
    if (!normalizedBlock || normalizedBlock.type !== "table" || !menu || !model) return;
    const range = selectionToRange(menu.selection, model.rowCount, model.columnCount);
    const target = splitTargetFromRange(model, range);
    if (!target || !canSplitCell(normalizedBlock, target.row, target.col)) return;
    const nextBlock = splitCell(normalizedBlock, target.row, target.col);
    onChange(nextBlock);
    const nextModel = buildTableGridModel(nextBlock);
    const topLeft = nextModel.anchors.find((anchor) => anchor.row === target.row && anchor.col === target.col);
    if (topLeft) {
      updateSelection(
        { type: "cell", range: rangeFromAnchor(topLeft.row, topLeft.col, topLeft.cell.rowspan, topLeft.cell.colspan) },
        { row: topLeft.row, cell: topLeft.cellIndex },
      );
    }
    setMenu(null);
  }

  function requestDelete(target: DeleteTarget) {
    setDeleteTarget(target);
    setMenu(null);
  }

  function confirmDelete() {
    if (!normalizedBlock || normalizedBlock.type !== "table" || !deleteTarget) return;
    let nextBlock = normalizedBlock;
    if (deleteTarget.type === "row") {
      const start = Math.min(deleteTarget.start, deleteTarget.end);
      const end = Math.max(deleteTarget.start, deleteTarget.end);
      for (let index = end; index >= start; index -= 1) nextBlock = deleteRowAt(nextBlock, index);
    } else if (deleteTarget.type === "column") {
      const start = Math.min(deleteTarget.start, deleteTarget.end);
      const end = Math.max(deleteTarget.start, deleteTarget.end);
      for (let index = end; index >= start; index -= 1) nextBlock = deleteColumnAt(nextBlock, index);
    } else {
      const range = normalizeRange(deleteTarget.range);
      for (let index = range.colEnd; index >= range.colStart; index -= 1) nextBlock = deleteColumnAt(nextBlock, index);
      for (let index = range.rowEnd; index >= range.rowStart; index -= 1) nextBlock = deleteRowAt(nextBlock, index);
    }
    onChange(nextBlock);
    setDeleteTarget(null);
    setSelection(undefined);
    onSelectCell(undefined);
  }

  const paperTitle = normalizedBlock ? blockLabel(normalizedBlock, blockIndex) : "";
  const menuRange = menu && model ? selectionToRange(menu.selection, model.rowCount, model.columnCount) : undefined;
  const mergeEnabled = !!(normalizedBlock && model && menuRange && canMergeRange(normalizedBlock, menuRange));
  const splitTarget = model && menuRange ? splitTargetFromRange(model, menuRange) : undefined;
  const splitEnabled = !!(normalizedBlock && splitTarget && canSplitCell(normalizedBlock, splitTarget.row, splitTarget.col));

  return (
    <>
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-4">
          <h2 className="text-sm font-semibold text-slate-900">A4 编辑画布</h2>
        </div>

        <div className="rounded-[28px] border border-slate-200 bg-slate-100 p-4 shadow-inner">
          <div className="mx-auto w-full max-w-[210mm] rounded-[24px] border border-slate-300 bg-white px-[14mm] py-[14mm] shadow-sm">
            {!normalizedBlock ? (
              <div className="flex min-h-[360px] items-center justify-center rounded-[18px] border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500">
                请选择一个结构块开始编辑。
              </div>
            ) : normalizedBlock.type !== "table" || !model ? (
              <div className="space-y-4">
                <div className="text-[17px] font-semibold leading-7 text-slate-950">{paperTitle}</div>
                <div className="rounded-[18px] border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center text-sm text-slate-500">
                  当前块不是表格。右侧仍可编辑标题、段落和字段；表格块会在这里显示带行列头的编辑框。
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {displayCellText(normalizedBlock) ? (
                  <div className="text-[17px] font-semibold leading-7 text-slate-950">{paperTitle}</div>
                ) : null}

                <div className="rounded-[20px] border border-slate-300 bg-white p-2">
                  <div
                    ref={gridRef}
                    className="grid overflow-hidden rounded-[16px] border border-slate-300 bg-white"
                    style={{
                      gridTemplateColumns: `44px ${model.columnWeights.map((weight) => `${Math.max(1, weight)}fr`).join(" ")}`,
                      gridTemplateRows: `44px ${model.rowHeights.join(" ")}`,
                    }}
                  >
                    <div className="col-start-1 row-start-1 border-b border-r border-slate-300 bg-[linear-gradient(135deg,_#cbd5e1_0_48%,_#ffffff_49%_100%)]" />

                    {Array.from({ length: model.columnCount }, (_, columnIndex) => {
                      const active = isColumnSelected(columnIndex);
                      return (
                        <div
                          key={`column-${columnIndex}`}
                          className={`group/column relative flex items-center justify-center border-b border-r border-slate-300 bg-white text-[15px] font-medium text-slate-600 ${
                            active ? "bg-emerald-50 text-emerald-800" : ""
                          }`}
                          style={{ gridColumn: columnIndex + 2, gridRow: 1 }}
                        >
                          <button
                            type="button"
                            className="absolute inset-0"
                            onClick={(event) => selectColumn(columnIndex, event.shiftKey)}
                            onContextMenu={(event) => openContextMenu(
                              event,
                              isColumnSelected(columnIndex)
                                ? (selection as TableSelection)
                                : { type: "column", start: columnIndex, end: columnIndex },
                            )}
                          >
                            <span className="pointer-events-none">{columnLabel(columnIndex)}</span>
                          </button>

                          <button
                            type="button"
                            className="absolute -left-2 top-1/2 hidden h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full border border-slate-300 bg-white text-xs font-semibold text-slate-600 shadow-sm group-hover/column:flex"
                            onClick={(event) => {
                              event.stopPropagation();
                              onChange(insertColumnAt(normalizedBlock, columnIndex));
                            }}
                          >
                            +
                          </button>
                          <button
                            type="button"
                            className="absolute -right-2 top-1/2 hidden h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full border border-slate-300 bg-white text-xs font-semibold text-slate-600 shadow-sm group-hover/column:flex"
                            onClick={(event) => {
                              event.stopPropagation();
                              onChange(insertColumnAt(normalizedBlock, columnIndex + 1));
                            }}
                          >
                            +
                          </button>
                          {columnIndex < model.columnCount - 1 ? (
                            <div
                              className="absolute inset-y-0 right-0 w-2 cursor-col-resize"
                              onPointerDown={(event) => {
                                event.stopPropagation();
                                startColumnResize(columnIndex, event.clientX);
                              }}
                            />
                          ) : null}
                        </div>
                      );
                    })}

                    {Array.from({ length: model.rowCount }, (_, rowIndex) => {
                      const active = isRowSelected(rowIndex);
                      return (
                        <div
                          key={`row-${rowIndex}`}
                          className={`group/row relative flex items-center justify-center border-b border-r border-slate-300 bg-white text-[15px] font-medium text-slate-600 ${
                            active ? "bg-emerald-50 text-emerald-800" : ""
                          }`}
                          style={{ gridColumn: 1, gridRow: rowIndex + 2 }}
                        >
                          <button
                            type="button"
                            className="absolute inset-0"
                            onClick={(event) => selectRow(rowIndex, event.shiftKey)}
                            onContextMenu={(event) => openContextMenu(
                              event,
                              isRowSelected(rowIndex)
                                ? (selection as TableSelection)
                                : { type: "row", start: rowIndex, end: rowIndex },
                            )}
                          >
                            <span className="pointer-events-none">{rowIndex + 1}</span>
                          </button>

                          <button
                            type="button"
                            className="absolute left-1/2 -top-2 hidden h-5 w-5 -translate-x-1/2 items-center justify-center rounded-full border border-slate-300 bg-white text-xs font-semibold text-slate-600 shadow-sm group-hover/row:flex"
                            onClick={(event) => {
                              event.stopPropagation();
                              onChange(insertRowAt(normalizedBlock, rowIndex));
                            }}
                          >
                            +
                          </button>
                          <button
                            type="button"
                            className="absolute bottom-[-10px] left-1/2 z-10 hidden h-5 w-5 -translate-x-1/2 items-center justify-center rounded-full border border-slate-300 bg-white text-xs font-semibold text-slate-600 shadow-sm group-hover/row:flex"
                            onClick={(event) => {
                              event.stopPropagation();
                              onChange(insertRowAt(normalizedBlock, rowIndex + 1));
                            }}
                          >
                            +
                          </button>
                          <div
                            className="absolute inset-x-0 bottom-0 h-2 cursor-row-resize"
                            onPointerDown={(event) => {
                              event.stopPropagation();
                              startRowResize(rowIndex, event.clientY);
                            }}
                          />
                        </div>
                      );
                    })}

                    {model.anchors.map((anchor) => {
                      const selected = selectedAnchor && selectedAnchor.row === anchor.row && selectedAnchor.col === anchor.col;
                      const rangeSelected = isSlotSelected(anchor.row, anchor.col);
                      const content = anchor.cell.parts.length
                        ? encodeParts(anchor.cell.parts, anchor.cell.rawText)
                        : anchor.cell.rawText;
                      return (
                        <button
                          key={`cell-${anchor.row}-${anchor.col}`}
                          type="button"
                          className={`relative flex min-h-[44px] items-center border-b border-r border-slate-300 px-3 py-2 text-sm text-slate-700 transition ${
                            anchor.cell.align === "left" ? "justify-start text-left" : anchor.cell.align === "right" ? "justify-end text-right" : "justify-center text-center"
                          } ${
                            selected
                              ? "bg-emerald-50 ring-2 ring-inset ring-emerald-500"
                              : rangeSelected
                                ? "bg-emerald-50/65"
                                : "bg-white hover:bg-slate-50"
                          }`}
                          style={{
                            gridColumn: `${anchor.col + 2} / span ${Math.max(1, anchor.cell.colspan || 1)}`,
                            gridRow: `${anchor.row + 2} / span ${Math.max(1, anchor.cell.rowspan || 1)}`,
                            fontWeight: anchor.cell.bold || anchor.cell.header ? 600 : 400,
                          }}
                          onMouseDown={() => {
                            dragOriginRef.current = { row: anchor.row, col: anchor.col };
                            selectSingleCell(
                              anchor.row,
                              anchor.col,
                              anchor.cellIndex,
                              anchor.cell.rowspan,
                              anchor.cell.colspan,
                            );
                          }}
                          onMouseEnter={() => {
                            if (!dragOriginRef.current) return;
                            updateSelection({
                              type: "cell",
                              range: {
                                rowStart: dragOriginRef.current.row,
                                rowEnd: anchor.row,
                                colStart: dragOriginRef.current.col,
                                colEnd: anchor.col,
                              },
                            });
                          }}
                          onContextMenu={(event) => openContextMenu(event, selection?.type === "cell" && isSlotSelected(anchor.row, anchor.col)
                            ? selection
                            : { type: "cell", range: { rowStart: anchor.row, rowEnd: anchor.row, colStart: anchor.col, colEnd: anchor.col } })}
                        >
                          <span className="max-w-full break-words leading-6">{content?.trim() ? content : "\u00A0"}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {menu ? (
        <>
          <button className="fixed inset-0 z-40 cursor-default" aria-label="关闭菜单" onClick={() => setMenu(null)} />
          <div
            className="fixed z-50 min-w-[180px] rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl"
            style={{ left: menu.x, top: menu.y }}
          >
            <button
              type="button"
              disabled={!mergeEnabled}
              className={`flex w-full items-center rounded-xl px-3 py-2 text-left text-sm ${
                mergeEnabled ? "text-slate-700 hover:bg-slate-50" : "cursor-not-allowed text-slate-300"
              }`}
              onClick={handleMerge}
            >
              合并
            </button>
            <button
              type="button"
              disabled={!splitEnabled}
              className={`flex w-full items-center rounded-xl px-3 py-2 text-left text-sm ${
                splitEnabled ? "text-slate-700 hover:bg-slate-50" : "cursor-not-allowed text-slate-300"
              }`}
              onClick={handleSplit}
            >
              拆分
            </button>
            <button
              type="button"
              className="flex w-full items-center rounded-xl px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
              onClick={() => requestDelete(menu.selection.type === "cell" ? { type: "cell", range: selectionToRange(menu.selection, model?.rowCount || 0, model?.columnCount || 0) } : menu.selection)}
            >
              删除
            </button>
          </div>
        </>
      ) : null}

      <ConfirmModal
        open={!!deleteTarget}
        title="删除当前选择？"
        message={deleteTarget ? `将删除 ${describeSelection(deleteTarget)}，并同步调整合并单元格。` : ""}
        confirmLabel="删除"
        cancelLabel="取消"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />
    </>
  );
}
