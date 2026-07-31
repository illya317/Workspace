"use client";

import {
  createFieldsSection,
  createListSection,
  createMasterDetailBody,
  createMessageSection,
  createPageBody,
  createPageDataSection,
  createPanelSection,
  type BodySurfaceSectionSpec,
  type BodySurfaceSplitSectionProps,
  type DataSurfaceColumnSpec,
  type FormSurfaceItemSpec,
  type PageSurfaceCreateSpec,
  useFeedback,
} from "@workspace/core/ui";
import { useCallback, useEffect, useState } from "react";
import { postJson, requestJson } from "@workspace/platform/ui/api-client";
import { formatSettingsApiDate } from "./settings-api-client-model";
import {
  groupPolicyDeliveryView,
  groupPolicyScheduleLabel,
  isManagedGroupClaimed,
  isManagedGroupReadyForPolicy,
  managedGroupGovernanceStage,
  managedGroupStatusView,
  managedGroupVerificationView,
  type ManagedWeComGroupRow,
  type NotificationGroupPolicyRow,
  type NotificationGroupSchedule,
  type WeComGroupGovernanceResponse,
} from "./wecom-group-governance-model";
import type { NotificationDefinitionWorkbenchRow } from "./notification-publishing-workbench-model";
const GROUP_CONSOLE_ROUTE = "/api/settings/api/open/group-notifications";
const MANAGED_GROUP_ROUTE = "/api/settings/api/open/managed-groups";
const GROUP_POLICY_ROUTE = "/api/settings/api/open/group-policies";
const NOTIFICATION_DEFINITIONS_ROUTE = "/api/settings/api/open/notification-definitions";

type PolicyDraft = {
  key: string;
  label: string;
  definitionKey: string;
  scopeType: "workspace" | "departments" | "projects" | "users";
  scopeIds: string[];
  scheduleMode: "manual" | "weekly";
  weekday: number;
  time: string;
  bindWeeklyAgent: boolean;
  enabled: boolean;
};

const EMPTY_POLICY_DRAFT: PolicyDraft = {
  key: "",
  label: "",
  definitionKey: "",
  scopeType: "workspace",
  scopeIds: [],
  scheduleMode: "manual",
  weekday: 5,
  time: "17:30",
  bindWeeklyAgent: false,
  enabled: false,
};

