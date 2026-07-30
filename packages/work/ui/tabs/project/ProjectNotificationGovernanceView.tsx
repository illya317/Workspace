"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  createFieldsSection,
  createListSection,
  createMasterDetailBody,
  createMessageSection,
  createPageBody,
  createPageDataSection,
  createPanelSection,
  createSectionSection,
  PageSurface,
  type DataSurfaceColumnSpec,
  type FormSurfaceItemSpec,
  type PageSurfaceTabBarSpec,
  useFeedback,
} from "@workspace/core/ui";
import {
  loadProjectNotificationEvaluations,
  loadProjectNotificationRules,
  previewProjectNotificationRule,
  redriveProjectNotificationSignal,
  saveProjectNotificationRule,
  transitionProjectNotificationRule,
  type ProjectNotificationEvaluation,
  type ProjectNotificationQueueFailure,
  type ProjectNotificationRulesResponse,
} from "./notification-governance-api";
import {
  PROJECT_NOTIFICATION_CHANNEL_OPTIONS,
  projectNotificationConditionFields,
  projectNotificationOutcomeLabel,
  projectNotificationOutcomeTone,
  PROJECT_NOTIFICATION_ROLE_OPTIONS,
  projectNotificationRuleState,
} from "./notification-governance-fields";
import {
  applyProjectNotificationAuditResponse,
  defaultProjectNotificationPredicate,
  EMPTY_PROJECT_NOTIFICATION_RULE,
  flatProjectNotificationCondition,
  normalizeProjectNotificationRedriveReason,
  PROJECT_NOTIFICATION_EVENT_OPTIONS,
  replaceFlatProjectNotificationCondition,
  toProjectNotificationRuleDraft,
  type ProjectNotificationPredicate,
  type ProjectNotificationRuleDraft,
} from "./notification-governance-model";
import { useProjectNotificationQueueFailureSection } from "./use-project-notification-queue-failure-section";

