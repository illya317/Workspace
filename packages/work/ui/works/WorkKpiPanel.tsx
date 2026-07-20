"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createFieldsSection,
  createMessageSection,
  createPageBody,
  createPageDataSection,
  createSectionSection,
  type BodySurfaceProps,
  type CreateSurfaceToolbarProps,
  type FormSurfaceActionSpec,
  type SurfaceToolbarItems,
} from "@workspace/core/ui";
import { actionRuntimeCommands, workflowActionSurfaceActions } from "@workspace/platform/ui";
import {
  finalizeWorkKpiResults,
  finalizeWorkKpiScorecard,
  getWorkKpiResults,
  getWorkKpiScorecard,
  listWorkKpiDefinitions,
  saveWorkKpiDefinition,
  updateWorkKpiMeasurements,
} from "./WorkKpiApi";
import {
  assignmentEntry,
  definitionColumns,
  definitionDraft,
  definitionDraftComplete,
  definitionDraftDirty,
  definitionFormContent,
  emptyDefinitionDraft,
  emptyEntry,
  formatNumber,
  resultRows,
  scorecardRows,
} from "./WorkKpiSurfaceBuilders";
import type { WorkPlan, WorkTaskSpace } from "./types";
import type {
  WorkKpiDefinition,
  WorkKpiDefinitionDraft,
  WorkKpiResultsResponse,
  WorkKpiScorecardEntry,
} from "./WorkKpiTypes";

type Toast = (toast: { message: string; type: "success" | "error" }) => void;

export interface WorkKpiScorecardController {
  body: BodySurfaceProps;
  toolbarItems: SurfaceToolbarItems;
}