export function useWeComGroupGovernanceWorkbench({ enabled }: { enabled: boolean }): {
  body: BodySurfaceSplitSectionProps | null;
  create?: PageSurfaceCreateSpec;
} {
  const { error: showError, success: showSuccess } = useFeedback();
  const [data, setData] = useState<WeComGroupGovernanceResponse | null>(null);
  const [notificationDefinitions, setNotificationDefinitions] = useState<NotificationDefinitionWorkbenchRow[]>([]);
  const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [mobileDetailActive, setMobileDetailActive] = useState(false);
  const [claimGroup, setClaimGroup] = useState<ManagedWeComGroupRow | null>(null);
  const [claimName, setClaimName] = useState("");
  const [claimOwnerUserId, setClaimOwnerUserId] = useState("");
  const [claimOwnerPositionId, setClaimOwnerPositionId] = useState("");
  const [createPolicyOpen, setCreatePolicyOpen] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<NotificationGroupPolicyRow | null>(null);
  const [policyDraft, setPolicyDraft] = useState<PolicyDraft>(EMPTY_POLICY_DRAFT);

  const load = useCallback(async (preferredGroupKey?: string | null) => {
    if (!enabled) return;
    setLoading(true);
    try {
      const [next, definitionData] = await Promise.all([
        requestJson<WeComGroupGovernanceResponse>(GROUP_CONSOLE_ROUTE),
        requestJson<{ definitions: NotificationDefinitionWorkbenchRow[] }>(NOTIFICATION_DEFINITIONS_ROUTE),
      ]);
      setData(next);
      setNotificationDefinitions(definitionData.definitions);
      setSelectedGroupKey((current) => {
        const candidate = preferredGroupKey ?? current;
        return next.managedGroups.some((group) => group.groupKey === candidate)
          ? candidate
          : next.managedGroups[0]?.groupKey ?? null;
      });
    } catch (error) {
      showError(error instanceof Error ? error.message : "加载企业微信群治理数据失败");
    } finally {
      setLoading(false);
    }
  }, [enabled, showError]);

  useEffect(() => {
    if (enabled) void load();
  }, [enabled, load]);

  if (!enabled) return { body: null };

  const selectedGroup = data?.managedGroups.find((group) => group.groupKey === selectedGroupKey) ?? null;
  const selectedPolicies = (data?.groupPolicies ?? []).filter((policy) => policy.groupKey === selectedGroupKey);
  const selectedDeliveries = (data?.recentDeliveries ?? []).filter((delivery) => delivery.groupKey === selectedGroupKey);
  const canConfigure = Boolean(data?.canConfigure);
  const managedGroups = data?.managedGroups ?? [];
  const pendingClaimCount = managedGroups.filter((group) => group.status === "discovered").length;
  const readyGroupCount = managedGroups.filter((group) => isManagedGroupReadyForPolicy(group)).length;
  const selectedGroupClaimed = isManagedGroupClaimed(selectedGroup);
  const selectedGroupReady = isManagedGroupReadyForPolicy(selectedGroup);
  const weeklyAgentAvailable = Boolean(data?.weeklyAgentOptions.some((option) => option.key === "work.weekly-report"));
  const publishedDefinitionCount = data?.definitionOptions?.length ?? 0;
  const policyCreateReady = selectedGroupReady && publishedDefinitionCount > 0;

  function openClaim(group: ManagedWeComGroupRow) {
    setClaimGroup(group);
    setClaimName(group.displayName ?? "");
    setClaimOwnerUserId(group.ownerUser ? String(group.ownerUser.id) : "");
    setClaimOwnerPositionId(group.ownerPosition ? String(group.ownerPosition.id) : "");
  }

  async function claimSelectedGroup() {
    if (!claimGroup || !claimName.trim() || (!claimOwnerUserId && !claimOwnerPositionId)) return;
    setBusy("claim");
    try {
      await postJson(`${MANAGED_GROUP_ROUTE}/${encodeURIComponent(claimGroup.groupKey)}/claim`, {
        displayName: claimName.trim(),
        ownerUserId: claimOwnerUserId ? Number(claimOwnerUserId) : null,
        ownerPositionId: claimOwnerPositionId ? Number(claimOwnerPositionId) : null,
        expectedVersion: claimGroup.version,
      });
      setClaimGroup(null);
      showSuccess("企业微信群已认领");
      await load(claimGroup.groupKey);
    } catch (error) {
      showError(error instanceof Error ? error.message : "认领企业微信群失败");
    } finally {
      setBusy(null);
    }
  }

  async function verifyGroup(group: ManagedWeComGroupRow) {
    setBusy(`verify-${group.groupKey}`);
    try {
      await postJson(`${MANAGED_GROUP_ROUTE}/${encodeURIComponent(group.groupKey)}/verify`, {
        expectedVersion: group.version,
      });
      showSuccess("企业微信群验证通过");
      await load(group.groupKey);
    } catch (error) {
      showError(error instanceof Error ? error.message : "验证企业微信群失败");
    } finally {
      setBusy(null);
    }
  }

  async function updateGroupStatus(group: ManagedWeComGroupRow) {
    const nextStatus = group.status === "active" ? "suspended" : "active";
    setBusy(`status-${group.groupKey}`);
    try {
      await requestJson(`${MANAGED_GROUP_ROUTE}/${encodeURIComponent(group.groupKey)}`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus, expectedVersion: group.version }),
      });
      showSuccess(nextStatus === "active" ? "企业微信群已启用" : "企业微信群已停用");
      await load(group.groupKey);
    } catch (error) {
      showError(error instanceof Error ? error.message : "更新企业微信群状态失败");
    } finally {
      setBusy(null);
    }
  }

  function editPolicy(policy: NotificationGroupPolicyRow) {
    const schedule = policy.schedule;
    setEditingPolicy(policy);
    setPolicyDraft({
      key: policy.key,
      label: policy.label,
      definitionKey: policy.definitionKey,
      scopeType: policy.dataScope.type,
      scopeIds: policy.dataScope.ids,
      scheduleMode: schedule.mode,
      weekday: schedule.mode === "weekly" ? schedule.weekday : 5,
      time: schedule.mode === "weekly" ? schedule.time : "17:30",
      bindWeeklyAgent: Boolean(policy.weeklyAgentBinding),
      enabled: policy.enabled,
    });
  }

  function scopeLabel() {
    if (policyDraft.scopeType === "workspace") return "全 Workspace";
    const options = data?.dataScopeOptions?.[policyDraft.scopeType] ?? [];
    const labels = options.filter((option) => policyDraft.scopeIds.includes(option.id)).map((option) => option.label);
    return labels.join("、") || "未选择范围";
  }

  function scheduleValue(): NotificationGroupSchedule {
    return policyDraft.scheduleMode === "weekly"
      ? { mode: "weekly", timezone: "Asia/Shanghai", weekday: policyDraft.weekday, time: policyDraft.time }
      : { mode: "manual" };
  }

  async function persistPolicy(policy?: NotificationGroupPolicyRow | null) {
    if (!selectedGroup || !policyDraft.label.trim() || !policyDraft.definitionKey) {
      throw new Error("请完整填写策略名称和通知定义");
    }
    if (policyDraft.scopeType !== "workspace" && policyDraft.scopeIds.length === 0) {
      throw new Error("请选择策略数据范围");
    }
    setBusy(policy ? `policy-${policy.id}` : "policy-create");
    const payload = {
      definitionKey: policyDraft.definitionKey,
      label: policyDraft.label.trim(),
      dataScope: { type: policyDraft.scopeType, ids: policyDraft.scopeType === "workspace" ? [] : policyDraft.scopeIds, label: scopeLabel() },
      schedule: scheduleValue(),
      weeklyAgentKey: policyDraft.bindWeeklyAgent && weeklyAgentAvailable ? "work.weekly-report" : null,
      enabled: policyDraft.enabled,
    };
    try {
      if (policy) {
        await requestJson(`${GROUP_POLICY_ROUTE}/${encodeURIComponent(policy.id)}`, {
          method: "PATCH",
          body: JSON.stringify({ ...payload, expectedVersion: policy.version }),
        });
      } else {
        await postJson(GROUP_POLICY_ROUTE, {
          ...payload,
          key: policyDraft.key.trim(),
          groupKey: selectedGroup.groupKey,
        });
      }
      setEditingPolicy(null);
      setCreatePolicyOpen(false);
      setPolicyDraft(EMPTY_POLICY_DRAFT);
      showSuccess(policy ? "群发策略已保存" : "群发策略已创建");
      await load(selectedGroup.groupKey);
      return { outcome: "saved" as const };
    } catch (error) {
      showError(error instanceof Error ? error.message : "保存群发策略失败");
      throw error;
    } finally {
      setBusy(null);
    }
  }

  const scopeOptions = data?.dataScopeOptions?.[policyDraft.scopeType === "workspace" ? "departments" : policyDraft.scopeType] ?? [];
  const policyFields: FormSurfaceItemSpec[] = [
    ...(!editingPolicy ? [{
      key: "key", label: "策略键", required: true,
      spec: { valueType: "string" as const, control: "text" as const },
      value: policyDraft.key, onChange: (value: unknown) => setPolicyDraft((current) => ({ ...current, key: String(value ?? "") })),
      placeholder: "weekly.department.summary",
    }] : []),
    {
      key: "label", label: "策略名称", required: true,
      spec: { valueType: "string", control: "text" }, value: policyDraft.label,
      onChange: (value: unknown) => setPolicyDraft((current) => ({ ...current, label: String(value ?? "") })),
    },
    {
      key: "definition", label: "通知定义", required: true,
      spec: { valueType: "string", control: "choice", options: { source: "static", items: (data?.definitionOptions ?? []).map((option) => ({ value: option.key, label: `${option.label} · r${option.revision}` })) } },
      value: policyDraft.definitionKey,
      onChange: (value: unknown) => setPolicyDraft((current) => ({ ...current, definitionKey: String(value ?? "") })),
    },
    {
      key: "scope-type", label: "数据范围", required: true,
      spec: { valueType: "string", control: "choice", options: { source: "static", items: [
        { value: "workspace", label: "全 Workspace" }, { value: "departments", label: "指定部门" },
        { value: "projects", label: "指定项目" }, { value: "users", label: "指定人员" },
      ] } },
      value: policyDraft.scopeType,
      onChange: (value: unknown) => setPolicyDraft((current) => ({ ...current, scopeType: String(value) as PolicyDraft["scopeType"], scopeIds: [] })),
    },
    ...(policyDraft.scopeType !== "workspace" ? [{
      key: "scope-ids", label: "范围对象", required: true, span: "wide" as const,
      spec: { valueType: "array" as const, control: "choice" as const, multiple: true, options: { source: "static" as const, items: scopeOptions.map((option) => ({ value: String(option.id), label: option.label })) } },
      value: policyDraft.scopeIds,
      onChange: (value: unknown) => setPolicyDraft((current) => ({ ...current, scopeIds: Array.isArray(value) ? value.map(String) : [] })),
    }] : []),
    {
      key: "schedule", label: "发送计划",
      spec: { valueType: "string", control: "choice", options: { source: "static", items: [{ value: "manual", label: "手动触发" }, { value: "weekly", label: "每周定时" }] } },
      value: policyDraft.scheduleMode,
      onChange: (value: unknown) => setPolicyDraft((current) => ({ ...current, scheduleMode: value === "weekly" ? "weekly" : "manual" })),
    },
    ...(policyDraft.scheduleMode === "weekly" ? [{
      key: "weekday", label: "星期",
      spec: { valueType: "string" as const, control: "choice" as const, options: { source: "static" as const, items: [1, 2, 3, 4, 5, 6, 7].map((value) => ({ value: String(value), label: `周${"一二三四五六日"[value - 1]}` })) } },
      value: String(policyDraft.weekday),
      onChange: (value: unknown) => setPolicyDraft((current) => ({ ...current, weekday: Number(value) })),
    }, {
      key: "time", label: "时间",
      spec: { valueType: "time" as const, control: "temporal" as const, precision: "time" as const }, value: policyDraft.time,
      onChange: (value: unknown) => setPolicyDraft((current) => ({ ...current, time: String(value ?? "") })),
    }] : []),
    {
      key: "weekly-agent", label: "绑定周报 Agent",
      hint: weeklyAgentAvailable
        ? "固定使用 work.weekly-report；Agent 只提交 policyId，不接触群会话标识。"
        : "周报 Agent 当前不可用。",
      spec: { valueType: "boolean", control: "boolean", presentation: "checkbox", state: weeklyAgentAvailable ? "normal" : "disabled" }, value: policyDraft.bindWeeklyAgent,
      onChange: (value: unknown) => setPolicyDraft((current) => ({ ...current, bindWeeklyAgent: Boolean(value) })),
    },
    {
      key: "enabled", label: "启用策略",
      hint: "只有已认领、已验证且启用的群才能启用策略。",
      spec: { valueType: "boolean", control: "boolean", presentation: "checkbox" }, value: policyDraft.enabled,
      onChange: (value: unknown) => setPolicyDraft((current) => ({ ...current, enabled: Boolean(value) })),
    },
  ];

  const policyColumns: DataSurfaceColumnSpec<NotificationGroupPolicyRow>[] = [
    { key: "label", label: "策略", cell: (row) => ({ kind: "stack", items: [{ kind: "text", value: row.label, emphasis: "medium" }, { kind: "text", value: row.key, tone: "muted", font: "mono" }] }) },
    { key: "schedule", label: "计划", cell: (row) => groupPolicyScheduleLabel(row.schedule) },
    { key: "agent", label: "Agent", cell: (row) => row.weeklyAgentBinding?.label ?? "未绑定" },
    { key: "status", label: "状态", cell: (row) => ({ kind: "badge", label: row.enabled ? "启用" : "停用", tone: row.enabled ? "green" : "slate" }) },
    { key: "delivery", label: "最近投递", cell: (row) => ({ kind: "badge", ...groupPolicyDeliveryView(row) }) },
  ];

  const groupList = createListSection("managed-group-list", {
    presentation: "cards",
    density: "compact",
    empty: { content: loading ? "正在加载企业微信群…" : "Bot 尚未发现可认领的企业微信群", compact: true },
    items: (data?.managedGroups ?? []).map((group) => ({
      key: group.groupKey,
      title: group.displayName || "未认领企业微信群",
      description: group.groupKey,
      badges: [
        { key: "status", ...managedGroupStatusView(group.status) },
        { key: "verification", ...managedGroupVerificationView(group.verificationStatus) },
      ],
      tone: group.groupKey === selectedGroupKey ? "success" : group.status === "suspended" ? "muted" : "default",
      onClick: () => { setSelectedGroupKey(group.groupKey); setClaimGroup(null); setEditingPolicy(null); setMobileDetailActive(true); },
    })),
  });

  const editingDefinition = editingPolicy ? notificationDefinitions.find((item) => item.key === editingPolicy.definitionKey) ?? null : null;
  const editPolicyPanel = editingPolicy ? createPanelSection("group-policy-edit-panel", {
    title: "3 编辑每群策略",
    sections: [createFieldsSection("group-policy-edit-fields", policyFields, {
      header: { title: editingPolicy.label || "编辑群发策略", description: `版本 ${editingPolicy.version}` },
      layout: { columns: 2, density: "compact" },
      actions: [
        { key: "cancel", action: "reset", label: "取消编辑", disabled: busy === `policy-${editingPolicy.id}`, onClick: () => setEditingPolicy(null) },
        { key: "save", action: "save", label: "保存策略", disabled: busy === `policy-${editingPolicy.id}`, onClick: () => void persistPolicy(editingPolicy) },
      ],
    }), createFieldsSection("group-policy-notification-content", [
      { kind: "readonly", key: "notification-label", label: "通知名称", value: editingDefinition?.label ?? "未找到已发布定义", span: "wide" },
      { kind: "readonly", key: "notification-title", label: "标题模板", value: editingDefinition?.titleTemplate ?? "未找到已发布定义", span: "wide" },
      { kind: "readonly", key: "notification-body", label: "正文模板", value: editingDefinition?.bodyTemplate ?? "未找到已发布定义", span: "wide" },
    ], {
      header: { title: "通知内容", description: "内容来自当前已发布的通知定义。" },
      layout: { columns: 1, density: "compact" },
    })],
  }) : null;

  const detailSections: BodySurfaceSectionSpec[] = selectedGroup ? [
    createPanelSection("managed-group-summary", {
      title: `2 认领、命名与验证 · ${selectedGroup.displayName || "匿名群"}`,
      actions: canConfigure ? [
        { key: "claim", label: selectedGroup.displayName ? "修改认领" : "认领并命名", onClick: () => openClaim(selectedGroup) },
        {
          key: "verify",
          label: selectedGroup.verificationStatus === "verified" ? "已验证" : "验证 Bot 在群",
          disabled: !selectedGroupClaimed || selectedGroup.verificationStatus === "verified" || busy === `verify-${selectedGroup.groupKey}`,
          onClick: () => void verifyGroup(selectedGroup),
        },
        {
          key: "status",
          label: selectedGroup.status === "active" ? "停用" : "启用",
          disabled: !selectedGroupClaimed || selectedGroup.verificationStatus !== "verified" || busy === `status-${selectedGroup.groupKey}`,
          onClick: () => void updateGroupStatus(selectedGroup),
        },
      ] : [],
      sections: [createFieldsSection("managed-group-facts", [
        { kind: "readonly", key: "group-key", label: "Group Key", value: selectedGroup.groupKey, fontRole: "mono" },
        { kind: "readonly", key: "governance-stage", label: "当前步骤", value: managedGroupGovernanceStage(selectedGroup) },
        { kind: "readonly", key: "status", label: "目录状态", value: managedGroupStatusView(selectedGroup.status).label },
        { kind: "readonly", key: "verification", label: "验证状态", value: managedGroupVerificationView(selectedGroup.verificationStatus).label },
        { kind: "readonly", key: "owner", label: "负责人", value: selectedGroup.ownerUser?.displayName || selectedGroup.ownerPosition?.name || "未指定" },
        { kind: "readonly", key: "last-seen", label: "Bot 最近观测", value: formatSettingsApiDate(selectedGroup.lastSeenAt, "-") },
        { kind: "readonly", key: "last-verified", label: "最近验证", value: formatSettingsApiDate(selectedGroup.lastVerifiedAt, "未验证") },
      ], { layout: { columns: 2, density: "compact" } })],
    }),
    createPanelSection("managed-group-policies", {
      title: "3 每群策略与周报绑定",
      sections: [
        ...(selectedGroupReady && publishedDefinitionCount === 0 ? [createMessageSection("managed-group-definition-required", {
          tone: "muted",
          content: "先在“通知定义”页签发布至少一个定义，再创建该群的发送策略。",
        })] : []),
        createPageDataSection("managed-group-policy-table", {
        ...(canConfigure && selectedPolicies.length > 0 ? [createMessageSection("managed-group-policy-edit-hint", {
          tone: "muted",
          content: "点击每行右侧的铅笔按钮，编辑面板会在表格下方展开。",
        })] : []),
          kind: "table", rows: selectedPolicies, columns: policyColumns,
          visibleColumns: policyColumns.map((column) => column.key),
          emptyText: selectedGroupReady ? "该群尚未配置发送策略" : "完成认领、验证并启用群后才能配置策略",
          rowKey: (row) => row.id,
          rowActions: canConfigure ? (row) => [{
            key: `edit-${row.id}`,
            label: "编辑",
            kind: "edit" as const,
            disabled: busy === `policy-${row.id}`,
            onClick: () => editPolicy(row),
          }] : undefined,
          actionsColumn: canConfigure ? { label: "操作" } : undefined,
          presentation: { density: "compact" },
          scroll: { x: true },
        }),
        ...(editPolicyPanel ? [editPolicyPanel] : []),
      ],
    }),
    ...(data?.canAudit ? [createPanelSection("managed-group-deliveries", {
      title: "最近投递与失败",
      sections: [createPageDataSection("managed-group-delivery-table", {
        kind: "table", rows: selectedDeliveries,
        columns: [
          { key: "createdAt", label: "时间", cell: (row) => formatSettingsApiDate(row.createdAt, "-") },
          { key: "status", label: "状态", cell: (row) => row.status },
          { key: "attempt", label: "尝试", cell: (row) => row.attemptCount },
          { key: "error", label: "失败", cell: (row) => row.error ? `${row.error.code} · ${row.error.summary ?? ""}` : "-" },
        ],
        visibleColumns: ["createdAt", "status", "attempt", "error"], emptyText: "暂无群投递记录",
        rowKey: (row) => row.id, presentation: { density: "compact" },
      })],
    })] : []),
  ] : [createMessageSection("managed-group-empty", { tone: "muted", content: "先从左侧受管群目录选择一个匿名群，再完成认领、命名和验证。" })];
  const claimPanel = claimGroup ? createPanelSection("managed-group-claim-panel", {
    title: "2 认领并命名企业微信群",
    sections: [createFieldsSection("managed-group-claim-fields", [
      { key: "display-name", label: "群名称", required: true, spec: { valueType: "string", control: "text" }, value: claimName, onChange: (value: unknown) => setClaimName(String(value ?? "")) },
      { key: "owner-user", label: "负责人", spec: { valueType: "string", control: "choice", options: { source: "static", items: (data?.ownerUserOptions ?? []).map((option) => ({ value: String(option.id), label: option.label })) } }, value: claimOwnerUserId, onChange: (value: unknown) => setClaimOwnerUserId(String(value ?? "")) },
      { key: "owner-position", label: "负责岗位", spec: { valueType: "string", control: "choice", options: { source: "static", items: (data?.ownerPositionOptions ?? []).map((option) => ({ value: String(option.id), label: option.label })) } }, value: claimOwnerPositionId, onChange: (value: unknown) => setClaimOwnerPositionId(String(value ?? "")) },
    ], {
      layout: { columns: 1, density: "compact" },
      actions: [
        { key: "cancel", action: "reset", label: "取消", disabled: busy === "claim", onClick: () => setClaimGroup(null) },
        { key: "save", action: "save", label: "保存认领", disabled: busy === "claim" || !claimName.trim() || (!claimOwnerUserId && !claimOwnerPositionId), onClick: () => void claimSelectedGroup() },
      ],
    })],
  }) : null;
  const create: PageSurfaceCreateSpec | undefined = canConfigure ? {
    id: "group-policy-create",
    presentation: "block",
    title: "3 新增每群策略",
    open: createPolicyOpen,
    canCreate: true,
    disabled: !policyCreateReady || busy !== null,
    content: { kind: "sections", sections: [{ key: "group-policy-create-fields", title: "策略设置", items: policyFields, layout: { columns: 2, density: "compact" } }] },
    submission: { action: "save", disabled: !policyCreateReady || !policyDraft.key.trim() || !policyDraft.label.trim() || !policyDraft.definitionKey, execute: () => persistPolicy(null) },
    feedback: { saved: "群发策略已创建", error: "创建群发策略失败" },
    onOpenChange: (open) => { setCreatePolicyOpen(open); if (open) { setEditingPolicy(null); setPolicyDraft(EMPTY_POLICY_DRAFT); } },
    onCancel: () => { setCreatePolicyOpen(false); setPolicyDraft(EMPTY_POLICY_DRAFT); },
  } : undefined;
  const governancePath = createPanelSection("managed-group-governance-path", {
    title: "企业微信群发治理主路径",
    sections: [
      createFieldsSection("managed-group-governance-progress", [
        { kind: "readonly", key: "directory", label: "1 受管群目录", value: `${managedGroups.length} 个群 · ${pendingClaimCount} 个待认领` },
        { kind: "readonly", key: "claim-and-verify", label: "2 认领、命名与验证", value: managedGroupGovernanceStage(selectedGroup) },
        { kind: "readonly", key: "policy-and-agent", label: "3 每群策略与周报绑定", value: selectedGroupReady ? `${selectedPolicies.length} 条策略 · ${publishedDefinitionCount} 个可用定义` : `${readyGroupCount} 个群已就绪` },
      ], { layout: { columns: 3, density: "compact" } }),
      createMessageSection("managed-group-guardrail", {
        tone: "warning",
        content: "未认领、未验证或已停用的群默认禁止发送；控制台和 Agent 都不接收 chatId 或 webhook。",
      }),
    ],
  });
  return {
    create,
    body: createMasterDetailBody({
      master: { label: "1 受管群目录", body: createPageBody([groupList]), presentation: "compact" },
      detail: createPageBody([
        governancePath,
        ...detailSections,
        ...(claimPanel ? [claimPanel] : []),
      ]),
      desktop: { ratio: [3, 7] },
      mobile: { detailActive: mobileDetailActive, onNavigateToList: () => setMobileDetailActive(false) },
    }),
  };
}
