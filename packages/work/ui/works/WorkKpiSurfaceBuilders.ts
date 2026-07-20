import {
  type CreateSurfaceFormSpec,
  type DataSurfaceColumnSpec,
  type DataSurfaceCellSpec,
  type DataSurfaceStructuredCellSpec,
  type FormSurfaceFieldSpec,
} from "@workspace/core/ui";
import { WORK_REFERENCE_OPTIONS_ENDPOINT } from "./api";
import type { WorkTarget } from "./types";
import type {
  WorkKpiAssignment,
  WorkKpiDefinition,
  WorkKpiDefinitionDraft,
  WorkKpiDirection,
  WorkKpiResultsResponse,
  WorkKpiScorecardEntry,
} from "./WorkKpiTypes";

export function scorecardRows(input: {
  entries: WorkKpiScorecardEntry[];
  definitions: WorkKpiDefinition[];
  targetEditable: boolean;
  measurementEditable: boolean;
  target: WorkTarget | null;
  onUpdate: (key: string, patch: Partial<WorkKpiScorecardEntry>) => void;
  onRemove: (key: string) => void;
}): DataSurfaceStructuredCellSpec[][] {
  const headers = ["指标", "责任人", "权重", "起点", "目标/区间", "实际值", "结果确认", ""];
  if (input.entries.length === 0) return [[{ content: { kind: "text", value: "暂无周期指标" }, colSpan: headers.length, tone: "muted" }]];
  return [
    headerRow(headers),
    ...input.entries.map((entry): DataSurfaceStructuredCellSpec[] => {
      const definition = input.definitions.find((item) => item.id === entry.definitionId);
      const definitionOptions = input.definitions
        .filter((item) => item.id === entry.definitionId || !input.entries.some((candidate) => candidate.definitionId === item.id))
        .map((item) => ({ value: String(item.id), label: `${item.code} · ${item.name} · v${item.version}` }));
      return [
        input.targetEditable ? inputCell({ valueType: "string", control: "choice", options: { source: "static", items: definitionOptions } }, entry.definitionId ? String(entry.definitionId) : "", (value) => input.onUpdate(entry.localKey, { definitionId: positiveNumber(value), scoringRule: null }), "选择指标") : textCell(definition ? `${definition.code} · ${definition.name}` : `指标 #${entry.definitionId ?? "-"}`, "strong"),
        input.targetEditable && input.target ? referenceCell(entry, input.target, input.onUpdate) : textCell(entry.ownerEmployeeName || `员工 #${entry.ownerEmployeeId ?? "-"}`),
        input.targetEditable ? numberInputCell(entry.weight, (value) => input.onUpdate(entry.localKey, { weight: optionalNumber(value) }), "%") : numberCell(entry.weight, "%"),
        input.targetEditable ? numberInputCell(entry.baselineValue, (value) => input.onUpdate(entry.localKey, { baselineValue: optionalNumber(value) })) : numberCell(entry.baselineValue),
        input.targetEditable ? targetValueCell(entry, definition?.direction ?? "higher_is_better", input.onUpdate) : textCell(targetValueLabel(entry, definition?.direction)),
        input.measurementEditable ? numberInputCell(entry.currentValue, (value) => input.onUpdate(entry.localKey, { currentValue: optionalNumber(value) }), definition?.unit) : numberCell(entry.currentValue, definition?.unit),
        entry.latestResult ? numberCell(entry.latestResult.confirmedScore, "分") : textCell("未确认", undefined, "muted"),
        input.targetEditable ? { content: { kind: "action", action: { key: `remove-${entry.localKey}`, label: "移除", presentation: "glyph", icon: "delete", tone: "red", onClick: () => input.onRemove(entry.localKey) } } } : textCell(""),
      ];
    }),
  ];
}

export function resultRows(result: WorkKpiResultsResponse, entries: WorkKpiScorecardEntry[]): DataSurfaceStructuredCellSpec[][] {
  return [
    headerRow(["指标", "权重", "实际值", "计算得分", "证据"]),
    ...result.results.map((row) => {
      const entry = entries.find((item) => item.id === row.assignmentId);
      const definition = objectRecord(row.definitionSnapshot);
      const evidence = objectRecord(row.evidence);
      const tasks = Array.isArray(evidence.tasks) ? evidence.tasks.length : 0;
      return [
        textCell(String(definition.name || `指标 #${row.assignmentId}`), "strong"),
        numberCell(row.weight, "%"),
        numberCell(row.actualValue, definition.unit ? String(definition.unit) : undefined),
        numberCell(entry?.latestResult?.confirmedScore ?? row.calculatedScore, "分"),
        textCell(`${tasks} 项任务证据`, undefined, tasks ? undefined : "muted"),
      ];
    }),
  ];
}

