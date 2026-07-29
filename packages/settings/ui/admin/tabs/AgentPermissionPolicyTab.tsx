"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createPageBody,
  createPageDataSection,
  createStatusSection,
  type BodySurfaceProps,
} from "@workspace/core/ui";
import {
  PERMISSION_ACTION_KEYS,
  PERMISSION_GROUP_DEFS,
  type PermissionActionKey,
} from "@workspace/platform/permission-actions";
import { DEFAULT_AGENT_ALLOWED_PERMISSION_ACTIONS } from "@workspace/platform/agent-permission-policy";
import { putJson, requestJson } from "@workspace/platform/ui/api-client";
import {
  createPermissionActionMatrixSurface,
  type PermissionMatrixActionState,
  type PermissionMatrixRecord,
} from "@workspace/platform/ui/PermissionActionMatrixGrid";
import type { PermissionMatrixColumn } from "@workspace/platform/ui/permission-matrix-model";

const AGENT_POLICY_COLUMNS: PermissionMatrixColumn[] = [
  { key: "basic", columnLabel: "基础权限", actions: ["entry", "read", "create", "update", "delete"], mode: "chain" },
  { key: "workflowSubmit", columnLabel: "发起", actions: ["submit", "reverse"], mode: "siblings" },
  { key: "workflowApprove", columnLabel: "审批", actions: ["approve", "reject"], mode: "siblings" },
  { key: "lifecycle", columnLabel: "生命周期", actions: ["archive", "revise", "lock", "unlock"], mode: "siblings" },
  { key: "exchange", columnLabel: "数据交换", actions: ["import", "export", "apiUse", "share"], mode: "siblings" },
  { key: "governance", columnLabel: "治理", actions: ["grant", "configure", "audit"], mode: "siblings" },
];

const AGENT_POLICY_SUBJECT = { key: "kimi" };

type SystemConfigResponse = {
  agentAllowedActions?: PermissionActionKey[];
};

type UseAgentPermissionPolicyTabInput = {
  enabled: boolean;
  showToast: (message: string, type?: "success" | "error") => void;
};

export function useAgentPermissionPolicyTab({
  enabled,
  showToast,
}: UseAgentPermissionPolicyTabInput): { body: BodySurfaceProps } {
  const [savedActions, setSavedActions] = useState<PermissionActionKey[]>([
    ...DEFAULT_AGENT_ALLOWED_PERMISSION_ACTIONS,
  ]);
  const [draftActions, setDraftActions] = useState<PermissionActionKey[]>([
    ...DEFAULT_AGENT_ALLOWED_PERMISSION_ACTIONS,
  ]);
  const [loaded, setLoaded] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const config = await requestJson<SystemConfigResponse>("/api/settings/admin/system-config", {
        fallbackMessage: "加载智能体权限策略失败",
      });
      const next = config.agentAllowedActions ?? [...DEFAULT_AGENT_ALLOWED_PERMISSION_ACTIONS];
      setSavedActions(next);
      setDraftActions(next);
      setLoaded(true);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "加载智能体权限策略失败", "error");
    } finally {
      setLoading(false);
      setAttempted(true);
    }
  }, [showToast]);

  useEffect(() => {
    if (!enabled || loaded || attempted || loading) return;
    void load();
  }, [attempted, enabled, load, loaded, loading]);

  const draftSet = useMemo(() => new Set(draftActions), [draftActions]);
  const record = useMemo<PermissionMatrixRecord<PermissionMatrixActionState>>(() => ({
    actionStates: Object.fromEntries(PERMISSION_ACTION_KEYS.map((action) => [action, {
      actionKey: action,
      has: draftSet.has(action),
      source: draftSet.has(action) ? "policy" : null,
      sourceActionKey: null,
      sourceResourceKey: null,
      directGrantable: true,
      pendingResourceMapping: false,
    }])) as PermissionMatrixRecord<PermissionMatrixActionState>["actionStates"],
    actionTree: PERMISSION_GROUP_DEFS.map((group) => ({
      key: group.key,
      actions: group.actions.map((actionKey) => ({ actionKey })),
    })),
  }), [draftSet]);
  const dirty = PERMISSION_ACTION_KEYS.some((action) => (
    draftSet.has(action) !== savedActions.includes(action)
  ));

  function setAction(action: PermissionActionKey, allowed: boolean) {
    setDraftActions((current) => (
      allowed
        ? PERMISSION_ACTION_KEYS.filter((key) => key === action || current.includes(key))
        : current.filter((key) => key !== action)
    ));
  }

  async function save() {
    setSaving(true);
    try {
      await putJson("/api/settings/admin/system-config", { agentAllowedActions: draftActions }, "保存智能体权限策略失败");
      setSavedActions(draftActions);
      showToast("智能体权限策略已保存", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "保存智能体权限策略失败", "error");
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) {
    return {
      body: createPageBody([
        createStatusSection("agent-policy-loading", {
          kind: loading ? "loading" : "error",
          content: loading ? "正在加载智能体权限策略..." : "智能体权限策略加载失败",
        }),
      ]),
    };
  }

  const matrixSection = {
    ...createPageDataSection("agent-policy-matrix", createPermissionActionMatrixSurface({
      subjects: [AGENT_POLICY_SUBJECT],
      subjectColumnLabel: "",
      getSubjectKey: (subject) => subject.key,
      renderSubject: () => ({ kind: "text", value: "" }),
      getRecord: () => record,
      expandedKeys: new Set<string>(),
      onToggleExpand: () => undefined,
      onToggleAction: (_subject, state) => setAction(state.actionKey, !state.has),
      canToggleAction: () => !saving,
      visibleActionKeys: PERMISSION_ACTION_KEYS,
      columns: AGENT_POLICY_COLUMNS,
      layout: "singleSubjectDetails",
      previewImpliedActions: false,
    })),
    visibility: "desktop" as const,
    header: {
      title: "智能体权限上限",
      badges: [
        { key: "allowed", label: `允许 ${draftActions.length}`, tone: "success" as const },
        { key: "denied", label: `禁止 ${PERMISSION_ACTION_KEYS.length - draftActions.length}`, tone: "muted" as const },
      ],
      actions: [
        { key: "save-agent-policy", label: saving ? "保存中..." : "保存策略", icon: "save" as const, disabled: saving || !dirty, onClick: () => void save() },
        { key: "reset-agent-policy", label: "恢复安全默认", icon: "reset" as const, disabled: saving, onClick: () => setDraftActions([...DEFAULT_AGENT_ALLOWED_PERMISSION_ACTIONS]) },
      ],
    },
  };
  return { body: createPageBody([
    {
      ...createStatusSection("agent-policy-mobile-boundary", {
        kind: "empty",
        content: "智能体权限上限需要核对完整动作矩阵，请在桌面端维护。",
      }),
      visibility: "mobile",
    },
    matrixSection,
  ]) };
}
