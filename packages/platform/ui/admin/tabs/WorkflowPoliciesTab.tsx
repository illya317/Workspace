"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createFieldsSection,
  createMessageSection,
  type BodySurfaceProps,
  type BodySurfaceSectionSpec,
  type FormSurfaceItemSpec,
  type SurfaceToolbarItem,
} from "@workspace/core/ui";
import { requestJson } from "../../api-client";
import { createAdminSelectorSplitBody } from "../components/AdminSelectorSplit";
import { contractHandlerSourceOptions, contractPersistenceSummary } from "./WorkflowPoliciesContractModel";
import { workflowNodeStateActions } from "./WorkflowPoliciesNodeState";
import {
  BOOLEAN_POLICY_ITEMS,
  booleanChoiceField,
  InfoLabel,
} from "./WorkflowPoliciesTabFields";
import {
  initialWorkflowGraphElements,
  savedWorkflowGraphElementsForAction,
  WORKFLOW_START_KEY,
  workflowContainsKey,
  workflowNodesFromGraphElements,
  workflowNodePrimaryHandlerSource,
  type WorkflowPolicyGraphElementDraft,
} from "./WorkflowPoliciesGraphModel";
import { WorkflowPoliciesNodesSection } from "./WorkflowPoliciesNodesSection";
import {
  DEFAULT_WORKFLOW_ACTION_FILTER,
  matchesWorkflowActionFilter,
  WORKFLOW_ACTION_FILTER_OPTIONS,
  type WorkflowActionFilter,
} from "./WorkflowActionFilterModel";
import {
  ACCESS_LABEL,
  canConfigureWorkflowAction,
  defaultDraftForAction,
  deriveActionTree,
  draftFromPolicy,
  firstAction,
  FLOW_LABEL,
  initialDraftForAction,
  matchesQuery,
  moduleDisplayName,
  workflowAccessMode,
  workflowModeFromAccess,
  workflowSeparationMode,
  type BusinessActionDto, type WorkflowActionTreeNode, type WorkflowAccessMode, type WorkflowPoliciesResponse, type WorkflowPolicyDraft, type WorkflowPolicyRow,
  type UseWorkflowPoliciesTabInput,
} from "./WorkflowPoliciesTabModel";

const FLOW_ACCESS_HELP = "接入流程：生成流程单并按处理规则完成后写入正式数据。\n关闭后：普通表单回到权限直写；仅流程动作会同时关闭新入口。";
const FLOW_ACCESS_HELP_ARIA = "接入流程：生成流程单并按处理规则完成后写入正式数据。关闭后：普通表单回到权限直写；仅流程动作会同时关闭新入口。";
const SEPARATION_HELP = "是：必须两个人，提交人不能处理自己的请求。\n否：提交人有处理权限时，提交后自动通过。";
const SEPARATION_HELP_ARIA = "是：必须两个人，提交人不能处理自己的请求。 否：提交人有处理权限时，提交后自动通过。";

function actionCanDisableWorkflow(action: BusinessActionDto) {
  const workflow = action.actionContract?.workflow;
  return workflow?.kind !== "not_applicable"
    && workflow?.canDisable === true;
}

function disabledAccessLabel(action: BusinessActionDto) {
  const workflow = action.actionContract?.workflow;
  return workflow?.kind !== "not_applicable" && workflow?.whenDisabled === "unavailable"
    ? "关闭动作"
    : ACCESS_LABEL.permission_only;
}