export function definitionColumns(): DataSurfaceColumnSpec<WorkKpiDefinition>[] {
  return [
    { key: "code", label: "编码", required: true, cell: (definition) => ({ kind: "text", value: definition.code, emphasis: "strong" }) },
    { key: "name", label: "名称", required: true, cell: (definition) => ({ kind: "text", value: definition.name }) },
    { key: "version", label: "版本", required: true, cell: (definition) => ({ kind: "text", value: `v${definition.version}` }) },
    { key: "status", label: "状态", required: true, cell: (definition) => ({ kind: "badge", label: definitionStatusLabel(definition.status), tone: definition.status === "active" ? "green" : definition.status === "retired" ? "gray" : "blue" }) },
    { key: "direction", label: "方向", required: true, cell: (definition) => ({ kind: "text", value: directionLabel(definition.direction) }) },
    { key: "unit", label: "单位", required: true, cell: (definition) => ({ kind: "text", value: definition.unit }) },
    { key: "ownerDepartment", label: "归口部门", required: true, cell: (definition) => ({ kind: "text", value: definition.ownerDepartmentName }) },
  ];
}

function definitionFields(draft: WorkKpiDefinitionDraft, setDraft: (draft: WorkKpiDefinitionDraft) => void, disabled: boolean): FormSurfaceFieldSpec[] {
  const patch = (next: Partial<WorkKpiDefinitionDraft>) => setDraft({ ...draft, ...next });
  return [
    { key: "code", label: "指标编码", required: true, spec: { valueType: "string", control: "text", state: disabled || Boolean(draft.id) ? "disabled" : "normal" }, value: draft.code, placeholder: "例如 SALES.REVENUE", onChange: (value) => patch({ code: String(value ?? "").toUpperCase() }) },
    { key: "name", label: "指标名称", required: true, spec: { valueType: "string", control: "text", state: disabled ? "disabled" : "normal" }, value: draft.name, placeholder: "清晰描述被考核的结果", onChange: (value) => patch({ name: String(value ?? "") }) },
    { key: "status", label: "状态", required: true, spec: { valueType: "string", control: "choice", options: { source: "static", items: [{ value: "draft", label: "草稿" }, { value: "active", label: "生效" }, { value: "retired", label: "停用" }] }, state: disabled ? "disabled" : "normal" }, value: draft.status, onChange: (value) => patch({ status: value === "active" || value === "retired" ? value : "draft" }) },
    { key: "displayType", label: "展示类型", required: true, spec: { valueType: "string", control: "choice", options: { source: "static", items: [{ value: "number", label: "数值" }, { value: "percent", label: "百分比" }, { value: "currency", label: "金额" }, { value: "count", label: "计数" }] }, state: disabled ? "disabled" : "normal" }, value: draft.displayType, onChange: (value) => patch({ displayType: value === "percent" || value === "currency" || value === "count" ? value : "number", unit: value === "percent" && !draft.unit ? "%" : draft.unit }) },
    { key: "unit", label: "单位", required: true, spec: { valueType: "string", control: "text", state: disabled ? "disabled" : "normal" }, value: draft.unit, placeholder: "%、万元、项", onChange: (value) => patch({ unit: String(value ?? "") }) },
    { key: "direction", label: "考核方向", required: true, spec: { valueType: "string", control: "choice", options: { source: "static", items: [{ value: "higher_is_better", label: "越高越好" }, { value: "lower_is_better", label: "越低越好" }, { value: "target_range", label: "目标区间" }] }, state: disabled ? "disabled" : "normal" }, value: draft.direction, onChange: (value) => patch({ direction: normalizeDirection(value) }) },
    { key: "ownerDepartment", label: "归口部门", required: true, spec: { valueType: "string", control: "text", state: "disabled" }, value: draft.ownerDepartmentName },
    { key: "targetScore", label: "达标分", required: true, spec: { valueType: "number", control: "number", state: disabled ? "disabled" : "normal" }, value: draft.scoringRule.targetScore, onChange: (value) => patch({ scoringRule: { ...draft.scoringRule, targetScore: optionalNumber(value) ?? 100 } }) },
    { key: "floorScore", label: "最低分", required: true, spec: { valueType: "number", control: "number", state: disabled ? "disabled" : "normal" }, value: draft.scoringRule.floorScore, onChange: (value) => patch({ scoringRule: { ...draft.scoringRule, floorScore: optionalNumber(value) ?? 0 } }) },
    { key: "capScore", label: "封顶分", required: true, spec: { valueType: "number", control: "number", state: disabled ? "disabled" : "normal" }, value: draft.scoringRule.capScore, onChange: (value) => patch({ scoringRule: { ...draft.scoringRule, capScore: optionalNumber(value) ?? 120 } }) },
    { key: "description", label: "口径说明", span: "wide", spec: { valueType: "string", control: "text", multiline: true, state: disabled ? "disabled" : "normal" }, value: draft.description, placeholder: "说明统计范围、数据口径与边界", onChange: (value) => patch({ description: String(value ?? "") }) },
  ];
}

