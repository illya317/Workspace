"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createEmptySection,
  createFormSection,
  createMessageSection,
  createPageDataSection,
  createStatusSection,
  type BodySurfaceSectionSpec,
  type DataSurfaceCellSpec,
  type FormSurfaceItemSpec,
} from "@workspace/core/ui";
import { DEFAULT_AGENT_ALLOWED_PERMISSION_ACTIONS } from "@workspace/platform/agent-permission-policy";
import {
  isPermissionActionKey,
  PERMISSION_ACTION_KEYS,
  PERMISSION_GROUP_DEFS,
  type PermissionActionKey,
} from "@workspace/platform/permission-actions";
import type { AgentConfigurationData } from "@workspace/platform/types";
import { matchText } from "@workspace/platform/search";
import { putJson, requestJson } from "./api-client";
import {
  createPermissionActionMatrixSurface,
  type PermissionMatrixActionState,
  type PermissionMatrixRecord,
} from "./PermissionActionMatrixGrid";
import type { PermissionMatrixColumn } from "./permission-matrix-model";

type AgentPermissionSubjectType = "user" | "position" | "department";

type AgentPermissionSubject = {
  id: number;
  name: string;
  extra?: Record<string, unknown>;
};

type AgentPermissionGrantResponse = {
  subjects: AgentPermissionSubject[];
  resourceActions: PermissionActionKey[];
  canMutateGrantAction: boolean;
  actionRecords: Record<string, PermissionMatrixRecord<PermissionMatrixActionState>>;
};

type AgentPermissionManagementInput = {
  data: AgentConfigurationData;
  canConfigure: boolean;
  enabled: boolean;
  onConfigurationChanged: () => Promise<void>;
  onCeilingSaved: (actionKeys: PermissionActionKey[]) => void;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
};

export type AgentPermissionManagementSections = {
  ceiling: BodySurfaceSectionSpec[];
  grants: BodySurfaceSectionSpec[];
};

const ACTION_CEILING_COLUMNS: PermissionMatrixColumn[] = [
  { key: "basic", columnLabel: "基础权限", actions: ["entry", "read", "create", "update", "delete"], mode: "chain" },
  { key: "workflowSubmit", columnLabel: "发起", actions: ["submit", "reverse"], mode: "siblings" },
  { key: "workflowApprove", columnLabel: "审批", actions: ["approve", "reject"], mode: "siblings" },
  { key: "lifecycle", columnLabel: "生命周期", actions: ["archive", "revise", "lock", "unlock"], mode: "siblings" },
  { key: "exchange", columnLabel: "数据交换", actions: ["import", "export", "apiUse", "share"], mode: "siblings" },
  { key: "governance", columnLabel: "治理", actions: ["grant", "configure", "audit"], mode: "siblings" },
];

const SUBJECT_TYPE_OPTIONS = [
  { value: "user", label: "员工" },
  { value: "position", label: "岗位" },
  { value: "department", label: "部门" },
];

function normalizedActionKeys(values: readonly string[]) {
  const selected = new Set(values.filter(isPermissionActionKey));
  return PERMISSION_ACTION_KEYS.filter((actionKey) => selected.has(actionKey));
}

function ceilingRecord(actionKeys: readonly PermissionActionKey[]) {
  const selected = new Set(actionKeys);
  return {
    actionStates: Object.fromEntries(PERMISSION_ACTION_KEYS.map((actionKey) => [actionKey, {
      actionKey,
      has: selected.has(actionKey),
      source: selected.has(actionKey) ? "policy" as const : null,
      sourceActionKey: null,
      sourceResourceKey: null,
      directGrantable: true,
      pendingResourceMapping: false,
    }])) as PermissionMatrixRecord["actionStates"],
    actionTree: PERMISSION_GROUP_DEFS.map((group) => ({
      key: group.key,
      actions: group.actions.map((actionKey) => ({ actionKey })),
    })),
  } satisfies PermissionMatrixRecord;
}

function subjectContent(subject: AgentPermissionSubject, subjectType: AgentPermissionSubjectType): DataSurfaceCellSpec {
  const code = subjectType === "user" ? subject.extra?.employeeId : subject.extra?.code;
  return { kind: "stack", gap: "xs", items: [
    { kind: "text", value: subject.name, emphasis: "medium", wrap: "truncate" },
    ...(code ? [{ kind: "text" as const, value: String(code), font: "mono" as const, tone: "muted" as const }] : []),
    ...(subjectType === "user" && !subject.extra?.hasUser
      ? [{ kind: "text" as const, value: "未关联账号", tone: "danger" as const }]
      : []),
  ] };
}

