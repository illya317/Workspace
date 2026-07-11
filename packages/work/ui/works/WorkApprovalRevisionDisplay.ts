"use client";

import { createRecordSection, type BodySurfaceSectionSpec, type FormSurfaceReadOnlyFieldSpec } from "@workspace/core/ui";
import type { WorkTaskApprovalRequest } from "./types";

export function revisionReadonlyFields(
  request: WorkTaskApprovalRequest,
  common: FormSurfaceReadOnlyFieldSpec[],
  updatedAt: string,
): FormSurfaceReadOnlyFieldSpec[] {
  const data = request.latestPayload.data;
  return [
    ...common,
    readonlyField("revisionTarget", "修订对象", revisionTargetLabel(data.changeTarget)),
    readonlyField("reason", "修订原因", stringValue(data.reason) || stringValue(data.description) || "未填写"),
    readonlyField("changedFields", "差异字段", revisionDiffKeys(data).join("、") || "未识别"),
    readonlyField("after", "修订后值", compactSummary(data)),
    readonlyField("updatedAt", "更新时间", updatedAt),
  ];
}

export function revisionDiffSections(request: WorkTaskApprovalRequest): BodySurfaceSectionSpec[] {
  if (request.latestPayload.entityType !== "revision") return [];
  const data = request.latestPayload.data;
  const before = objectValue(data.beforeSnapshot) || objectValue(data.approvalSnapshot);
  return [
    createRecordSection("revision-diff", {
      records: [{
        key: "revision-diff",
        expanded: true,
        onToggle: () => undefined,
        header: { kind: "stack", items: [revisionTargetLabel(data.changeTarget), `${revisionDiffKeys(data).length} 个差异字段`], gap: "xs" },
        detail: { kind: "text", value: `审批时值\n${compactSummary(before)}\n\n修订后值\n${compactSummary(data)}\n\n差异\n${revisionDiffKeys(data).join("\n") || "未识别"}` },
      }],
      empty: "暂无修订差异",
    }),
  ];
}

function readonlyField(key: string, label: string, value: string): FormSurfaceReadOnlyFieldSpec {
  return { kind: "readonly", key, label, value };
}

function revisionTargetLabel(value: unknown) {
  return value === "work_report" ? "目标/考核表" : "工作计划";
}

function revisionDiffKeys(data: Record<string, unknown>) {
  const before = objectValue(data.beforeSnapshot) || objectValue(data.approvalSnapshot);
  return Object.keys(data)
    .filter((key) => !["beforeSnapshot", "approvalSnapshot", "changeTarget"].includes(key))
    .filter((key) => !before || JSON.stringify(before[key] ?? null) !== JSON.stringify(data[key] ?? null));
}

function compactSummary(value: unknown) {
  const object = objectValue(value);
  if (!object) return "无";
  const pairs = Object.entries(object)
    .filter(([key]) => !["beforeSnapshot", "approvalSnapshot"].includes(key))
    .slice(0, 12)
    .map(([key, item]) => `${key}: ${summaryValue(item)}`);
  return pairs.length ? pairs.join("\n") : "无";
}

function summaryValue(value: unknown): string {
  if (Array.isArray(value)) return `${value.length} 项`;
  if (value && typeof value === "object") return JSON.stringify(value).slice(0, 120);
  return String(value ?? "-");
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