export function definitionFormContent(
  draft: WorkKpiDefinitionDraft,
  setDraft: (draft: WorkKpiDefinitionDraft) => void,
  disabled: boolean,
): CreateSurfaceFormSpec {
  return { items: definitionFields(draft, setDraft, disabled), layout: { columns: 2 } };
}

export function definitionDraft(definition: WorkKpiDefinition): WorkKpiDefinitionDraft {
  return {
    id: definition.id,
    code: definition.code,
    status: definition.status,
    name: definition.name,
    description: definition.description,
    displayType: definition.displayType,
    unit: definition.unit,
    direction: definition.direction,
    ownerDepartmentId: definition.ownerDepartmentId,
    ownerDepartmentName: definition.ownerDepartmentName,
    scoringRule: definition.scoringRule,
  };
}

export function definitionDraftDirty(definition: WorkKpiDefinition, draft: WorkKpiDefinitionDraft) {
  const initial = definitionDraft(definition);
  return initial.code !== draft.code
    || initial.status !== draft.status
    || initial.name !== draft.name
    || initial.description !== draft.description
    || initial.displayType !== draft.displayType
    || initial.unit !== draft.unit
    || initial.direction !== draft.direction
    || initial.ownerDepartmentId !== draft.ownerDepartmentId
    || initial.scoringRule.targetScore !== draft.scoringRule.targetScore
    || initial.scoringRule.floorScore !== draft.scoringRule.floorScore
    || initial.scoringRule.capScore !== draft.scoringRule.capScore;
}

export function assignmentEntry(assignment: WorkKpiAssignment): WorkKpiScorecardEntry {
  return {
    localKey: `assignment-${assignment.id}`,
    id: assignment.id,
    version: assignment.version,
    definitionId: assignment.definitionId,
    ownerEmployeeId: assignment.ownerEmployeeId,
    ownerEmployeeName: assignment.ownerEmployeeName ?? "",
    objectiveWorkItemId: assignment.objectiveWorkItemId,
    sourceAssignmentId: assignment.sourceAssignmentId,
    relationKind: assignment.relationKind,
    weight: assignment.weight,
    baselineValue: assignment.baselineValue,
    targetValue: assignment.targetValue,
    targetLowerBound: assignment.targetLowerBound,
    targetUpperBound: assignment.targetUpperBound,
    currentValue: assignment.currentValue,
    scoringRule: assignment.scoringRule,
    latestResult: assignment.latestResult,
  };
}