export function useWorkKpiScorecardController({
  enabled,
  space,
  plan,
  onToast,
  onRefreshPlans,
}: {
  enabled: boolean;
  space: WorkTaskSpace | null;
  plan: WorkPlan | null;
  onToast: Toast;
  onRefreshPlans: () => Promise<unknown>;
}): WorkKpiScorecardController {
  const [definitions, setDefinitions] = useState<WorkKpiDefinition[]>([]);
  const [entries, setEntries] = useState<WorkKpiScorecardEntry[]>([]);
  const [results, setResults] = useState<WorkKpiResultsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!enabled || !space || !plan || plan.kind !== "okr") return;
    setLoading(true);
    try {
      const [definitionData, scorecard] = await Promise.all([
        listWorkKpiDefinitions(space),
        getWorkKpiScorecard(plan.id),
      ]);
      setDefinitions(definitionData.definitions.filter((definition) => definition.status === "active"));
      setEntries(scorecard.assignments.map(assignmentEntry));
      if (scorecard.assignments.length > 0
        && scorecard.assignments.every((assignment) => assignment.currentValue !== null)) {
        setResults(await getWorkKpiResults(plan.id));
      } else {
        setResults(null);
      }
    } catch (error) {
      setEntries([]);
      setResults(null);
      onToast({ message: error instanceof Error ? error.message : "加载 KPI 计分卡失败", type: "error" });
    } finally {
      setLoading(false);
    }
  }, [enabled, onToast, plan, space]);

  useEffect(() => { void load(); }, [load]);

  // Facet editability already distinguishes direct-write permission from workflow
  // submit permission. Requiring canUpdate again would hide workflow forms from a
  // submit-only actor even though the selected ActionRuntime allows submission.
  const targetEditable = Boolean(plan?.governance?.facets.target.editable);
  const measurementEditable = Boolean(plan?.governance?.facets.result.editable);
  const targetActionKind = plan?.governance?.facets.target.action?.kind;
  const resultActionKind = plan?.governance?.facets.result.action?.kind;
  const objectiveRuntime = targetActionKind === "objective_revise"
    ? plan?.actionRuntimes?.objectiveRevise ?? space?.actionRuntimes.objectiveRevise
    : plan?.actionRuntimes?.objectiveSubmit ?? space?.actionRuntimes.objectiveSubmit;
  const reportRuntime = resultActionKind === "report_correct"
    ? plan?.actionRuntimes?.reportCorrect ?? space?.actionRuntimes.reportCorrect
    : plan?.actionRuntimes?.reportSubmit ?? space?.actionRuntimes.reportSubmit;
  const totalWeight = entries.reduce((sum, entry) => sum + (entry.weight ?? 0), 0);
  const allMeasurementsReady = entries.length > 0 && entries.every((entry) => entry.id && entry.version && entry.currentValue !== null);
  const finalizationDisabled = loading || saving || entries.length === 0 || entries.some((entry) => !entry.definitionId || !entry.ownerEmployeeId || !entry.weight) || Math.abs(totalWeight - 100) > 0.000001;
  const measurementDisabled = loading || saving || !allMeasurementsReady;

  const addEntry = useCallback(() => {
    setEntries((current) => [...current, emptyEntry(plan?.ownerEmployeeId ?? null, plan?.ownerEmployeeName ?? "")]);
  }, [plan?.ownerEmployeeId, plan?.ownerEmployeeName]);

  const updateEntry = useCallback((localKey: string, patch: Partial<WorkKpiScorecardEntry>) => {
    setEntries((current) => current.map((entry) => entry.localKey === localKey ? { ...entry, ...patch } : entry));
  }, []);

  const removeEntry = useCallback((localKey: string) => {
    setEntries((current) => current.filter((entry) => entry.localKey !== localKey));
  }, []);

  const finalizeTargets = useCallback(async () => {
    if (!space || !plan || saving) return;
    setSaving(true);
    try {
      const workflow = objectiveRuntime?.executionMode === "workflow";
      await finalizeWorkKpiScorecard(space, plan, entries);
      await onRefreshPlans();
      await load();
      onToast({ message: workflow ? "KPI 目标已提交" : "KPI 目标已保存并生效", type: "success" });
    } catch (error) {
      onToast({ message: error instanceof Error ? error.message : "保存 KPI 计分卡失败", type: "error" });
    } finally {
      setSaving(false);
    }
  }, [entries, load, objectiveRuntime, onRefreshPlans, onToast, plan, saving, space]);

  const saveMeasurements = useCallback(async () => {
    if (!plan || saving) return;
    setSaving(true);
    try {
      const scorecard = await updateWorkKpiMeasurements(plan.id, entries);
      setEntries(scorecard.assignments.map(assignmentEntry));
      setResults(scorecard.assignments.every((assignment) => assignment.currentValue !== null)
        ? await getWorkKpiResults(plan.id)
        : null);
      onToast({ message: "KPI 实际值已保存", type: "success" });
    } catch (error) {
      onToast({ message: error instanceof Error ? error.message : "保存 KPI 实际值失败", type: "error" });
    } finally {
      setSaving(false);
    }
  }, [entries, onToast, plan, saving]);

  const finalizeResults = useCallback(async () => {
    if (!space || !plan || !results || saving) return;
    setSaving(true);
    try {
      const workflow = reportRuntime?.executionMode === "workflow";
      await finalizeWorkKpiResults(space, plan, results);
      await onRefreshPlans();
      await load();
      onToast({ message: workflow ? "KPI 结果已提交" : "KPI 结果快照已确认", type: "success" });
    } catch (error) {
      onToast({ message: error instanceof Error ? error.message : "确认 KPI 结果失败", type: "error" });
    } finally {
      setSaving(false);
    }
  }, [load, onRefreshPlans, onToast, plan, reportRuntime, results, saving, space]);

  const scorecardActions = targetEditable ? workflowActionSurfaceActions(actionRuntimeCommands(objectiveRuntime, {
    "record.save": { label: saving ? "保存中..." : "保存目标", disabled: finalizationDisabled, onClick: () => void finalizeTargets() },
    "workflow.request.submit": { label: saving ? "提交中..." : "提交目标", disabled: finalizationDisabled, onClick: () => void finalizeTargets() },
  })) : [];
  const resultActions = measurementEditable && results ? workflowActionSurfaceActions(actionRuntimeCommands(reportRuntime, {
    "record.save": { label: saving ? "确认中..." : "确认结果", disabled: saving || !results.workReport, onClick: () => void finalizeResults() },
    "workflow.request.submit": { label: saving ? "提交中..." : "提交结果", disabled: saving || !results.workReport, onClick: () => void finalizeResults() },
  })) : [];
  const rows = scorecardRows({ entries, definitions, targetEditable, measurementEditable, target: space, onUpdate: updateEntry, onRemove: removeEntry });
  const availableDefinitions = definitions.filter((definition) => !entries.some((entry) => entry.definitionId === definition.id));
  const sections = !space
    ? [createMessageSection("kpi-empty-space", { content: "请选择工作空间", tone: "muted" })]
    : !plan
      ? [createMessageSection("kpi-empty-plan", { content: "请选择一个 OKR 周期计划", tone: "muted" })]
      : plan.kind !== "okr"
        ? [createMessageSection("kpi-routine-plan", { content: "日常工作计划不使用 KPI 计分卡", tone: "muted" })]
        : loading && entries.length === 0
          ? [createMessageSection("kpi-loading", { content: "加载 KPI 计分卡中...", tone: "muted" })]
          : [
              createPageDataSection("kpi-summary", {
                kind: "summary",
                metrics: [
                  { key: "count", label: "指标数", value: { kind: "number", value: entries.length } },
                  { key: "weight", label: "权重合计", value: { kind: "text", value: `${formatNumber(totalWeight)}%`, tone: Math.abs(totalWeight - 100) < 0.000001 ? "success" : "warning" } },
                  { key: "governance", label: "治理状态", value: { kind: "text", value: plan.governance?.badges.map((badge) => badge.label).join(" · ") || "只读" } },
                  { key: "score", label: "加权得分", value: results ? { kind: "number", value: results.weightedScore, maximumFractionDigits: 2 } : { kind: "empty", content: "待计算" } },
                ],
              }),
              { ...createSectionSection("kpi-scorecard-section", {
                title: "周期指标",
                sections: [
                  createMessageSection("kpi-scorecard-guidance", { content: targetEditable && measurementEditable ? "目标口径与实际结果可同时维护；流程关闭时保存即生效。" : targetEditable ? "维护指标、责任人、权重和目标；权重合计 100% 后保存。" : measurementEditable ? "维护实际结果；确认后会保留不可变快照。" : "当前内容为只读。", tone: "muted" }),
                  createPageDataSection("kpi-scorecard", { kind: "structured", rows, frame: "bordered", presentation: { density: "compact", header: "tinted", controlHeight: "fillRow" }, structuredScroll: true, scroll: { x: true } }),
                  ...(targetEditable || measurementEditable ? [createFieldsSection("kpi-scorecard-actions", [], { actions: [
                    ...(measurementEditable ? [{ key: "save-measurements", action: "save" as const, label: saving ? "保存中..." : "保存实际值", disabled: measurementDisabled, onClick: () => void saveMeasurements() }] : []),
                    ...scorecardActions,
                  ] })] : []),
                ],
              }), header: { title: "周期指标", actions: targetEditable ? [{
                key: "add-kpi-scorecard-entry",
                label: "添加指标",
                icon: "add" as const,
                presentation: "icon" as const,
                variant: "primary" as const,
                disabled: saving || availableDefinitions.length === 0 || entries.some((entry) => !entry.definitionId),
                onClick: addEntry,
              }] : undefined }, visibility: "desktop" as const },
              ...(results ? [{ ...createSectionSection("kpi-results-section", {
                title: "结果预览",
                sections: [
                  createMessageSection("kpi-result-guidance", { content: results.workReport ? `关联考核表 #${results.workReport.id}` : "尚无包含该计划的考核结果表；请先生成考核表再确认快照。", tone: "muted" }),
                  createPageDataSection("kpi-results", { kind: "structured", rows: resultRows(results, entries), frame: "bordered", presentation: { density: "compact", header: "tinted" }, structuredScroll: true, scroll: { x: true } }),
                  ...(resultActions.length ? [createFieldsSection("kpi-result-actions", [], { actions: resultActions })] : []),
                ],
              }), visibility: "desktop" as const }] : []),
            ];

  return {
    body: createPageBody(sections),
    toolbarItems: [],
  };
}

