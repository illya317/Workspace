import { WorkspaceAnalysisRuntimeError } from "@workspace/platform/server/workspace-analysis-runtime";
import type { WorkspaceAnalysisNestedValueRow } from "@workspace/platform/server/workspace-analysis-nested-values";
import type { QcBatchTemplateSnapshot } from "@workspace/production/types";

export const QC_TEMPLATE_SNAPSHOT_SEGMENT_SIZE = 1_000;
export const QC_TEMPLATE_SNAPSHOT_MAX_SEGMENTS = 200;

export type QcTemplateSnapshotSection = "document" | "fieldModel";

export type QcTemplateSnapshotContext = {
  readonly batchId: number;
  readonly recordUid: string;
  readonly batchNumber: string;
  readonly productId: number | null;
  readonly productKey: string;
  readonly productName: string;
  readonly templateId: number;
  readonly templateVersion: number;
};

export type QcTemplateSnapshotPartitionRow = QcTemplateSnapshotContext & {
  readonly section: QcTemplateSnapshotSection;
  readonly segment: number;
  readonly leafStart: number;
  readonly leafEnd: number;
  readonly leafCount: number;
  readonly firstPath: string;
  readonly lastPath: string;
};

export type QcTemplateSnapshotValueRow = WorkspaceAnalysisNestedValueRow & QcTemplateSnapshotContext & {
  readonly section: QcTemplateSnapshotSection;
  readonly segment: number;
  readonly ordinal: number;
};

export function listQcTemplateSnapshotPartitions(input: {
  readonly context: QcTemplateSnapshotContext;
  readonly snapshot: QcBatchTemplateSnapshot;
  readonly section: QcTemplateSnapshotSection;
}): QcTemplateSnapshotPartitionRow[] {
  const rows: QcTemplateSnapshotPartitionRow[] = [];
  let ordinal = 0;
  walkNestedValues(input.snapshot[input.section], "$", (value) => {
    ordinal += 1;
    const segment = Math.ceil(ordinal / QC_TEMPLATE_SNAPSHOT_SEGMENT_SIZE);
    if (segment > QC_TEMPLATE_SNAPSHOT_MAX_SEGMENTS) {
      throw new WorkspaceAnalysisRuntimeError(
        "source_limit_exceeded",
        `QC 模板快照 ${input.section} 超过 ${QC_TEMPLATE_SNAPSHOT_MAX_SEGMENTS} 个分区`,
        "production.qc.template-snapshot-partitions",
      );
    }
    const current = rows.at(-1);
    if (!current || current.segment !== segment) {
      rows.push({
        ...input.context,
        section: input.section,
        segment,
        leafStart: ordinal,
        leafEnd: ordinal,
        leafCount: 1,
        firstPath: value.path,
        lastPath: value.path,
      });
    } else {
      rows[rows.length - 1] = {
        ...current,
        leafEnd: ordinal,
        leafCount: current.leafCount + 1,
        lastPath: value.path,
      };
    }
    return true;
  });
  return rows;
}

export function readQcTemplateSnapshotSegment(input: {
  readonly context: QcTemplateSnapshotContext;
  readonly snapshot: QcBatchTemplateSnapshot;
  readonly section: QcTemplateSnapshotSection;
  readonly segment: number;
}): QcTemplateSnapshotValueRow[] {
  if (!Number.isInteger(input.segment) || input.segment < 1 || input.segment > QC_TEMPLATE_SNAPSHOT_MAX_SEGMENTS) {
    throw invalidSegment(input.segment);
  }
  const start = (input.segment - 1) * QC_TEMPLATE_SNAPSHOT_SEGMENT_SIZE;
  const end = start + QC_TEMPLATE_SNAPSHOT_SEGMENT_SIZE;
  const rows: QcTemplateSnapshotValueRow[] = [];
  let ordinal = 0;
  walkNestedValues(input.snapshot[input.section], "$", (value) => {
    ordinal += 1;
    if (ordinal > start) {
      rows.push({ ...input.context, section: input.section, segment: input.segment, ordinal, ...value });
    }
    return ordinal < end;
  });
  if (rows.length === 0) throw invalidSegment(input.segment);
  return rows;
}

function walkNestedValues(
  value: unknown,
  path: string,
  visit: (row: WorkspaceAnalysisNestedValueRow) => boolean,
): boolean {
  if (value === null || value === undefined) return visit(row(path, "null", null));
  if (typeof value === "string") return visit(row(path, "text", value));
  if (typeof value === "number") {
    return visit({ path, valueKind: "number", textValue: String(value), numberValue: value, booleanValue: null });
  }
  if (typeof value === "boolean") {
    return visit({ path, valueKind: "boolean", textValue: String(value), numberValue: null, booleanValue: value });
  }
  if (typeof value !== "object") return visit(row(path, "text", String(value)));
  if (Array.isArray(value)) {
    if (value.length === 0) return visit(row(path, "array", "[]"));
    for (let index = 0; index < value.length; index += 1) {
      if (!walkNestedValues(value[index], `${path}[${index}]`, visit)) return false;
    }
    return true;
  }
  const entries = Object.entries(value).sort(([left], [right]) => compareUnicodeCodePoints(left, right));
  if (entries.length === 0) return visit(row(path, "object", "{}"));
  for (const [key, child] of entries) {
    if (!walkNestedValues(child, appendMember(path, key), visit)) return false;
  }
  return true;
}

function compareUnicodeCodePoints(left: string, right: string) {
  let leftOffset = 0;
  let rightOffset = 0;
  while (leftOffset < left.length && rightOffset < right.length) {
    const leftCodePoint = left.codePointAt(leftOffset)!;
    const rightCodePoint = right.codePointAt(rightOffset)!;
    if (leftCodePoint !== rightCodePoint) return leftCodePoint - rightCodePoint;
    leftOffset += leftCodePoint > 0xFFFF ? 2 : 1;
    rightOffset += rightCodePoint > 0xFFFF ? 2 : 1;
  }
  return left.length - right.length;
}

function appendMember(path: string, key: string) {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)
    ? `${path}.${key}`
    : `${path}[${JSON.stringify(key)}]`;
}

function row(
  path: string,
  valueKind: WorkspaceAnalysisNestedValueRow["valueKind"],
  textValue: string | null,
): WorkspaceAnalysisNestedValueRow {
  return { path, valueKind, textValue, numberValue: null, booleanValue: null };
}

function invalidSegment(segment: number) {
  return new WorkspaceAnalysisRuntimeError(
    "source_response_invalid",
    `QC 模板快照分区 ${segment} 不存在`,
    "production.qc.template-snapshot-values",
  );
}