function subjectSearchText(subject: AgentPermissionSubject) {
  return [subject.name, ...Object.values(subject.extra ?? {})]
    .filter((value) => typeof value === "string" || typeof value === "number")
    .join(" ");
}

export function useAgentPermissionManagementSections({
  data,
  canConfigure,
  enabled,
  onConfigurationChanged,
  onCeilingSaved,
  onSuccess,
  onError,
}: AgentPermissionManagementInput): AgentPermissionManagementSections {
  const initialActions = useMemo(() => normalizedActionKeys(data.globalActionCeiling), [data.globalActionCeiling]);
  const [savedActions, setSavedActions] = useState(initialActions);
  const [draftActions, setDraftActions] = useState(initialActions);
  const [savingCeiling, setSavingCeiling] = useState(false);
  const [subjectType, setSubjectType] = useState<AgentPermissionSubjectType>("user");
  const [resourceKey, setResourceKey] = useState(() => (
    data.permissionResources.find((resource) => resource.grantManageable)?.key
      ?? data.permissionResources[0]?.key
      ?? ""
  ));
  const [query, setQuery] = useState("");
  const [grantData, setGrantData] = useState<AgentPermissionGrantResponse | null>(null);
  const [loadingGrants, setLoadingGrants] = useState(false);
  const [grantError, setGrantError] = useState<string | null>(null);
  const [savingGrantKey, setSavingGrantKey] = useState<string | null>(null);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => new Set());

  const selectedResource = data.permissionResources.find((resource) => resource.key === resourceKey) ?? null;
  const fetchGrantData = useCallback(async () => {
    if (!enabled || !selectedResource?.grantManageable) return null;
    const params = new URLSearchParams({ subjectType, resourceKey: selectedResource.key });
    return requestJson<AgentPermissionGrantResponse>(
      `/api/modules/agent/config/permission-grants?${params.toString()}`,
      { fallbackMessage: "加载 Agent 组织授权失败" },
    );
  }, [enabled, selectedResource, subjectType]);

  useEffect(() => {
    let cancelled = false;
    if (!enabled) return;
    if (!selectedResource?.grantManageable) {
      setGrantData(null);
      setGrantError(null);
      setLoadingGrants(false);
      return;
    }
    setLoadingGrants(true);
    setGrantError(null);
    void fetchGrantData()
      .then((response) => {
        if (!cancelled) setGrantData(response);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setGrantData(null);
        setGrantError(error instanceof Error ? error.message : "加载 Agent 组织授权失败");
      })
      .finally(() => {
        if (!cancelled) setLoadingGrants(false);
      });
    return () => { cancelled = true; };
  }, [enabled, fetchGrantData, selectedResource]);

  const draftSet = useMemo(() => new Set(draftActions), [draftActions]);
  const ceilingDirty = PERMISSION_ACTION_KEYS.some((actionKey) => (
    draftSet.has(actionKey) !== savedActions.includes(actionKey)
  ));

  function setCeilingAction(actionKey: PermissionActionKey, value: boolean) {
    setDraftActions((current) => value
      ? PERMISSION_ACTION_KEYS.filter((key) => key === actionKey || current.includes(key))
      : current.filter((key) => key !== actionKey));
  }

  async function saveCeiling() {
    if (!canConfigure || savingCeiling || !ceilingDirty) return;
    setSavingCeiling(true);
    try {
      const response = await putJson<{ actionKeys: PermissionActionKey[] }>(
        "/api/modules/agent/config/action-ceiling",
        { actionKeys: draftActions },
        "保存 Agent 全局动作上限失败",
      );
      const next = normalizedActionKeys(response.actionKeys);
      setSavedActions(next);
      setDraftActions(next);
      onCeilingSaved(next);
      try {
        await onConfigurationChanged();
      } catch (error) {
        onError(error instanceof Error
          ? `全局动作上限已保存，但刷新配置失败：${error.message}`
          : "全局动作上限已保存，但刷新配置失败");
        return;
      }
      onSuccess("Agent 全局动作上限已保存");
    } catch (error) {
      onError(error instanceof Error ? error.message : "保存 Agent 全局动作上限失败");
    } finally {
      setSavingCeiling(false);
    }
  }

  async function toggleGrant(subject: AgentPermissionSubject, state: PermissionMatrixActionState) {
    if (!selectedResource?.grantManageable || savingGrantKey) return;
    const subjectId = subjectType === "user" ? Number(subject.extra?.userId) : subject.id;
    if (!Number.isInteger(subjectId) || subjectId <= 0) {
      onError("该员工未关联可授权账号");
      return;
    }
    const key = `${subject.id}:${state.actionKey}`;
    setSavingGrantKey(key);
    try {
      const result = await putJson<{ changedCount: number }>("/api/modules/agent/config/permission-grants", {
        changes: [{
          subjectType,
          subjectId,
          resourceKey: selectedResource.key,
          actionKey: state.actionKey,
          value: state.source === "direct" ? !state.has : true,
        }],
      }, "保存 Agent 组织授权失败");
      const refreshFailures: string[] = [];
      try {
        const refreshed = await fetchGrantData();
        if (refreshed) setGrantData(refreshed);
      } catch (error) {
        const message = error instanceof Error ? error.message : "刷新授权矩阵失败";
        setGrantData(null);
        setGrantError(message);
        refreshFailures.push(message);
      }
      try {
        await onConfigurationChanged();
      } catch (error) {
        refreshFailures.push(error instanceof Error ? error.message : "刷新 Agent 配置失败");
      }
      if (refreshFailures.length > 0) {
        onError(`Agent 组织授权已保存，但刷新失败：${refreshFailures.join("；")}`);
        return;
      }
      onSuccess(result.changedCount > 0 ? "Agent 组织授权已保存" : "授权未发生变化，已刷新最新状态");
    } catch (error) {
      onError(error instanceof Error ? error.message : "保存 Agent 组织授权失败");
    } finally {
      setSavingGrantKey(null);
    }
  }

  const policy = ceilingRecord(draftActions);
  const ceilingSection = {
    ...createPageDataSection("agent-action-ceiling-matrix", createPermissionActionMatrixSurface({
      subjects: [{ key: "agent" }],
      subjectColumnLabel: "",
      getSubjectKey: (subject) => subject.key,
      renderSubject: () => ({ kind: "text", value: "" }),
      getRecord: () => policy,
      expandedKeys: new Set<string>(),
      onToggleExpand: () => undefined,
      onToggleAction: (_subject, state) => setCeilingAction(state.actionKey, !state.has),
      canToggleAction: () => canConfigure && !savingCeiling,
      visibleActionKeys: PERMISSION_ACTION_KEYS,
      columns: ACTION_CEILING_COLUMNS,
      layout: "singleSubjectDetails",
    })),
    header: {
      title: "全局 Agent 动作上限",
      badges: [
        { key: "allowed", label: `允许 ${draftActions.length}`, tone: "success" as const },
        { key: "denied", label: `禁止 ${PERMISSION_ACTION_KEYS.length - draftActions.length}`, tone: "muted" as const },
      ],
      actions: [
        { key: "save-agent-ceiling", label: savingCeiling ? "保存中…" : "保存上限", icon: "save" as const, disabled: !canConfigure || savingCeiling || !ceilingDirty, onClick: () => { void saveCeiling(); } },
        { key: "reset-agent-ceiling", label: "恢复安全默认", icon: "reset" as const, disabled: !canConfigure || savingCeiling, onClick: () => setDraftActions([...DEFAULT_AGENT_ALLOWED_PERMISSION_ACTIONS]) },
      ],
    },
  } satisfies BodySurfaceSectionSpec;

  const filterItems: FormSurfaceItemSpec[] = [
    {
      key: "resourceKey",
      label: "Agent 能力资源",
      spec: {
        valueType: "string",
        control: "choice",
        options: { source: "static", items: data.permissionResources.map((resource) => ({
          value: resource.key,
          label: resource.name,
          description: resource.grantManageable ? "可维护授权" : "无授权管理权限",
        })) },
      },
      value: resourceKey,
      onChange: (value) => {
        setResourceKey(String(value ?? ""));
        setExpandedKeys(new Set());
      },
    },
    {
      key: "subjectType",
      label: "授权主体",
      spec: { valueType: "string", control: "choice", options: { source: "static", items: SUBJECT_TYPE_OPTIONS } },
      value: subjectType,
      onChange: (value) => {
        setSubjectType(String(value) as AgentPermissionSubjectType);
        setExpandedKeys(new Set());
      },
    },
    {
      key: "permissionQuery",
      label: "查找主体",
      spec: { valueType: "string", control: "text", usage: "search" },
      value: query,
      placeholder: "姓名、员工编号、岗位或部门",
      onChange: (value) => setQuery(String(value ?? "")),
    },
  ];
  const filterSection = createFormSection("agent-permission-grant-filters", {
    kind: "filters",
    header: { title: "授权范围", description: "选择能力资源与授权主体，再维护其真实组织权限。" },
    content: { items: filterItems, layout: { flow: "inline", columns: 3, density: "compact" } },
  });

  const normalizedQuery = query.trim();
  const matchingSubjects = (grantData?.subjects ?? [])
    .filter((subject) => subjectType !== "user" || Boolean(subject.extra?.hasUser))
    .filter((subject) => !normalizedQuery || matchText(subjectSearchText(subject), normalizedQuery));
  const visibleSubjects = matchingSubjects.slice(0, 100);
  const resultSummary = grantData && selectedResource?.grantManageable
    ? createMessageSection("agent-permission-result-summary", {
        tone: "muted",
        content: matchingSubjects.length > visibleSubjects.length
          ? `共 ${matchingSubjects.length} 条，当前显示前 100 条；可继续输入关键词缩小范围。`
          : `共 ${matchingSubjects.length} 条授权主体。`,
      })
    : null;
  let matrixSection: BodySurfaceSectionSpec;
  if (!selectedResource) {
    matrixSection = createEmptySection("agent-permission-no-resource", { content: "暂无已注册的 Agent 能力资源。" });
  } else if (!selectedResource.grantManageable) {
    matrixSection = createMessageSection("agent-permission-resource-readonly", {
      tone: "muted",
      content: `你可以查看 ${selectedResource.name} 已纳入 Agent 能力目录，但没有该资源的授权管理权限。agent.config.configure 不会绕过这条边界。`,
    });
  } else if (loadingGrants) {
    matrixSection = createStatusSection("agent-permission-loading", { kind: "loading", content: "正在加载组织授权…" });
  } else if (grantError) {
    matrixSection = createStatusSection("agent-permission-error", { kind: "error", content: grantError });
  } else if (!grantData || visibleSubjects.length === 0) {
    matrixSection = createEmptySection("agent-permission-empty", { content: normalizedQuery ? "没有匹配的授权主体。" : "暂无可授权主体。" });
  } else {
    const subjectColumnLabel = subjectType === "user" ? "员工" : subjectType === "position" ? "岗位" : "部门";
    matrixSection = {
      ...createPageDataSection("agent-permission-grant-matrix", createPermissionActionMatrixSurface({
        subjects: visibleSubjects,
        subjectColumnLabel,
        getSubjectKey: (subject) => String(subject.id),
        renderSubject: (subject) => subjectContent(subject, subjectType),
        getRecord: (subject) => grantData.actionRecords[String(subject.id)],
        expandedKeys,
        onToggleExpand: (subject) => setExpandedKeys((current) => {
          const next = new Set(current);
          const key = String(subject.id);
          if (next.has(key)) next.delete(key); else next.add(key);
          return next;
        }),
        onToggleAction: (subject, state) => { void toggleGrant(subject, state); },
        canToggleAction: (subject) => (
          grantData.canMutateGrantAction
          && !(subjectType === "user" && !subject.extra?.hasUser)
        ),
        savingKey: savingGrantKey,
        visibleActionKeys: grantData.resourceActions,
      })),
      header: {
        title: `${selectedResource.name} · ${subjectColumnLabel}授权`,
      },
    };
  }

  return {
    ceiling: [
      ceilingSection,
      ...(!canConfigure ? [createMessageSection("agent-action-ceiling-readonly", {
        tone: "muted",
        content: "当前只有读取权限；修改动作上限需要 agent.config.configure。",
      })] : []),
    ],
    grants: [filterSection, ...(resultSummary ? [resultSummary] : []), matrixSection],
  };
}
