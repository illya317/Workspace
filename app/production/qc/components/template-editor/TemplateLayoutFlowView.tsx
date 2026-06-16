"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import DetailModal from "@/app/components/DetailModal";
import type {
  QcLayoutBlock,
  QcLayoutCell,
  QcLayoutPart,
  QcTemplateEditorDraft,
  QcTemplateEditorTestDraft,
  QcTemplateStage,
} from "@/server/services/production/qc";
import { blockLabel } from "./editor-utils";

interface Props {
  draft: QcTemplateEditorDraft;
  stage: QcTemplateStage;
  test?: QcTemplateEditorTestDraft;
}

interface PartEditorTarget {
  blockIndex: number;
  rowIndex?: number;
  cellIndex?: number;
  partIndex: number;
  synthetic?: {
    kind: "blockFieldOverride";
    overrideKey: string;
  };
}

interface NumberedBlock extends QcLayoutBlock {
  displaySection?: string;
}

const TRIMMABLE_TEXT_PART_TYPES = new Set<QcLayoutPart["type"]>(["text", "hint", "note"]);

const FIELD_TYPE_OPTIONS = [
  { value: "field", label: "文本输入" },
  { value: "select", label: "下拉选择" },
  { value: "radio", label: "单选" },
  { value: "checkbox", label: "复选" },
  { value: "date", label: "日期字段" },
];

const INPUT_TYPE_OPTIONS = [
  { value: "", label: "自动" },
  { value: "number", label: "数字" },
  { value: "date", label: "日期" },
  { value: "textarea", label: "多行文本" },
];

function joinSectionSuffix(base?: string, suffix?: string) {
  if (!base) return suffix || "";
  if (!suffix || suffix === "auto") return base;
  return `${base}.${suffix}`;
}

function isNumericSection(suffix?: string): suffix is string {
  return !!suffix && /^\d+(?:\.\d+)*$/.test(suffix);
}

function numberBlocks(blocks: QcLayoutBlock[], sequence?: string) {
  let nextTopLevel = 1;
  const sectionAliases: Record<string, string> = {};
  return blocks.map((block) => {
    const suffix = block.sectionSuffix;
    const role = block.sectionRole;
    let displaySection: string | undefined;
    if (block.sectionRef) {
      const nestedSuffix = joinSectionSuffix(sectionAliases[block.sectionRef], suffix);
      displaySection = nestedSuffix ? sequence ? `${sequence}.${nestedSuffix}` : nestedSuffix : undefined;
      if (nestedSuffix && role && (block.sectionAnchor || block.sectionSlot)) sectionAliases[role] = nestedSuffix;
    } else if (isNumericSection(suffix)) {
      displaySection = sequence ? `${sequence}.${suffix}` : suffix;
      const topLevel = Number(suffix.split(".")[0]);
      if (Number.isFinite(topLevel)) nextTopLevel = Math.max(nextTopLevel, topLevel + 1);
      if (role) sectionAliases[role] = suffix;
    } else if (block.sectionSlot || suffix === "auto" || block.sectionAnchor) {
      const alias = String(nextTopLevel++);
      if (role) sectionAliases[role] = alias;
      displaySection = sequence ? `${sequence}.${alias}` : alias;
    }
    return { ...block, displaySection };
  });
}