export interface WorkKpiDefinitionController {
  body: BodySurfaceProps;
  toolbarItems: SurfaceToolbarItems;
}

export function useWorkKpiDefinitionController({ enabled, space, onToast }: {
  enabled: boolean;
  space: WorkTaskSpace | null;
  onToast: Toast;
}): WorkKpiDefinitionController {
  const [definitions, setDefinitions] = useState<WorkKpiDefinition[]>([]);
  const [draft, setDraft] = useState<WorkKpiDefinitionDraft | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const ownerDepartmentId = space?.targetType === "department" ? space.targetId : null;
  const canMaintain = Boolean(ownerDepartmentId && space?.actionPermissions.canUpdate);

  const load = useCallback(async () => {
    if (!enabled || !space) return;
    setLoading(true);
    try {
      const data = await listWorkKpiDefinitions(space, ownerDepartmentId);
      setDefinitions(data.definitions);
    } catch (error) {
      onToast({ message: error instanceof Error ? error.message : "加载 KPI 指标库失败", type: "error" });
    } finally {
      setLoading(false);
    }
  }, [enabled, onToast, ownerDepartmentId, space]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setDraft(null); }, [space?.targetId, space?.targetType]);

  const beginCreate = useCallback(() => {
    if (!ownerDepartmentId || !space) return;
    setDraft(emptyDefinitionDraft(ownerDepartmentId, space.name));
  }, [ownerDepartmentId, space]);

  const setCreateOpen = useCallback((open: boolean) => {
    if (open) {
      beginCreate();
      return;
    }
    setDraft((current) => current?.id ? current : null);
  }, [beginCreate]);

  const beginRevise = useCallback((definition: WorkKpiDefinition) => {
    setDraft(definitionDraft(definition));
  }, []);

  const save = useCallback(async () => {
    if (!draft || saving) return;
    setSaving(true);
    try {
      await saveWorkKpiDefinition(draft);
      setDraft(null);
      await load();
    } finally {
      setSaving(false);
    }
  }, [draft, load, saving]);

  const saveRevision = useCallback(async () => {
    try {
      await save();
      onToast({ message: "KPI 指标新版本已保存", type: "success" });
    } catch (error) {
      onToast({ message: error instanceof Error ? error.message : "保存 KPI 指标失败", type: "error" });
    }
  }, [onToast, save]);

  const activeDefinition = draft?.id ? definitions.find((definition) => definition.id === draft.id) ?? null : null;
  const revisionDirty = Boolean(activeDefinition && draft && definitionDraftDirty(activeDefinition, draft));
  const formActions: FormSurfaceActionSpec[] = draft?.id ? [
    { key: "save-definition", action: "save", label: saving ? "保存中..." : "保存新版本", disabled: saving || !definitionDraftComplete(draft) || !revisionDirty, onClick: () => void saveRevision() },
    { key: "cancel-definition", action: "cancel", label: "取消", disabled: saving, onClick: () => setDraft(null) },
  ] : [];
  const createOpen = Boolean(draft && !draft.id);
  const definitionCreate: CreateSurfaceToolbarProps | undefined = canMaintain ? {
    id: "kpi-definition-create",
    trigger: "toolbar",
    presentation: "block",
    title: "新增指标",
    open: createOpen,
    canCreate: canMaintain,
    disabled: saving || Boolean(draft?.id),
    content: { kind: "form", form: createOpen && draft ? definitionFormContent(draft, setDraft, saving) : { items: [] } },
    submission: { action: "save", disabled: saving || !draft || !definitionDraftComplete(draft), execute: save },
    feedback: { saved: "KPI 指标已新增" },
    onOpenChange: setCreateOpen,
  } : undefined;
  const sections = !space
    ? [createMessageSection("kpi-definition-empty-space", { content: "请选择工作空间", tone: "muted" })]
    : [
        ...(!canMaintain ? [createMessageSection("kpi-definition-readonly", { content: "指标按归口部门维护；当前空间可查看可用指标，切换到有维护权限的部门空间后可新增或修订。", tone: "muted" })] : []),
        createPageDataSection("kpi-definitions", {
          kind: "table",
          rows: definitions,
          columns: definitionColumns(),
          rowKey: (definition) => definition.id,
          loading,
          emptyText: "暂无 KPI 指标定义",
          onRowClick: canMaintain ? (definition) => {
            if (draft?.id === definition.id) setDraft(null);
            else beginRevise(definition);
          } : undefined,
          expandedRowKey: draft?.id ?? null,
          expandedRow: canMaintain ? (definition) => draft?.id === definition.id ? {
            kind: "form",
            form: {
              kind: "fields",
              content: definitionFormContent(draft, setDraft, saving),
              actions: formActions,
            },
          } : null : undefined,
          rowState: (definition) => draft?.id === definition.id ? "selected" : "normal",
          mobile: { presentation: "list" },
          frame: "bordered",
          presentation: { density: "compact", header: "tinted", rowHover: canMaintain ? "interactive" : "none" },
          scroll: { x: true, y: "hidden" },
        }),
      ];
  return {
    body: createPageBody([
      ...(definitionCreate ? [{ key: "kpi-definition-create", chrome: "plain" as const, body: { kind: "create" as const, create: definitionCreate } }] : []),
      createSectionSection("kpi-definition-section", {
        title: "指标库",
        sections: [
          { ...createMessageSection("kpi-definition-guidance", { content: "指标定义按版本维护；已生效版本不会被周期计分卡的后续修订覆盖。", tone: "muted" }), chrome: "plain" },
          ...sections.map((section) => ({ ...section, chrome: "plain" as const })),
        ],
      }),
    ]),
    toolbarItems: [],
  };
}