export function emptyEntry(ownerEmployeeId: number | null, ownerEmployeeName: string): WorkKpiScorecardEntry {
  return {
    localKey: `new-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    id: null,
    version: null,
    definitionId: null,
    ownerEmployeeId,
    ownerEmployeeName,
    objectiveWorkItemId: null,
    sourceAssignmentId: null,
    relationKind: "direct",
    weight: null,
    baselineValue: null,
    targetValue: null,
    targetLowerBound: null,
    targetUpperBound: null,
    currentValue: null,
    scoringRule: null,
    latestResult: null,
  };
}

export function emptyDefinitionDraft(ownerDepartmentId: number, ownerDepartmentName: string): WorkKpiDefinitionDraft {
  return { id: null, code: "", status: "draft", name: "", description: "", displayType: "number", unit: "", direction: "higher_is_better", ownerDepartmentId, ownerDepartmentName, scoringRule: { kind: "linear", targetScore: 100, floorScore: 0, capScore: 120 } };
}

export function definitionDraftComplete(draft: WorkKpiDefinitionDraft) {
  return Boolean(draft.code.trim() && draft.name.trim() && draft.unit.trim() && draft.ownerDepartmentId && draft.scoringRule.capScore >= draft.scoringRule.targetScore && draft.scoringRule.targetScore >= draft.scoringRule.floorScore);
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(value);
}

function referenceCell(entry: WorkKpiScorecardEntry, target: WorkTarget, onUpdate: (key: string, patch: Partial<WorkKpiScorecardEntry>) => void): DataSurfaceStructuredCellSpec {
  return {
    content: {
      kind: "input",
      spec: { valueType: "reference", control: "reference", options: { source: "remote", fkKey: "work.tasks.owner.employee", endpoint: WORK_REFERENCE_OPTIONS_ENDPOINT, returnField: "id", queryParams: { targetType: target.targetType, targetId: target.targetId } } },
      value: entry.ownerEmployeeId ? String(entry.ownerEmployeeId) : "",
      displayValue: entry.ownerEmployeeName,
      placeholder: "选择责任人",
      onChange: (value, option) => onUpdate(entry.localKey, { ownerEmployeeId: optionId(option) ?? positiveNumber(value), ownerEmployeeName: optionName(option) }),
    },
  };
}

function targetValueCell(entry: WorkKpiScorecardEntry, direction: WorkKpiDirection, onUpdate: (key: string, patch: Partial<WorkKpiScorecardEntry>) => void): DataSurfaceStructuredCellSpec {
  if (direction === "target_range") {
    return { content: { kind: "group", items: [
      numberInput(entry.targetLowerBound, (value) => onUpdate(entry.localKey, { targetLowerBound: optionalNumber(value) }), "下限"),
      numberInput(entry.targetUpperBound, (value) => onUpdate(entry.localKey, { targetUpperBound: optionalNumber(value) }), "上限"),
    ] } };
  }
  return numberInputCell(entry.targetValue, (value) => onUpdate(entry.localKey, { targetValue: optionalNumber(value) }), "目标");
}

function inputCell(spec: Extract<DataSurfaceCellSpec, { kind: "input" }>["spec"], value: unknown, onChange: (value: unknown, option?: unknown) => void, placeholder?: string): DataSurfaceStructuredCellSpec {
  return { content: { kind: "input", spec, value, onChange, placeholder } };
}

function numberInputCell(value: number | null, onChange: (value: unknown) => void, placeholder?: string): DataSurfaceStructuredCellSpec {
  return { content: numberInput(value, onChange, placeholder) };
}

function numberInput(value: number | null, onChange: (value: unknown) => void, placeholder?: string): Extract<DataSurfaceCellSpec, { kind: "input" }> {
  return { kind: "input", spec: { valueType: "number", control: "number" }, value: value ?? "", onChange, placeholder, inputMode: "decimal" };
}

function textCell(value: string, emphasis?: "strong", tone?: "muted"): DataSurfaceStructuredCellSpec {
  return { content: { kind: "text", value, ...(emphasis ? { emphasis } : {}), ...(tone ? { tone } : {}) } };
}

function numberCell(value: number | null | undefined, suffix?: string): DataSurfaceStructuredCellSpec {
  return value === null || value === undefined ? textCell("-", undefined, "muted") : textCell(`${formatNumber(value)}${suffix ?? ""}`);
}

function headerRow(labels: string[]): DataSurfaceStructuredCellSpec[] {
  return labels.map((label) => ({ content: { kind: "text", value: label }, header: true, emphasis: "strong" }));
}

function targetValueLabel(entry: WorkKpiScorecardEntry, direction?: WorkKpiDirection) {
  return direction === "target_range" ? `${formatOptional(entry.targetLowerBound)} – ${formatOptional(entry.targetUpperBound)}` : formatOptional(entry.targetValue);
}

function directionLabel(direction: WorkKpiDirection) {
  return direction === "lower_is_better" ? "越低越好" : direction === "target_range" ? "目标区间" : "越高越好";
}

function definitionStatusLabel(status: WorkKpiDefinition["status"]) {
  return status === "active" ? "生效" : status === "retired" ? "停用" : "草稿";
}

function normalizeDirection(value: unknown): WorkKpiDirection {
  return value === "lower_is_better" || value === "target_range" ? value : "higher_is_better";
}

function optionalNumber(value: unknown) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function positiveNumber(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function optionId(option: unknown) {
  if (!option || typeof option !== "object") return null;
  const row = option as Record<string, unknown>;
  return positiveNumber(row.id ?? row.value);
}

function optionName(option: unknown) {
  if (!option || typeof option !== "object") return "";
  const row = option as Record<string, unknown>;
  return String(row.name ?? row.label ?? "");
}

function objectRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function formatOptional(value: number | null) {
  return value === null ? "-" : formatNumber(value);
}