function badgeLabel(part: QcLayoutPart) {
  const raw = part.field || part.fieldKey || part.name || "未命名字段";
  const segments = raw.split("/").filter(Boolean);
  return segments[segments.length - 1] || raw;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function normalizeInlineParts(parts: QcLayoutPart[]) {
  const normalized: QcLayoutPart[] = [];
  for (const part of parts) {
    if (TRIMMABLE_TEXT_PART_TYPES.has(part.type)) {
      const text = part.text || "";
      if (!text.trim()) continue;
      normalized.push(part);
      continue;
    }
    normalized.push(part);
  }
  return normalized;
}

function mutatePartListAt(
  blocks: QcLayoutBlock[],
  target: PartEditorTarget,
  updater: (parts: QcLayoutPart[]) => QcLayoutPart[],
  options?: {
    normalize?: boolean;
  },
) {
  const normalize = options?.normalize !== false;
  return blocks.map((block, blockIndex) => {
    if (blockIndex !== target.blockIndex) return block;
    if (target.rowIndex != null && target.cellIndex != null && block.rows) {
      return {
        ...block,
        rows: block.rows.map((row, rowIndex) =>
          rowIndex !== target.rowIndex
            ? row
            : row.map((cell, cellIndex) =>
                cellIndex !== target.cellIndex
                  ? cell
                  : {
                      ...cell,
                      parts: normalize ? normalizeInlineParts(updater(cell.parts)) : updater(cell.parts),
                    },
              ),
        ),
      };
    }
    if (block.parts) {
      return {
        ...block,
        parts: normalize ? normalizeInlineParts(updater(block.parts)) : updater(block.parts),
      };
    }
    return block;
  });
}

function updatePartAt(
  blocks: QcLayoutBlock[],
  target: PartEditorTarget,
  updater: (part: QcLayoutPart) => QcLayoutPart,
) {
  return mutatePartListAt(blocks, target, (parts) =>
    parts.map((part, partIndex) => (partIndex === target.partIndex ? updater(part) : part)),
  );
}

function insertPartAt(
  blocks: QcLayoutBlock[],
  target: PartEditorTarget,
  newPart: QcLayoutPart,
  options?: {
    normalize?: boolean;
  },
) {
  return mutatePartListAt(blocks, target, (parts) => [
    ...parts.slice(0, target.partIndex + 1),
    newPart,
    ...parts.slice(target.partIndex + 1),
  ], options);
}

function replacePartAt(
  blocks: QcLayoutBlock[],
  target: PartEditorTarget,
  replacementParts: QcLayoutPart[],
  options?: {
    normalize?: boolean;
  },
) {
  return mutatePartListAt(blocks, target, (parts) => [
    ...parts.slice(0, target.partIndex),
    ...replacementParts,
    ...parts.slice(target.partIndex + 1),
  ], options);
}

function movePartAt(
  blocks: QcLayoutBlock[],
  source: PartEditorTarget,
  destination: PartEditorTarget,
) {
  if (
    source.blockIndex !== destination.blockIndex
    || source.rowIndex !== destination.rowIndex
    || source.cellIndex !== destination.cellIndex
    || source.partIndex === destination.partIndex
  ) {
    return blocks;
  }
  return mutatePartListAt(blocks, source, (parts) => {
    if (source.partIndex < 0 || source.partIndex >= parts.length || destination.partIndex < 0 || destination.partIndex >= parts.length) {
      return parts;
    }
    const next = [...parts];
    const [moved] = next.splice(source.partIndex, 1);
    next.splice(destination.partIndex, 0, moved);
    return next;
  });
}

function sameTarget(a?: PartEditorTarget | null, b?: PartEditorTarget | null) {
  if (!a || !b) return false;
  return a.blockIndex === b.blockIndex
    && a.rowIndex === b.rowIndex
    && a.cellIndex === b.cellIndex
    && a.partIndex === b.partIndex
    && a.synthetic?.kind === b.synthetic?.kind
    && a.synthetic?.overrideKey === b.synthetic?.overrideKey;
}

function badge(
  part: QcLayoutPart,
  key: string,
  onClick?: () => void,
) {
  const tone =
    part.type === "param"
      ? "border-rose-200 bg-rose-50 text-rose-800 hover:border-rose-300 hover:bg-rose-100"
      : part.type === "text" || part.type === "hint" || part.type === "note"
        ? "border-slate-200 bg-slate-100 text-slate-700 hover:border-slate-300 hover:bg-slate-200"
        : "border-emerald-200 bg-emerald-50 text-emerald-800 hover:border-emerald-300 hover:bg-emerald-100";
  return (
    <button
      type="button"
      key={key}
      onClick={onClick}
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[12px] font-medium leading-5 ${tone}`}
    >
      {part.type === "text" || part.type === "hint" || part.type === "note" ? (part.text || "固定文本") : badgeLabel(part)}
    </button>
  );
}

function readonlyFieldBadge(fieldKey: string, label?: string, onClick?: () => void) {
  return badge(
    { type: "field", fieldKey, field: fieldKey, name: label || fieldKey },
    `readonly-${fieldKey}`,
    onClick,
  );
}

function fieldKeyOverride(block: QcLayoutBlock, overrideKey: string, fallback: string) {
  return block.fieldKeyOverrides?.[overrideKey] || fallback;
}

function renderPart(part: QcLayoutPart, key: string, onClick?: () => void): ReactNode {
  if (part.type === "text" || part.type === "hint" || part.type === "note" || part.type === "field" || part.type === "line" || part.type === "select" || part.type === "radio" || part.type === "checkbox" || part.type === "date" || part.type === "duration_days" || part.type === "duration_hours" || part.type === "param") {
    return badge(part, key, onClick);
  }
  if (part.type === "br") return <br key={key} />;
  return part.text || part.defaultValue || part.fieldKey || part.field || "";
}

function renderParts(
  parts: QcLayoutPart[],
  targetFactory?: (partIndex: number) => () => void,
) {
  return parts.map((part, index) => (
    <span key={`${part.type}-${part.fieldKey || part.field || part.name || "part"}-${index}`} className="contents">
      {renderPart(
        part,
        `${part.type}-${part.fieldKey || part.field || part.name || "part"}-${index}`,
        targetFactory?.(index),
      )}
    </span>
  ));
}

function renderCellContent(cell: QcLayoutCell, targetFactory?: (partIndex: number) => () => void) {
  if (cell.rawText?.trim()) return cell.rawText.trim();
  if (!cell.parts.length) return " ";
  return <span className="inline-flex flex-wrap items-center justify-center gap-1.5">{renderParts(cell.parts, targetFactory)}</span>;
}

function InfoGrid({ items }: { items: Array<{ label: string; value: string }> }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {items.map((item) => (
        <div key={item.label} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="text-xs font-semibold text-slate-500">{item.label}</div>
          <div className="mt-1 text-sm text-slate-800">{item.value}</div>
        </div>
      ))}
    </div>
  );
}

function TableCard({
  blockIndex,
  rows,
  onEditPart,
}: {
  blockIndex: number;
  rows: QcLayoutCell[][];
  onEditPart: (target: PartEditorTarget, part: QcLayoutPart) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
      <table className="w-full border-collapse text-sm text-slate-700">
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td
                  key={`${rowIndex}-${cellIndex}`}
                  colSpan={cell.colspan}
                  rowSpan={cell.rowspan}
                  className={`border border-slate-200 px-3 py-2 align-middle ${cell.header || cell.bold ? "bg-slate-50 font-semibold text-slate-900" : "bg-white"} ${cell.align === "left" ? "text-left" : cell.align === "right" ? "text-right" : "text-center"}`}
                >
                  <div className="whitespace-pre-wrap break-words">
                    {renderCellContent(cell, (partIndex) => () => onEditPart({ blockIndex, rowIndex, cellIndex, partIndex }, cell.parts[partIndex]))}
                  </div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BlockBody({
  block,
  blockIndex,
  stage,
  test,
  onEditPart,
  editingText,
  setEditingText,
  saveTextEditor,
  insertingAt,
  setInsertingAt,
  openTextEditor,
  insertPart,
  draggingTarget,
  dragOverTarget,
  onDragStartPart,
  onDragEnterPart,
  onDropPart,
  onDragEndPart,
}: {
  block: NumberedBlock;
  blockIndex: number;
  stage: QcTemplateStage;
  test?: QcTemplateEditorTestDraft;
  onEditPart: (target: PartEditorTarget, part: QcLayoutPart) => void;
  editingText: { target: PartEditorTarget; value: string; cursor: number } | null;
  setEditingText: React.Dispatch<React.SetStateAction<{ target: PartEditorTarget; value: string; cursor: number } | null>>;
  saveTextEditor: () => void;
  insertingAt: PartEditorTarget | null;
  setInsertingAt: React.Dispatch<React.SetStateAction<PartEditorTarget | null>>;
  openTextEditor: (target: PartEditorTarget, text: string) => void;
  insertPart: (kind: "text" | "param" | "field") => void;
  draggingTarget: PartEditorTarget | null;
  dragOverTarget: PartEditorTarget | null;
  onDragStartPart: (target: PartEditorTarget) => void;
  onDragEnterPart: (target: PartEditorTarget) => void;
  onDropPart: (target: PartEditorTarget) => void;
  onDragEndPart: () => void;
}) {
  const openSyntheticField = (
    overrideKey: string,
    fieldKey: string,
    fieldType: QcLayoutPart["type"] = "field",
  ) => {
    onEditPart(
      {
        blockIndex,
        partIndex: -1,
        synthetic: {
          kind: "blockFieldOverride",
          overrideKey,
        },
      },
      {
        type: fieldType,
        fieldKey,
        field: fieldKey,
        name: fieldKey,
      },
    );
  };

  if (block.type === "project_header") {
    const inspectionDateKey = fieldKeyOverride(block, "inspection_date", block.inspectionDateKey || "layout/common/inspection_date");
    const completionDateKey = fieldKeyOverride(block, "completion_date", block.completionDateKey || "layout/common/complete_date");
    const judgmentDateKey = fieldKeyOverride(block, "judgment_date", block.judgmentDateKey || "layout/common/judgment_date");
    return (
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="text-xs font-semibold text-slate-500">检测项目</div>
          <div className="mt-1 text-sm text-slate-800">{test ? `${test.sequence || `2.${test.order}`} ${test.name}` : "检验前确认"}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="text-xs font-semibold text-slate-500">检验日期</div>
          <div className="mt-2">{readonlyFieldBadge(inspectionDateKey, undefined, () => openSyntheticField("inspection_date", inspectionDateKey, "date"))}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="text-xs font-semibold text-slate-500">完成日期</div>
          <div className="mt-2">{readonlyFieldBadge(completionDateKey, undefined, () => openSyntheticField("completion_date", completionDateKey, "date"))}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="text-xs font-semibold text-slate-500">判定日期</div>
          <div className="mt-2">{readonlyFieldBadge(judgmentDateKey, undefined, () => openSyntheticField("judgment_date", judgmentDateKey, "date"))}</div>
        </div>
      </div>
    );
  }

  if (block.type === "microbiology_header") {
    const packagingKey = fieldKeyOverride(block, "packaging", block.packagingKey || "layout/microbiology/packaging");
    const sampleQuantityKey = fieldKeyOverride(block, "sample_quantity", block.sampleQuantityKey || "layout/microbiology/sample_quantity");
    const inspectionDateKey = fieldKeyOverride(block, "inspection_date", block.inspectionDateKey || "layout/microbiology/inspection_date");
    const completionDateKey = fieldKeyOverride(block, "completion_date", block.completionDateKey || "layout/microbiology/completion_date");
    const judgmentDateKey = fieldKeyOverride(block, "judgment_date", block.judgmentDateKey || "layout/microbiology/judgment_date");
    return (
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="text-xs font-semibold text-slate-500">包装情况</div>
          <div className="mt-2">{readonlyFieldBadge(packagingKey, undefined, () => openSyntheticField("packaging", packagingKey))}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="text-xs font-semibold text-slate-500">检品数量</div>
          <div className="mt-2">{readonlyFieldBadge(sampleQuantityKey, undefined, () => openSyntheticField("sample_quantity", sampleQuantityKey))}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="text-xs font-semibold text-slate-500">检验日期</div>
          <div className="mt-2">{readonlyFieldBadge(inspectionDateKey, undefined, () => openSyntheticField("inspection_date", inspectionDateKey, "date"))}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="text-xs font-semibold text-slate-500">完成日期</div>
          <div className="mt-2">{readonlyFieldBadge(completionDateKey, undefined, () => openSyntheticField("completion_date", completionDateKey, "date"))}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 md:col-span-2">
          <div className="text-xs font-semibold text-slate-500">判定日期</div>
          <div className="mt-2">{readonlyFieldBadge(judgmentDateKey, undefined, () => openSyntheticField("judgment_date", judgmentDateKey, "date"))}</div>
        </div>
      </div>
    );
  }

  if (block.type === "environment_table") {
    const prefix = block.fieldPrefix || "layout/environment";
    const rowCount = block.roomRows || 1;
    return (
      <div className="space-y-3">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="text-xs font-semibold text-slate-500">温度要求</div>
            <div className="mt-1 text-sm text-slate-800">{block.temperatureRange || "10℃～30℃"}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="text-xs font-semibold text-slate-500">湿度要求</div>
            <div className="mt-1 text-sm text-slate-800">{block.humidityLimit || "≤75%"}</div>
          </div>
        </div>
        {Array.from({ length: rowCount }, (_, index) => {
          const rowNo = index + 1;
          return (
            <div key={`environment-row-${rowNo}`} className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
              <div className="mb-3 text-sm font-semibold text-slate-900">房间 {rowNo}</div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-xs font-semibold text-slate-500">房间名称</div>
                  <div className="mt-2">{readonlyFieldBadge(fieldKeyOverride(block, `room_name_${rowNo}`, `${prefix}/room_name_${rowNo}`), undefined, () => openSyntheticField(`room_name_${rowNo}`, fieldKeyOverride(block, `room_name_${rowNo}`, `${prefix}/room_name_${rowNo}`)))}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-xs font-semibold text-slate-500">房间编号</div>
                  <div className="mt-2">{readonlyFieldBadge(fieldKeyOverride(block, `room_no_${rowNo}`, `${prefix}/room_no_${rowNo}`), undefined, () => openSyntheticField(`room_no_${rowNo}`, fieldKeyOverride(block, `room_no_${rowNo}`, `${prefix}/room_no_${rowNo}`)))}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-xs font-semibold text-slate-500">温度</div>
                  <div className="mt-2 inline-flex items-center gap-2">
                    {readonlyFieldBadge(fieldKeyOverride(block, `temperature_${rowNo}`, `${prefix}/temperature_${rowNo}`), undefined, () => openSyntheticField(`temperature_${rowNo}`, fieldKeyOverride(block, `temperature_${rowNo}`, `${prefix}/temperature_${rowNo}`)))}
                    <span className="text-sm text-slate-500">℃</span>
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-xs font-semibold text-slate-500">湿度</div>
                  <div className="mt-2 inline-flex items-center gap-2">
                    {readonlyFieldBadge(fieldKeyOverride(block, `humidity_${rowNo}`, `${prefix}/humidity_${rowNo}`), undefined, () => openSyntheticField(`humidity_${rowNo}`, fieldKeyOverride(block, `humidity_${rowNo}`, `${prefix}/humidity_${rowNo}`)))}
                    <span className="text-sm text-slate-500">%</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  if (block.type === "equipment_table") {
    return (
      <div className="space-y-2">
        {(block.devices || []).map((device, index) => (
          <div key={`${device.name}-${index}`} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800">
            <div className="font-semibold text-slate-900">{device.name}</div>
            <div className="mt-1 text-slate-500">{(device.status || "已清洁").replace(/^["“]+|["”]+$/g, "")}</div>
          </div>
        ))}
        {(!block.devices || block.devices.length === 0) && <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500">该块未配置设备列表。</div>}
      </div>
    );
  }

  if (block.type === "materials_table" || block.type === "reference_standard_table") {
    const items = block.type === "materials_table" ? block.materials : block.standards;
    return (
      <div className="space-y-2">
        {(items || []).map((item, index) => (
          <div key={`${item.name}-${index}`} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800">
            {item.name}
          </div>
        ))}
        {(!items || items.length === 0) && <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500">该块未配置条目。</div>}
      </div>
    );
  }

  if (block.type === "cleanup_checklist") {
    return (
      <div className="space-y-2">
        {(block.items || []).map((item, index) => (
          <div key={`${item}-${index}`} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800">
            {item}
          </div>
        ))}
        {(!block.items || block.items.length === 0) && <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500">该块未配置清场项目。</div>}
      </div>
    );
  }

  if (block.rows?.length) return <TableCard blockIndex={blockIndex} rows={block.rows} onEditPart={onEditPart} />;

  if (block.parts?.length) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-7 whitespace-pre-wrap text-slate-700">
        <div className="inline-flex flex-wrap items-center gap-1.5">
          {block.parts.map((part, partIndex) => {
            const target: PartEditorTarget = { blockIndex, partIndex };
            const partKey = `${part.type}-${part.fieldKey || part.field || part.name || "part"}-${partIndex}`;
            const isEditingCurrentText = sameTarget(editingText?.target, target);
            const isDragging = sameTarget(draggingTarget, target);
            const isDragOver = sameTarget(dragOverTarget, target);
            return (
              <span
                key={partKey}
                className={`relative inline-flex items-center gap-1.5 rounded-2xl transition ${isDragging ? "opacity-60" : ""} ${isDragOver ? "ring-2 ring-emerald-200 ring-offset-2" : ""}`}
                draggable={!isEditingCurrentText}
                onDragStart={() => onDragStartPart(target)}
                onDragEnter={(event) => {
                  event.preventDefault();
                  onDragEnterPart(target);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  onDropPart(target);
                }}
                onDragEnd={onDragEndPart}
              >
                {isEditingCurrentText ? (
                  <input
                    autoFocus
                    value={editingText?.value || ""}
                    onChange={(event) => {
                      const value = event.target.value;
                      const cursor = event.currentTarget.selectionStart ?? value.length;
                      setEditingText((current) => current ? { ...current, value, cursor } : current);
                    }}
                    onClick={(event) => {
                      const cursor = event.currentTarget.selectionStart ?? editingText?.cursor ?? 0;
                      setEditingText((current) => current ? { ...current, cursor } : current);
                    }}
                    onKeyUp={(event) => {
                      const cursor = event.currentTarget.selectionStart ?? editingText?.cursor ?? 0;
                      setEditingText((current) => current ? { ...current, cursor } : current);
                    }}
                    onSelect={(event) => {
                      const cursor = event.currentTarget.selectionStart ?? editingText?.cursor ?? 0;
                      setEditingText((current) => current ? { ...current, cursor } : current);
                    }}
                    onBlur={saveTextEditor}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        saveTextEditor();
                      }
                      if (event.key === "Escape") {
                        setEditingText(null);
                      }
                    }}
                    className="h-9 min-w-[12rem] rounded-full border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none focus:border-slate-400"
                  />
                ) : (
                  renderPart(
                    part,
                    partKey,
                    () => (part.type === "text" || part.type === "hint" || part.type === "note")
                      ? openTextEditor(target, part.text || "")
                      : onEditPart(target, part),
                  )
                )}

                <div className="relative">
                  <button
                    type="button"
                    draggable={false}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => setInsertingAt(sameTarget(insertingAt, target) ? null : target)}
                    className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-sm text-slate-500 hover:border-emerald-300 hover:text-emerald-700"
                  >
                    +
                  </button>
                  {sameTarget(insertingAt, target) ? (
                    <div className="absolute left-0 top-8 z-10 min-w-[9rem] rounded-2xl border border-slate-200 bg-white p-1 shadow-lg">
                      <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => insertPart("text")} className="block w-full rounded-xl px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50">固定文本</button>
                      <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => insertPart("param")} className="block w-full rounded-xl px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50">模板参数</button>
                      <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => insertPart("field")} className="block w-full rounded-xl px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50">填写字段</button>
                    </div>
                  ) : null}
                </div>
              </span>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-7 whitespace-pre-wrap text-slate-700">
      {block.text || "这个板块目前还没有最小化内容。"}
    </div>
  );
}

export default function TemplateLayoutFlowView({ draft, stage, test }: Props) {
  const [blocks, setBlocks] = useState<QcLayoutBlock[]>(() => clone(draft.layoutDraft.blocks));
  const [editingField, setEditingField] = useState<{ target: PartEditorTarget; part: QcLayoutPart } | null>(null);
  const [editingText, setEditingText] = useState<{ target: PartEditorTarget; value: string; cursor: number } | null>(null);
  const [insertingAt, setInsertingAt] = useState<PartEditorTarget | null>(null);
  const [draggingTarget, setDraggingTarget] = useState<PartEditorTarget | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<PartEditorTarget | null>(null);
  const [confirmDeleteTarget, setConfirmDeleteTarget] = useState<PartEditorTarget | null>(null);
  const [fieldKeyValue, setFieldKeyValue] = useState("");
  const [typeValue, setTypeValue] = useState("");
  const [placeholderValue, setPlaceholderValue] = useState("");
  const [defaultValueValue, setDefaultValueValue] = useState("");
  const [widthValue, setWidthValue] = useState("");
  const [optionsValue, setOptionsValue] = useState("");
  const [inputTypeValue, setInputTypeValue] = useState("");
  const [underlineValue, setUnderlineValue] = useState(false);
  const [readonlyValue, setReadonlyValue] = useState(false);
  const prefix = draft.nodeType === "precheck" ? "1" : draft.sequence || test?.sequence || "2";
  const numberedBlocks = useMemo(() => numberBlocks(blocks, prefix), [blocks, prefix]);

  useEffect(() => {
    setBlocks(clone(draft.layoutDraft.blocks));
    setEditingField(null);
    setEditingText(null);
    setInsertingAt(null);
    setDraggingTarget(null);
    setDragOverTarget(null);
    setConfirmDeleteTarget(null);
  }, [draft]);

  function onDragStartPart(target: PartEditorTarget) {
    setDraggingTarget(target);
    setDragOverTarget(target);
    setInsertingAt(null);
  }

  function onDragEnterPart(target: PartEditorTarget) {
    if (!draggingTarget) return;
    setDragOverTarget(target);
  }

  function onDropPart(target: PartEditorTarget) {
    if (!draggingTarget) return;
    setBlocks((current) => movePartAt(current, draggingTarget, target));
    setDraggingTarget(null);
    setDragOverTarget(null);
  }

  function onDragEndPart() {
    setDraggingTarget(null);
    setDragOverTarget(null);
  }

  function onDeleteToken(target: PartEditorTarget) {
    setConfirmDeleteTarget(target);
  }

  function confirmDeletePart() {
    if (!confirmDeleteTarget) return;
    setBlocks((current) =>
      mutatePartListAt(current, confirmDeleteTarget, (parts) =>
        parts.filter((_, index) => index !== confirmDeleteTarget.partIndex),
      ),
    );
    setConfirmDeleteTarget(null);
    if (editingText && sameTarget(editingText.target, confirmDeleteTarget)) {
      setEditingText(null);
    }
    if (insertingAt && sameTarget(insertingAt, confirmDeleteTarget)) {
      setInsertingAt(null);
    }
  }

  function openFieldEditor(target: PartEditorTarget, part: QcLayoutPart) {
    setEditingField({ target, part });
    setEditingText(null);
    setInsertingAt(null);
    setFieldKeyValue(part.fieldKey || part.field || part.name || "");
    setTypeValue(part.type === "line" ? "field" : part.type || "");
    setPlaceholderValue(part.placeholder || "");
    setDefaultValueValue(part.defaultValue || "");
    setWidthValue(part.width || "");
    setOptionsValue((part.options || []).join("\n"));
    setInputTypeValue(part.inputType || "");
    setUnderlineValue(part.underline === true);
    setReadonlyValue(part.readonlyDisplay === true);
  }

  function openTextEditor(target: PartEditorTarget, text: string) {
    setEditingField(null);
    setInsertingAt(null);
    setEditingText({ target, value: text, cursor: text.length });
  }

  function saveTextEditor() {
    if (!editingText) return;
    setBlocks((current) =>
        updatePartAt(current, editingText.target, (part) => ({
          ...part,
          type: "text",
          text: editingText.value,
      })),
    );
    setEditingText(null);
  }

  function insertPart(kind: "text" | "param" | "field") {
    if (!insertingAt) return;
    const createPart = (): QcLayoutPart => {
      if (kind === "text") return { type: "text", text: "新文本" };
      if (kind === "param") return { type: "param", name: "new_param", defaultValue: "" };
      return { type: "field", fieldKey: "new_field", field: "new_field" };
    };
    const newPart = createPart();

    if (editingText && sameTarget(editingText.target, insertingAt)) {
      const cursor = Math.max(0, Math.min(editingText.cursor, editingText.value.length));
      const beforeText = editingText.value.slice(0, cursor);
      const afterText = editingText.value.slice(cursor);
      const replacementParts: QcLayoutPart[] = [];
      if (beforeText) replacementParts.push({ type: "text", text: beforeText });
      const insertedIndex = replacementParts.length;
      replacementParts.push(newPart);
      if (afterText) replacementParts.push({ type: "text", text: afterText });
      const nextTarget = { ...insertingAt, partIndex: insertingAt.partIndex + insertedIndex };
      setBlocks((current) => replacePartAt(current, insertingAt, replacementParts, { normalize: kind !== "text" }));
      setInsertingAt(null);
      setEditingText(null);
      if (kind === "text") {
        setEditingText({ target: nextTarget, value: "新文本", cursor: "新文本".length });
      } else {
        openFieldEditor(nextTarget, newPart);
      }
      return;
    }

    const nextTarget = { ...insertingAt, partIndex: insertingAt.partIndex + 1 };
    if (kind === "text") {
      setBlocks((current) => insertPartAt(current, insertingAt, newPart, { normalize: false }));
      setInsertingAt(null);
      setEditingText({ target: nextTarget, value: "新文本", cursor: "新文本".length });
      return;
    }
    setBlocks((current) => insertPartAt(current, insertingAt, newPart));
    setInsertingAt(null);
    openFieldEditor(nextTarget, newPart);
  }

  function saveFieldEditor() {
    if (!editingField) return;
    if (editingField.part.type === "param" && !editingField.target.synthetic) {
      setBlocks((current) =>
        updatePartAt(current, editingField.target, (part) => ({
          ...part,
          type: "param",
          name: fieldKeyValue || undefined,
          field: undefined,
          fieldKey: undefined,
          defaultValue: defaultValueValue || undefined,
        })),
      );
      setEditingField(null);
      return;
    }
    const overrideKey =
      editingField.target.synthetic?.kind === "blockFieldOverride"
        ? editingField.target.synthetic.overrideKey
        : null;
    if (overrideKey) {
      setBlocks((current) =>
        current.map((block, blockIndex) =>
          blockIndex !== editingField.target.blockIndex
            ? block
            : {
                ...block,
                fieldKeyOverrides: {
                  ...(block.fieldKeyOverrides || {}),
                  [overrideKey]: fieldKeyValue,
                },
              },
        ),
      );
      setEditingField(null);
      return;
    }
    setBlocks((current) =>
      updatePartAt(current, editingField.target, (part) => ({
        ...part,
        type: typeValue || part.type,
        fieldKey: fieldKeyValue || undefined,
        field: fieldKeyValue || undefined,
        placeholder: placeholderValue || undefined,
        defaultValue: defaultValueValue || undefined,
        width: widthValue || undefined,
        options: optionsValue
          .split("\n")
          .map((item) => item.trim())
          .filter(Boolean),
        inputType: inputTypeValue || undefined,
        underline: underlineValue || undefined,
        readonlyDisplay: readonlyValue || undefined,
      })),
    );
    setEditingField(null);
  }

  const isParamEditor = editingField?.part.type === "param" && !editingField?.target.synthetic;

  return (
    <section className="space-y-4 rounded-[28px] border border-slate-200 bg-white p-5">
      <div className="space-y-4">
        {numberedBlocks.map((block, index) => (
          <section key={`${block.type}-${index}`} className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="mb-3 text-lg font-semibold text-slate-900">
              {block.displaySection ? `${block.displaySection} ` : ""}{blockLabel(block, index)}
            </h3>
            <BlockBody
              block={block}
              blockIndex={index}
              stage={stage}
              test={test}
              onEditPart={openFieldEditor}
              editingText={editingText}
              setEditingText={setEditingText}
              saveTextEditor={saveTextEditor}
              insertingAt={insertingAt}
              setInsertingAt={setInsertingAt}
              openTextEditor={openTextEditor}
              insertPart={insertPart}
              draggingTarget={draggingTarget}
              dragOverTarget={dragOverTarget}
              onDragStartPart={onDragStartPart}
              onDragEnterPart={onDragEnterPart}
              onDropPart={onDropPart}
              onDragEndPart={onDragEndPart}
            />
          </section>
        ))}
        {numberedBlocks.length === 0 && (
          <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center text-sm text-slate-500">
            当前选择项还没有可展示的板块。
          </div>
        )}
      </div>

      <DetailModal open={Boolean(editingField)} title="编辑字段" onClose={() => setEditingField(null)} maxWidth="max-w-2xl">
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1">
              <div className="text-xs font-semibold text-slate-500">字段标识</div>
              <input value={fieldKeyValue} onChange={(event) => setFieldKeyValue(event.target.value)} className="h-10 w-full rounded-xl border border-slate-300 px-3 text-sm text-slate-800 outline-none focus:border-emerald-500" />
            </label>
            <label className="space-y-1">
              <div className="text-xs font-semibold text-slate-500">默认值</div>
              <input value={defaultValueValue} onChange={(event) => setDefaultValueValue(event.target.value)} className="h-10 w-full rounded-xl border border-slate-300 px-3 text-sm text-slate-800 outline-none focus:border-emerald-500" />
            </label>
            {!isParamEditor ? (
              <>
                <label className="space-y-1">
                  <div className="text-xs font-semibold text-slate-500">字段类型</div>
                  <select value={typeValue} onChange={(event) => setTypeValue(event.target.value)} className="h-10 w-full rounded-xl border border-slate-300 px-3 text-sm text-slate-800 outline-none focus:border-emerald-500">
                    {FIELD_TYPE_OPTIONS.map((item) => (
                      <option key={item.value} value={item.value}>{item.label}</option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1">
                  <div className="text-xs font-semibold text-slate-500">占位提示</div>
                  <input value={placeholderValue} onChange={(event) => setPlaceholderValue(event.target.value)} className="h-10 w-full rounded-xl border border-slate-300 px-3 text-sm text-slate-800 outline-none focus:border-emerald-500" />
                </label>
                <label className="space-y-1">
                  <div className="text-xs font-semibold text-slate-500">宽度</div>
                  <input value={widthValue} onChange={(event) => setWidthValue(event.target.value)} placeholder="例如 6.5rem" className="h-10 w-full rounded-xl border border-slate-300 px-3 text-sm text-slate-800 outline-none focus:border-emerald-500" />
                </label>
                <label className="space-y-1">
                  <div className="text-xs font-semibold text-slate-500">输入类型</div>
                  <select value={inputTypeValue} onChange={(event) => setInputTypeValue(event.target.value)} className="h-10 w-full rounded-xl border border-slate-300 px-3 text-sm text-slate-800 outline-none focus:border-emerald-500">
                    {INPUT_TYPE_OPTIONS.map((item) => (
                      <option key={item.value || "auto"} value={item.value}>{item.label}</option>
                    ))}
                  </select>
                  <div className="text-[11px] leading-5 text-slate-500">
                    自动 = 普通单行输入；如果字段类型本身是日期、下拉、单选等，会优先按字段类型渲染。
                  </div>
                </label>
              </>
            ) : null}
          </div>

          {!isParamEditor && (typeValue === "select" || typeValue === "radio" || typeValue === "checkbox") && (
            <label className="space-y-1">
              <div className="text-xs font-semibold text-slate-500">选项列表</div>
              <textarea value={optionsValue} onChange={(event) => setOptionsValue(event.target.value)} rows={4} placeholder={"每行一个选项"} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none focus:border-emerald-500" />
            </label>
          )}

          {!isParamEditor ? (
            <div className="flex flex-wrap gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={underlineValue} onChange={(event) => setUnderlineValue(event.target.checked)} />
                下划线
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={readonlyValue} onChange={(event) => setReadonlyValue(event.target.checked)} />
                只读展示
              </label>
            </div>
          ) : null}

          <div className="flex justify-end gap-3">
            <div className="mr-auto">
              <button
                onClick={() => {
                  if (editingField) {
                    setEditingField(null);
                    onDeleteToken(editingField.target);
                  }
                }}
                className="h-10 rounded-xl border border-rose-300 bg-rose-50 px-4 text-sm font-semibold text-rose-700 hover:bg-rose-100"
              >
                删除字段
              </button>
            </div>
            <button onClick={() => setEditingField(null)} className="h-10 rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              取消
            </button>
            <button onClick={saveFieldEditor} className="h-10 rounded-xl border border-emerald-600 bg-emerald-50 px-4 text-sm font-semibold text-emerald-800 hover:bg-emerald-100">
              应用到当前视图
            </button>
          </div>
        </div>
      </DetailModal>

      <DetailModal open={Boolean(confirmDeleteTarget)} title="删除这个片段？" onClose={() => setConfirmDeleteTarget(null)} maxWidth="max-w-md">
        <div className="space-y-4">
          <p className="text-sm leading-6 text-slate-600">
            删除后只会清理纯空白片段，不会再自动拼接相邻的固定文本，这一步仅影响当前前端草稿视图。
          </p>
          <div className="flex justify-end gap-3">
            <button onClick={() => setConfirmDeleteTarget(null)} className="h-10 rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              取消
            </button>
            <button onClick={confirmDeletePart} className="h-10 rounded-xl border border-rose-300 bg-rose-50 px-4 text-sm font-semibold text-rose-700 hover:bg-rose-100">
              确认删除
            </button>
          </div>
        </div>
      </DetailModal>
    </section>
  );
}