export function useWorkflowPoliciesTab({ enabled, showToast }: UseWorkflowPoliciesTabInput) {
  const [data, setData] = useState<WorkflowPoliciesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [moduleFilter, setModuleFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState<WorkflowActionFilter>(DEFAULT_WORKFLOW_ACTION_FILTER);
  const [selectedActionKey, setSelectedActionKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<WorkflowPolicyDraft | null>(null);
  const [workflowElements, setWorkflowElements] = useState<WorkflowPolicyGraphElementDraft[]>([]);
  const [selectedWorkflowElementKey, setSelectedWorkflowElementKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await requestJson<WorkflowPoliciesResponse>("/api/settings/admin/workflow-policies", {
        fallbackMessage: "加载流程设置失败",
      });
      setData(next);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "加载流程设置失败", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (!enabled || data) return;
    void load();
  }, [data, enabled, load]);

  const filteredActions = useMemo(() => {
    const actions = data?.businessActions ?? [];
    return actions.filter((action) => {
      if (moduleFilter !== "all" && action.moduleKey !== moduleFilter) return false;
      if (!matchesWorkflowActionFilter(action, actionFilter)) return false;
      return !query.trim() || matchesQuery(action, query);
    });
  }, [actionFilter, data?.businessActions, moduleFilter, query]);

  const selectedAction = useMemo(() => {
    return filteredActions.find((action) => action.key === selectedActionKey) ?? null;
  }, [filteredActions, selectedActionKey]);

  const selectedPolicies = useMemo(() => (
    (data?.policies ?? []).filter((policy) => policy.businessActionKey === selectedAction?.key)
  ), [data?.policies, selectedAction?.key]);

  useEffect(() => {
    if (!selectedAction) {
      setDraft(null);
      setWorkflowElements([]);
      setSelectedWorkflowElementKey(null);
      return;
    }
    const nextDraft = initialDraftForAction(selectedAction, selectedPolicies);
    const selectedPolicy = selectedPolicies.find((policy) => policy.scopeType === "global" && policy.scopeId === "") ?? selectedPolicies[0] ?? null;
    const nextElements = savedWorkflowGraphElementsForAction(selectedAction.key, selectedPolicy, nextDraft);
    setDraft((current) => (
      current?.businessActionKey === selectedAction.key
        ? current
        : nextDraft
    ));
    setWorkflowElements((current) => (
      current[0]?.actionKey === selectedAction.key
        ? current
        : nextElements
    ));
    setSelectedWorkflowElementKey((current) => current === WORKFLOW_START_KEY || workflowContainsKey(nextElements, current) ? current : WORKFLOW_START_KEY);
  }, [selectedAction, selectedPolicies]);

  const exactPolicy = useMemo(() => {
    if (!draft) return null;
    return selectedPolicies.find((policy) => policy.scopeType === "global" && policy.scopeId === "") ?? null;
  }, [draft, selectedPolicies]);

  const moduleOptions = useMemo(() => {
    const modules = new Map<string, string>();
    for (const action of data?.businessActions ?? []) {
      modules.set(action.moduleKey, moduleDisplayName(action));
    }
    return [
      { value: "all", label: "全部模块" },
      ...Array.from(modules.entries())
        .sort(([, leftLabel], [, rightLabel]) => leftLabel.localeCompare(rightLabel, "zh-CN"))
        .map(([moduleKey, label]) => ({ value: moduleKey, label })),
    ];
  }, [data?.businessActions]);

  const actionTree = useMemo(
    () => deriveActionTree(filteredActions, data?.policies ?? [], data?.workflowCategories ?? []),
    [data?.policies, data?.workflowCategories, filteredActions],
  );
  const nodeActions = workflowNodeStateActions({ draft, workflowElements, setWorkflowElements, setSelectedWorkflowElementKey });

  function setDraftPatch(patch: Partial<WorkflowPolicyDraft>) {
    setDraft((current) => current ? { ...current, ...patch } : current);
  }

  function setWorkflowAccess(nextAccess: WorkflowAccessMode) {
    setDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        mode: workflowModeFromAccess(nextAccess),
        separationPolicy: nextAccess === "workflow"
          ? workflowSeparationMode(current.separationPolicy)
          : current.separationPolicy,
      };
    });
  }

  async function savePolicy() {
    if (!draft) return;
    const canConfigureWorkflow = selectedAction ? canConfigureWorkflowAction(selectedAction) : false;
    if (!canConfigureWorkflow) return;
    const accessMode = selectedAction && actionCanDisableWorkflow(selectedAction)
      ? workflowAccessMode(draft.mode)
      : "workflow";
    const workflowNodes = workflowNodesFromGraphElements(workflowElements);
    setSaving(true);
    try {
      const policy = await requestJson<WorkflowPolicyRow>("/api/settings/admin/workflow-policies", {
        method: "PUT",
        body: JSON.stringify({
          businessActionKey: draft.businessActionKey,
          mode: workflowModeFromAccess(accessMode),
          flowType: draft.flowType,
          separationPolicy: accessMode === "workflow"
            ? workflowSeparationMode(draft.separationPolicy)
            : draft.separationPolicy,
          handlerSource: workflowNodePrimaryHandlerSource(workflowNodes[0], draft.handlerSource),
          handlerCanRevise: draft.handlerCanRevise,
          requestCanWithdraw: draft.requestCanWithdraw,
          requestCanResubmit: draft.requestCanResubmit,
          requestCanCancel: draft.requestCanCancel,
          requestCanRevise: draft.requestCanRevise,
          workflowNodes,
        }),
        fallbackMessage: "保存流程策略失败",
      });
      setData((current) => current ? {
        ...current,
        policies: [
          ...current.policies.filter((row) => row.id !== policy.id && !(
            row.businessActionKey === policy.businessActionKey
            && row.scopeType === policy.scopeType
            && row.scopeId === policy.scopeId
          )),
          policy,
        ].sort((a, b) => a.businessActionKey.localeCompare(b.businessActionKey) || a.scopeType.localeCompare(b.scopeType) || a.scopeId.localeCompare(b.scopeId)),
      } : current);
      const nextDraft = draftFromPolicy(policy);
      setDraft(nextDraft);
      setWorkflowElements(savedWorkflowGraphElementsForAction(policy.businessActionKey, policy, nextDraft));
      showToast("流程策略已保存", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "保存流程策略失败", "error");
    } finally {
      setSaving(false);
    }
  }

  async function resetPolicy(policy: WorkflowPolicyRow) {
    setSaving(true);
    try {
      await requestJson<{ deleted: true }>("/api/settings/admin/workflow-policies", {
        method: "DELETE",
        body: JSON.stringify({ id: policy.id, businessActionKey: policy.businessActionKey }),
        fallbackMessage: "恢复默认失败",
      });
      setData((current) => current ? {
        ...current,
        policies: current.policies.filter((row) => row.id !== policy.id),
      } : current);
      if (draft?.businessActionKey === policy.businessActionKey && selectedAction) {
        const nextDraft = defaultDraftForAction(selectedAction);
        setDraft(nextDraft);
        setWorkflowElements(initialWorkflowGraphElements(nextDraft));
      }
      showToast("已恢复默认", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "恢复默认失败", "error");
    } finally {
      setSaving(false);
    }
  }

  const toolbarItems: SurfaceToolbarItem[] = [
    {
      kind: "search",
      key: "workflow-policy-search",
      value: query,
      onChange: setQuery,
      placeholder: "搜索行为/资源/API",
      ariaLabel: "搜索流程行为",
    },
    {
      kind: "option-group",
      key: "workflow-policy-module",
      label: "模块",
      value: moduleFilter,
      options: moduleOptions,
      onChange: setModuleFilter,
      ariaLabel: "筛选模块",
    },
    {
      kind: "option-group",
      key: "workflow-policy-eligibility",
      label: "类型",
      value: actionFilter,
      options: WORKFLOW_ACTION_FILTER_OPTIONS,
      onChange: (value) => setActionFilter(value as WorkflowActionFilter),
      ariaLabel: "筛选流程类型",
    },
  ];

  const sections: BodySurfaceSectionSpec[] = (() => {
    if (loading || !data) {
      return [createMessageSection("workflow-policy-loading", { content: loading ? "加载流程设置..." : "暂无流程设置数据", tone: "muted" })];
    }
    if (!selectedAction || !draft) {
      return [createMessageSection("workflow-policy-empty", { content: "请选择左侧业务行为", tone: "muted" })];
    }
    const accessMode = workflowAccessMode(draft.mode);
    const canConfigureWorkflow = canConfigureWorkflowAction(selectedAction);
    const canDisableWorkflow = actionCanDisableWorkflow(selectedAction);
    const effectiveAccessMode = canConfigureWorkflow
      ? canDisableWorkflow ? accessMode : "workflow"
      : "permission_only";
    const handlerSourceOptions = contractHandlerSourceOptions(selectedAction, data.enums.handlerSources);
    const supportsDirectWrite = selectedAction.actionContract?.form?.supportedModes?.includes("direct") === true;
    const workflowPolicyFields: FormSurfaceItemSpec[] = [
      {
        key: "workflowAccess",
        label: (
          <span className="inline-flex items-center gap-1">
            流程接入
            <InfoLabel ariaLabel={FLOW_ACCESS_HELP_ARIA} title={FLOW_ACCESS_HELP} />
          </span>
        ),
        spec: {
          valueType: "string",
          control: "choice",
          options: {
            source: "static",
            items: canConfigureWorkflow && canDisableWorkflow
              ? [
                  { value: "workflow", label: ACCESS_LABEL.workflow },
                  { value: "permission_only", label: disabledAccessLabel(selectedAction) },
                ]
              : canConfigureWorkflow
                ? [{ value: "workflow", label: ACCESS_LABEL.workflow }]
                : [{ value: "permission_only", label: supportsDirectWrite ? ACCESS_LABEL.permission_only : "关闭流程" }],
          },
        },
        value: effectiveAccessMode,
        onChange: (value) => setWorkflowAccess(value as WorkflowAccessMode),
      },
    ];
    if (effectiveAccessMode === "workflow") {
      const booleanPolicyFields = BOOLEAN_POLICY_ITEMS.map(([key, label, help]) => booleanChoiceField({
        key,
        label,
        help,
        value: draft[key],
        onChange: (value) => setDraftPatch({ [key]: value } as Partial<WorkflowPolicyDraft>),
      }));
      workflowPolicyFields.push(
        {
          kind: "readonly",
          key: "flowType",
          label: "类型",
          value: FLOW_LABEL[draft.flowType],
        },
        {
          kind: "readonly",
          key: "persistenceMode",
          label: "写入层",
          value: contractPersistenceSummary(selectedAction),
        },
        {
          key: "separationPolicy",
          label: (
            <span className="inline-flex items-center gap-1">
              职责分离
              <InfoLabel ariaLabel={SEPARATION_HELP_ARIA} title={SEPARATION_HELP} />
            </span>
          ),
          spec: {
            valueType: "string",
            control: "choice",
            options: {
              source: "static",
              items: [{ value: "true", label: "是" }, { value: "false", label: "否" }],
            },
          },
          value: workflowSeparationMode(draft.separationPolicy) === "independent_required" ? "true" : "false",
          onChange: (value) => setDraftPatch({
            separationPolicy: value === "true" ? "independent_required" : "auto_pass_if_authorized",
          }),
        },
        ...booleanPolicyFields,
      );
    }

    return [
      createFieldsSection("workflow-policy-editor", workflowPolicyFields, {
        layout: { columns: 3, density: "compact" },
        actions: [
          { key: "save", action: "save", label: saving ? "保存中..." : "保存策略", disabled: saving || !canConfigureWorkflow, onClick: savePolicy },
          ...(exactPolicy ? [{ key: "reset", action: "reset" as const, label: "恢复默认", disabled: saving, onClick: () => void resetPolicy(exactPolicy) }] : []),
        ],
      }),
      ...(effectiveAccessMode === "workflow" ? [
        WorkflowPoliciesNodesSection({
          elements: workflowElements,
          companyOptions: data.companyOptions,
          departmentOptions: data.departmentOptions,
          employeeOptions: data.employeeOptions,
          handlerSourceOptions,
          positionOptions: data.positionOptions,
          selectedElementKey: selectedWorkflowElementKey ?? WORKFLOW_START_KEY,
          saving,
          onAdd: (kind) => nodeActions.add(kind, handlerSourceOptions),
          onAddAfter: (key, kind) => nodeActions.addAfter(key, kind, handlerSourceOptions),
          onAddFromStart: (kind) => nodeActions.addFromStart(kind, handlerSourceOptions),
          onAddBranch: (gatewayKey) => nodeActions.addBranch(gatewayKey, handlerSourceOptions),
          onRemoveBranch: nodeActions.removeBranch,
          onSelectElement: nodeActions.select,
          onRemove: nodeActions.remove,
          onAddCondition: nodeActions.addCondition,
          onRemoveCondition: nodeActions.removeCondition,
          onAddAssignee: (key) => nodeActions.addAssignee(key, handlerSourceOptions),
          onRemoveAssignee: nodeActions.removeAssignee,
          onUpdateBranch: nodeActions.updateBranch,
          onUpdateApprovalElement: nodeActions.updateApprovalElement,
        }),
      ] : []),
    ];
  })();

  const body: BodySurfaceProps = createAdminSelectorSplitBody<WorkflowActionTreeNode>({
    title: "流程设置",
    items: actionTree,
    selectedId: selectedAction?.key ?? null,
    sections,
    onSelect: (node) => {
      const action = firstAction(node);
      if (!action) return;
      setSelectedActionKey(action.key);
    },
    emptyContent: "暂无匹配业务行为",
  });

  return { body, toolbarItems };
}