export default function ProjectNotificationGovernanceView({
  projectId,
  tabbar,
}: {
  projectId: number;
  tabbar: PageSurfaceTabBarSpec;
}) {
  const feedback = useFeedback();
  const [data, setData] = useState<ProjectNotificationRulesResponse | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draft, setDraft] = useState<ProjectNotificationRuleDraft>(EMPTY_PROJECT_NOTIFICATION_RULE);
  const [evaluations, setEvaluations] = useState<ProjectNotificationEvaluation[]>([]);
  const [preview, setPreview] = useState<string | null>(null);
  const [redriveTarget, setRedriveTarget] = useState<ProjectNotificationQueueFailure | null>(null);
  const [redriveReason, setRedriveReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mobileDetailActive, setMobileDetailActive] = useState(false);

  const load = useCallback(async (preferredId?: number | null) => {
    setLoading(true);
    setError(null);
    try {
      const next = await loadProjectNotificationRules(projectId);
      const selected = next.rules.find((item) => item.id === (preferredId ?? selectedId))
        ?? next.rules[0]
        ?? null;
      setData(next);
      setSelectedId(selected?.id ?? null);
      setDraft(selected ? toProjectNotificationRuleDraft(selected) : EMPTY_PROJECT_NOTIFICATION_RULE);
      setEvaluations([]);
      setRedriveTarget(null);
      setRedriveReason("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "加载项目通知监管失败");
    } finally {
      setLoading(false);
    }
  }, [projectId, selectedId]);

  useEffect(() => {
    void load(null);
    // A project navigation creates a fresh contribution view; selection changes are handled explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => {
    let current = true;
    setEvaluations([]);
    if (!selectedId || !data?.permissions.canAudit) {
      return () => {
        current = false;
      };
    }
    void applyProjectNotificationAuditResponse(
      loadProjectNotificationEvaluations(projectId, selectedId),
      () => current,
      (result) => setEvaluations(result.items),
    ).catch(() => {
      if (current) setEvaluations([]);
    });
    return () => {
      current = false;
    };
  }, [data?.permissions.canAudit, projectId, selectedId]);

  const selected = data?.rules.find((item) => item.id === selectedId) ?? null;
  const canConfigure = Boolean(data?.permissions.canConfigure);
  const disabled = !canConfigure || selected?.status === "archived";
  const flatCondition = useMemo(() => flatProjectNotificationCondition(draft.condition), [draft.condition]);

  function updateDraft<K extends keyof ProjectNotificationRuleDraft>(key: K, value: ProjectNotificationRuleDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function updatePredicates(predicates: ProjectNotificationPredicate[]) {
    if (!flatCondition) return;
    updateDraft("condition", replaceFlatProjectNotificationCondition(draft.condition, flatCondition.logic, predicates));
  }

  async function save() {
    if (!draft.key.trim() || !draft.label.trim() || !draft.definitionKey || draft.audiencePolicy.roles.length === 0 || draft.channelPolicy.channels.length === 0) {
      feedback.error("请填写规则键、名称、通知定义，并至少选择一个角色和渠道");
      return;
    }
    setBusy("save");
    try {
      const result = await saveProjectNotificationRule(projectId, selected, draft);
      feedback.success(selected ? "监管规则草稿已保存" : "监管规则已创建");
      setPreview(null);
      await load(result.rule.id);
    } catch (cause) {
      feedback.error(cause instanceof Error ? cause.message : "保存监管规则失败");
    } finally {
      setBusy(null);
    }
  }

  async function transition(action: "publish" | "archive") {
    if (!selected) return;
    setBusy(action);
    try {
      const result = await transitionProjectNotificationRule(projectId, selected, action);
      feedback.success(action === "publish" ? "监管规则已发布" : "监管规则已归档");
      await load(result.rule.id);
    } catch (cause) {
      feedback.error(cause instanceof Error ? cause.message : "监管规则操作失败");
    } finally {
      setBusy(null);
    }
  }

  async function runPreview() {
    if (!selected) {
      feedback.error("请先保存草稿，再基于当前项目事实预览");
      return;
    }
    setBusy("preview");
    try {
      const result = await previewProjectNotificationRule(projectId, selected.id);
      const audience = result.audienceUsernames.length ? result.audienceUsernames.join("、") : "无匹配接收人";
      setPreview(result.blockedReason
        ? `未触发：${result.blockedReason}`
        : `${result.matched ? "条件命中" : "条件未命中"} · 接收人：${audience}`);
    } catch (cause) {
      feedback.error(cause instanceof Error ? cause.message : "预览失败");
    } finally {
      setBusy(null);
    }
  }

  async function redriveFailedSignal() {
    if (!redriveTarget) return;
    const reason = normalizeProjectNotificationRedriveReason(redriveReason);
    if (!reason) { feedback.error("请填写 1 至 500 字的重投原因"); return; }
    setBusy("redrive");
    try {
      const result = await redriveProjectNotificationSignal(projectId, {
        signalId: redriveTarget.signalId, expectedAttemptCount: redriveTarget.attemptCount, reason,
      });
      feedback.success(result.replayed ? "该重投已存在，已返回原审计回执" : "失败信号已重投并记录审计原因");
      await load(selectedId);
    } catch (cause) {
      feedback.error(cause instanceof Error ? cause.message : "重投失败信号失败");
    } finally {
      setBusy(null);
    }
  }

  const list = createListSection("project-notification-rule-list", {
    presentation: "cards",
    density: "compact",
    empty: { content: loading ? "正在加载规则…" : "暂无项目通知规则", compact: true },
    items: (data?.rules ?? []).map((rule) => {
      const state = projectNotificationRuleState(rule);
      return {
        key: rule.id,
        title: rule.label,
        description: `${rule.key} · r${rule.revision}`,
        badges: [
          { key: "state", label: state.label, tone: state.tone },
          ...(rule.channelPolicy.channels.includes("wecom")
            ? [{ key: "wecom", label: "企业微信", tone: "success" as const }]
            : []),
        ],
        tone: rule.id === selectedId ? "success" as const : "default" as const,
        onClick: () => {
          setSelectedId(rule.id);
          setDraft(toProjectNotificationRuleDraft(rule));
          setPreview(null);
          setEvaluations([]);
          setMobileDetailActive(true);
        },
      };
    }),
  });

  const fields: FormSurfaceItemSpec[] = [
    {
      key: "key",
      label: "规则键",
      required: true,
      hint: "项目内稳定标识；创建后不可修改。",
      spec: { valueType: "string", control: "text", state: selected || disabled ? "disabled" : "normal" },
      value: draft.key,
      placeholder: "risk-before-deadline",
      onChange: (value: unknown) => updateDraft("key", String(value ?? "").trimStart()),
    },
    {
      key: "label",
      label: "规则名称",
      required: true,
      spec: { valueType: "string", control: "text", state: disabled ? "disabled" : "normal" },
      value: draft.label,
      placeholder: "重点项目到期风险提醒",
      onChange: (value: unknown) => updateDraft("label", String(value ?? "")),
    },
    {
      key: "definitionKey",
      label: "通知定义",
      required: true,
      hint: "只显示变量可由可信项目快照提供的已发布定义。",
      spec: {
        valueType: "string",
        control: "choice",
        state: disabled ? "disabled" : "normal",
        options: {
          source: "static",
          items: (data?.availableDefinitions ?? []).map((item) => ({
            value: item.key,
            label: `${item.label} · r${item.revision}`,
          })),
        },
      },
      value: draft.definitionKey,
      onChange: (value: unknown) => updateDraft("definitionKey", String(value ?? "")),
    },
    {
      key: "eventType",
      label: "监管信号",
      required: true,
      spec: {
        valueType: "string",
        control: "choice",
        state: disabled ? "disabled" : "normal",
        options: { source: "static", items: [...PROJECT_NOTIFICATION_EVENT_OPTIONS] },
      },
      value: draft.eventType,
      onChange: (value: unknown) => updateDraft("eventType", value as ProjectNotificationRuleDraft["eventType"]),
    },
    {
      key: "roles",
      label: "接收角色",
      required: true,
      span: "wide",
      spec: {
        valueType: "array",
        control: "choice",
        multiple: true,
        state: disabled ? "disabled" : "normal",
        options: { source: "static", items: PROJECT_NOTIFICATION_ROLE_OPTIONS, visibleCount: 5 },
      },
      value: draft.audiencePolicy.roles,
      onChange: (value: unknown) => updateDraft("audiencePolicy", {
        roles: (Array.isArray(value) ? value : []) as ProjectNotificationRuleDraft["audiencePolicy"]["roles"],
      }),
    },
    {
      key: "channels",
      label: "投递渠道",
      required: true,
      span: "wide",
      hint: "企业微信仅投递给已绑定的用户私聊；不接受裸 chatid 或 webhook。",
      spec: {
        valueType: "array",
        control: "choice",
        multiple: true,
        state: disabled ? "disabled" : "normal",
        options: { source: "static", items: PROJECT_NOTIFICATION_CHANNEL_OPTIONS, visibleCount: 2 },
      },
      value: draft.channelPolicy.channels,
      onChange: (value: unknown) => updateDraft("channelPolicy", {
        channels: (Array.isArray(value) ? value : []) as ProjectNotificationRuleDraft["channelPolicy"]["channels"],
      }),
    },
    {
      key: "cooldownSeconds",
      label: "冷却时间（秒）",
      hint: "同一规则命中后，在冷却期内只记录抑制事实，不重复发送。",
      spec: { valueType: "number", control: "number", state: disabled ? "disabled" : "normal", validation: { min: 0, max: 31_536_000 } },
      value: draft.cooldownSeconds,
      onChange: (value: unknown) => updateDraft("cooldownSeconds", Math.max(0, Math.round(Number(value) || 0))),
    },
    ...(flatCondition ? [{
      kind: "section" as const,
      key: "condition-builder",
      title: "触发条件",
      subtitle: "条件只读取服务端项目快照，不执行脚本、SQL、正则或任意字段路径。",
      layout: { columns: 1 as const, density: "compact" as const },
      items: [
        {
          key: "conditionLogic",
          label: "组合方式",
          spec: {
            valueType: "string" as const,
            control: "choice" as const,
            state: disabled ? "disabled" as const : "normal" as const,
            options: { source: "static" as const, items: [{ value: "all", label: "全部满足" }, { value: "any", label: "任一满足" }], visibleCount: 2 },
          },
          value: flatCondition.logic,
          onChange: (value: unknown) => updateDraft("condition", {
            op: value === "any" ? "any" : "all",
            conditions: flatCondition.predicates,
          }),
        },
        {
          kind: "repeatable" as const,
          key: "conditions",
          title: "条件行",
          items: flatCondition.predicates.map((predicate, index) => ({
            key: `condition-${index}`,
            title: `条件 ${index + 1}`,
            items: projectNotificationConditionFields(predicate, index, disabled, flatCondition.predicates, updatePredicates),
            actions: [{
              key: `remove-condition-${index}`,
              label: "移除",
              icon: "delete" as const,
              variant: "danger" as const,
              disabled: disabled || flatCondition.predicates.length <= 1,
              onClick: () => updatePredicates(flatCondition.predicates.filter((_item, itemIndex) => itemIndex !== index)),
            }],
          })),
          addAction: {
            key: "add-condition",
            label: "添加条件",
            icon: "add" as const,
            disabled: disabled || flatCondition.predicates.length >= 32,
            onClick: () => updatePredicates([...flatCondition.predicates, defaultProjectNotificationPredicate()]),
          },
        },
      ],
    }] : [{
      kind: "note" as const,
      key: "advanced-condition",
      content: "这是通过 API 创建的高级嵌套条件。控制台会原样保留；请继续通过 API 修改条件树。",
    }]),
  ];

  const editor = createPanelSection("project-notification-rule-editor", {
    title: selected ? `${selected.label} · 监管编排` : "新建项目通知规则",
    sections: [
      ...(selected ? [createMessageSection("project-notification-rule-state", {
        tone: projectNotificationRuleState(selected).tone,
        content: `${projectNotificationRuleState(selected).label} · 当前修订 ${selected.revision} · 已发布修订 ${selected.publishedRevision ?? "无"} · 版本 ${selected.version}`,
      })] : []),
      ...(preview ? [createMessageSection("project-notification-preview", {
        tone: preview.startsWith("条件命中") ? "success" : "muted",
        content: preview,
      })] : []),
      createFieldsSection("project-notification-rule-fields", fields, {
        layout: { columns: 2, density: "compact" },
        actions: [
          { key: "save", action: "save", label: busy === "save" ? "保存中…" : "保存草稿", disabled: disabled || busy !== null, onClick: () => void save() },
          { key: "preview", action: "view", label: "预览命中", disabled: !selected || busy !== null, onClick: () => void runPreview() },
          ...(selected ? [
            { key: "publish", action: "submit" as const, label: "发布规则", disabled: disabled || busy !== null || selected.publishedRevision === selected.revision, onClick: () => void transition("publish") },
            { key: "archive", action: "archive" as const, label: "归档", disabled: disabled || busy !== null, onClick: () => void transition("archive") },
          ] : []),
        ],
      }),
    ],
  });

  const evaluationColumns: DataSurfaceColumnSpec<ProjectNotificationEvaluation>[] = [
    { key: "evaluatedAt", label: "评估时间", cell: (row) => new Date(row.evaluatedAt).toLocaleString("zh-CN", { hour12: false }) },
    { key: "signalKind", label: "信号", cell: (row) => ({ kind: "text", value: row.signalKind, font: "mono" }) },
    { key: "outcome", label: "结果", cell: (row) => ({ kind: "badge", label: projectNotificationOutcomeLabel(row.outcome), tone: projectNotificationOutcomeTone(row.outcome) }) },
    { key: "publicationId", label: "发布回执", cell: (row) => row.publicationId ?? row.errorCode ?? "—" },
  ];
  const queue = data?.queueHealth;
  const queueTone = queue?.counts.failed
    ? "danger" as const
    : queue?.counts.retrying
      ? "warning" as const
      : queue?.backlogCount
        ? "muted" as const
        : "success" as const;
  const queueFailureSection = useProjectNotificationQueueFailureSection(
    data?.queueHealth.recentFailures ?? [], loading, canConfigure, busy, redriveTarget, redriveReason, setRedriveReason, setRedriveTarget, () => void redriveFailedSignal(),
  );

  const body = error
    ? createPageBody([createMessageSection("project-notification-access-error", {
      tone: "danger",
      content: `无法打开项目通知监管：${error}`,
    })])
    : createPageBody([
      createSectionSection("project-notification-governance", {
        title: "项目通知监管",
        create: {
          id: "project-notification-rule-create",
          title: "新建规则",
          presentation: "row",
          canCreate: canConfigure,
          disabled: busy !== null,
          onCreate: () => {
            setSelectedId(null);
            setDraft(EMPTY_PROJECT_NOTIFICATION_RULE);
            setEvaluations([]);
            setPreview(null);
            setMobileDetailActive(true);
          },
        },
        actions: [{ key: "refresh", label: "刷新", icon: "refresh", disabled: loading, onClick: () => void load(selectedId) }],
        sections: [
          createMessageSection("project-notification-guardrails", {
            tone: "muted",
            content: "项目域决定何时通知和通知谁；通知平台负责版本、审计与投递。企业微信 Bot 仅使用受控私聊目标，失败会进入持久重试队列。",
          }),
          ...(queue ? [createMessageSection("project-notification-queue-health", {
            tone: queueTone,
            content: `信号队列：待处理 ${queue.counts.pending} · 执行中 ${queue.counts.leased} · 重试 ${queue.counts.retrying} · 永久失败 ${queue.counts.failed}`,
          })] : []),
          {
            key: "project-notification-master-detail",
            body: createMasterDetailBody({
              master: { label: "监管规则", body: createPageBody([list]) },
              detail: createPageBody([editor]),
              desktop: { ratio: [3, 7] },
              mobile: { detailActive: mobileDetailActive, onNavigateToList: () => setMobileDetailActive(false) },
            }),
          },
        ],
      }),
      ...(data?.permissions.canAudit && selected ? [createSectionSection("project-notification-evaluation-ledger", {
        title: "最近评估事实",
        sections: [createPageDataSection("project-notification-evaluations", {
          kind: "table",
          rows: evaluations,
          columns: evaluationColumns,
          visibleColumns: evaluationColumns.map((column) => column.key),
          loading,
          emptyText: "暂无评估记录",
          rowKey: (row) => row.id,
          presentation: { density: "compact" },
        })],
      })] : []),
      ...(data?.permissions.canAudit ? [queueFailureSection] : []),
    ]);

  return <PageSurface kind="standard" tabbar={tabbar} body={body} />;
}
