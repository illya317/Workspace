"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  createFieldsSection,
  createListSection,
  createMasterDetailBody,
  createMessageSection,
  createPageBody,
  createPanelSection,
  createSectionSection,
  type BodySurfaceSplitSectionProps,
  type FormSurfaceItemSpec,
  type PageSurfaceCreateSpec,
  useFeedback,
} from "@workspace/core/ui";
import { postJson, requestJson } from "@workspace/platform/ui/api-client";
import { useNotificationPublishingAuditSections } from "./notification-publishing-audit-sections";
import {
  EMPTY_NOTIFICATION_DEFINITION_DRAFT,
  extractNotificationVariableKeys,
  notificationDefinitionState,
  notificationPublicationCurlExample,
  renderNotificationTemplatePreview,
  toNotificationDefinitionDraft,
  type NotificationDefinitionDraft,
  type NotificationPublishingWorkbenchResponse,
} from "./notification-publishing-workbench-model";

export function useNotificationPublishingWorkbench({ enabled }: { enabled: boolean }): {
  body: BodySurfaceSplitSectionProps | null;
  create?: PageSurfaceCreateSpec;
} {
  const { error: showError, success: showSuccess } = useFeedback();
  const [data, setData] = useState<NotificationPublishingWorkbenchResponse | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<NotificationDefinitionDraft>(EMPTY_NOTIFICATION_DEFINITION_DRAFT);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [mobileDetailActive, setMobileDetailActive] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async (preferredKey?: string | null) => {
    if (!enabled) return;
    setLoading(true);
    try {
      const next = await requestJson<NotificationPublishingWorkbenchResponse>("/api/settings/api/open/notification-definitions");
      const selected = next.definitions.find((item) => item.key === preferredKey)
        ?? next.definitions[0]
        ?? null;
      const nextSelectedKey = selected?.key ?? null;
      setData(next);
      setSelectedKey(nextSelectedKey);
      setDraft(selected ? toNotificationDefinitionDraft(selected) : EMPTY_NOTIFICATION_DEFINITION_DRAFT);
      setCreateOpen(false);
    } catch (error) {
      showError(error instanceof Error ? error.message : "加载通知定义失败");
    } finally {
      setLoading(false);
    }
  }, [enabled, showError]);

  useEffect(() => {
    if (enabled) void load();
  }, [enabled, load]);

  const selected = data?.definitions.find((item) => item.key === selectedKey) ?? null;
  const canConfigure = Boolean(data?.canConfigure);
  const fieldsDisabled = !canConfigure || selected?.status === "archived";
  const variableKeys = useMemo(
    () => extractNotificationVariableKeys(draft.titleTemplate, draft.bodyTemplate, draft.hrefTemplate),
    [draft.bodyTemplate, draft.hrefTemplate, draft.titleTemplate],
  );
  const auditSections = useNotificationPublishingAuditSections({ data, loading });
  const update = <K extends keyof NotificationDefinitionDraft>(
    key: K,
    value: NotificationDefinitionDraft[K],
  ) => setDraft((current) => ({ ...current, [key]: value }));

  async function save(rethrow = false) {
    const key = draft.key.trim();
    if (!key || !draft.label.trim() || !draft.titleTemplate.trim() || !draft.bodyTemplate.trim()) {
      if (rethrow) throw new Error("请完整填写通知定义");
      showError("请填写定义键、名称、标题模板和正文模板");
      return undefined;
    }
    setBusy("save");
    try {
      await postJson("/api/settings/api/open/notification-definitions", {
        ...(selected ? { id: selected.id, expectedVersion: selected.version } : {}),
        key,
        label: draft.label.trim(),
        description: draft.description.trim() || null,
        titleTemplate: draft.titleTemplate,
        bodyTemplate: draft.bodyTemplate,
        hrefTemplate: draft.hrefTemplate,
        responseMode: draft.responseMode,
        isImportant: draft.isImportant,
        allowUserApi: draft.allowUserApi,
        allowProjectMonitoring: draft.allowProjectMonitoring,
        allowedOpenApiClientIds: draft.allowedOpenApiClientIds,
      });
      showSuccess(selected ? "草稿已保存" : "通知定义已创建");
      await load(key);
      return { outcome: "saved" as const };
    } catch (error) {
      if (rethrow) throw error;
      showError(error instanceof Error ? error.message : "保存通知定义失败");
      return undefined;
    } finally {
      setBusy(null);
    }
  }

  async function transition(action: "publish" | "archive") {
    if (!selected) return;
    setBusy(action);
    try {
      await postJson(`/api/settings/api/open/notification-definitions/${encodeURIComponent(selected.key)}/${action}`, {
        expectedVersion: selected.version,
      });
      showSuccess(action === "publish" ? "通知定义已发布" : "通知定义已归档");
      await load(selected.key);
    } catch (error) {
      showError(error instanceof Error ? error.message : "通知定义操作失败");
    } finally {
      setBusy(null);
    }
  }

  if (!enabled) return { body: null };

  const fields: FormSurfaceItemSpec[] = [
    {
      key: "key", label: "定义键", required: true, hint: "以 custom. 开头的稳定标识；发布调用会引用它。",
      spec: { valueType: "string", control: "text", state: selected || fieldsDisabled ? "disabled" : "normal" },
      value: draft.key, onChange: (value: unknown) => update("key", String(value ?? "")), placeholder: "custom.operations.shipment_delayed",
    },
    {
      key: "label", label: "名称", required: true,
      spec: { valueType: "string", control: "text", state: fieldsDisabled ? "disabled" : "normal" },
      value: draft.label, onChange: (value: unknown) => update("label", String(value ?? "")), placeholder: "发货延迟提醒",
    },
    {
      key: "description", label: "用途说明", span: "wide",
      spec: { valueType: "string", control: "text", state: fieldsDisabled ? "disabled" : "normal" },
      value: draft.description, onChange: (value: unknown) => update("description", String(value ?? "")),
      placeholder: "说明触发场景与接收对象；不接受脚本或 HTML。",
    },
    {
      key: "titleTemplate", label: "标题模板", required: true, span: "wide", hint: "用 {{flat_key}} 引用变量。",
      spec: { valueType: "string", control: "text", state: fieldsDisabled ? "disabled" : "normal" },
      value: draft.titleTemplate, onChange: (value: unknown) => update("titleTemplate", String(value ?? "")),
      placeholder: "订单 {{order_no}} 已延迟",
    },
    {
      key: "bodyTemplate", label: "正文模板", required: true, span: "wide",
      spec: { valueType: "string", control: "text", multiline: true, state: fieldsDisabled ? "disabled" : "normal" },
      value: draft.bodyTemplate, onChange: (value: unknown) => update("bodyTemplate", String(value ?? "")),
      placeholder: "订单 {{order_no}} 预计于 {{eta}} 到达。",
    },
    {
      key: "hrefTemplate", label: "站内跳转模板", span: "wide", hint: "只填写 Workspace 站内相对路径；可留空。",
      spec: { valueType: "string", control: "text", state: fieldsDisabled ? "disabled" : "normal" },
      value: draft.hrefTemplate, onChange: (value: unknown) => update("hrefTemplate", String(value ?? "")),
      placeholder: "/work/orders/{{order_id}}",
    },
    {
      key: "responseMode", label: "响应模式",
      spec: {
        valueType: "string", control: "choice", state: fieldsDisabled ? "disabled" : "normal",
        options: { source: "static", items: [{ value: "read", label: "阅读即可" }, { value: "acknowledge", label: "需要确认收到" }] },
      },
      value: draft.responseMode,
      onChange: (value: unknown) => update("responseMode", value === "acknowledge" ? "acknowledge" : "read"),
    },
    {
      key: "isImportant", label: "重要通知",
      spec: { valueType: "boolean", control: "boolean", presentation: "checkbox", state: fieldsDisabled ? "disabled" : "normal" },
      value: draft.isImportant, onChange: (value: unknown) => update("isImportant", Boolean(value)),
    },
    {
      key: "allowUserApi", label: "允许个人 API Key 发布", hint: "仍受定义发布状态与接收人权限约束。",
      spec: { valueType: "boolean", control: "boolean", presentation: "checkbox", state: fieldsDisabled ? "disabled" : "normal" },
      value: draft.allowUserApi, onChange: (value: unknown) => update("allowUserApi", Boolean(value)),
    },
    {
      key: "allowProjectMonitoring", label: "允许项目监管规则使用", hint: "项目管理员仍需通知配置权限；规则只能读取受控项目事实。",
      spec: { valueType: "boolean", control: "boolean", presentation: "checkbox", state: fieldsDisabled ? "disabled" : "normal" },
      value: draft.allowProjectMonitoring, onChange: (value: unknown) => update("allowProjectMonitoring", Boolean(value)),
    },
    {
      key: "clients", label: "允许的 OpenAPI Client", span: "wide",
      spec: {
        valueType: "array", control: "choice", multiple: true, state: fieldsDisabled ? "disabled" : "normal",
        options: {
          source: "static",
          items: (data?.clients ?? []).map((client) => ({
            value: String(client.id),
            label: `${client.name}${client.status === "active" ? "" : ` · ${client.status}`}`,
          })),
          visibleCount: 6,
        },
      },
      value: draft.allowedOpenApiClientIds.map(String),
      onChange: (value: unknown) => update("allowedOpenApiClientIds", Array.isArray(value) ? value.map(Number).filter(Number.isFinite) : []),
    },
    {
      kind: "note", key: "variables",
      content: variableKeys.length
        ? `已识别变量：${variableKeys.map((key) => `{{${key}}}`).join("、")}`
        : "尚未识别变量。模板仅支持 {{flat_key}} 占位符，不执行脚本或 HTML。",
    },
  ];

  const list = createListSection("notification-definition-list", {
    presentation: "cards",
    density: "compact",
    empty: { content: loading ? "正在加载通知定义…" : "暂无通知定义", compact: true },
    items: (data?.definitions ?? []).map((item) => {
      const state = notificationDefinitionState(item);
      return {
        key: item.key,
        title: item.label,
        description: `${item.key} · 修订 ${item.revision}`,
        badges: [{ key: "state", label: state.label, tone: state.tone }],
        tone: item.key === selectedKey ? "success" as const : "default" as const,
        onClick: () => {
          setCreateOpen(false);
          setSelectedKey(item.key);
          setDraft(toNotificationDefinitionDraft(item));
          setMobileDetailActive(true);
        },
      };
    }),
  });

  const editor = selected ? createPanelSection("notification-definition-editor", {
    title: `${selected.label} · 编排`,
    actions: [{ key: "refresh", label: "刷新", icon: "refresh", disabled: loading, onClick: () => void load(selected.key) }],
    sections: [
      createMessageSection("notification-definition-state", {
        tone: notificationDefinitionState(selected).tone,
        content: `${notificationDefinitionState(selected).label} · 当前修订 ${selected.revision} · 已发布修订 ${selected.publishedRevision ?? "无"} · 版本 ${selected.version}`,
      }),
      createFieldsSection("notification-definition-fields", fields, {
        layout: { columns: 2, density: "compact" },
        actions: [
          { key: "save", action: "save", label: busy === "save" ? "保存中…" : "保存草稿", disabled: fieldsDisabled || busy !== null, onClick: () => void save() },
          { key: "publish", action: "submit" as const, label: "发布", disabled: !canConfigure || busy !== null || selected.status === "archived" || selected.publishedRevision === selected.revision, onClick: () => void transition("publish") },
          { key: "archive", action: "archive" as const, label: "归档", disabled: !canConfigure || busy !== null || selected.status === "archived", onClick: () => void transition("archive") },
        ],
      }),
      createSectionSection("notification-preview", {
        title: "渲染预览",
        sections: [
          createMessageSection("notification-preview-title", { tone: draft.isImportant ? "warning" : "default", content: renderNotificationTemplatePreview(draft.titleTemplate || "通知标题", variableKeys) }),
          createMessageSection("notification-preview-body", { tone: "muted", content: renderNotificationTemplatePreview(draft.bodyTemplate || "通知正文", variableKeys) }),
          ...(draft.hrefTemplate ? [createMessageSection("notification-preview-href", { tone: "muted", content: `跳转：${renderNotificationTemplatePreview(draft.hrefTemplate, variableKeys)}` })] : []),
        ],
      }),
      createSectionSection("notification-curl", {
        title: "发布调用示例",
        sections: [createFieldsSection("notification-curl-content", [{
          kind: "readonly",
          key: "curl",
          label: "cURL",
          value: notificationPublicationCurlExample(draft, variableKeys),
          variant: "plain",
          fontRole: "mono",
          span: "wide",
        }], { layout: { columns: 1, density: "compact" } })],
      }),
    ],
  }) : null;

  const create: PageSurfaceCreateSpec | undefined = canConfigure ? {
    id: "notification-definition-create",
    presentation: "block",
    title: "新建通知定义",
    open: createOpen,
    canCreate: true,
    disabled: busy !== null,
    content: { kind: "form", form: { items: fields, layout: { columns: 2, density: "compact" } } },
    submission: {
      action: "save",
      disabled: busy !== null || !draft.key.trim() || !draft.label.trim() || !draft.titleTemplate.trim() || !draft.bodyTemplate.trim(),
      execute: () => save(true),
    },
    feedback: { saved: "通知定义已创建", error: "创建通知定义失败" },
    onOpenChange: (open) => {
      setCreateOpen(open);
      if (open) {
        setSelectedKey(null);
        setDraft(EMPTY_NOTIFICATION_DEFINITION_DRAFT);
        setMobileDetailActive(true);
      }
    },
    onCancel: () => {
      setCreateOpen(false);
      const fallback = data?.definitions[0] ?? null;
      setSelectedKey(fallback?.key ?? null);
      setDraft(fallback ? toNotificationDefinitionDraft(fallback) : EMPTY_NOTIFICATION_DEFINITION_DRAFT);
    },
  } : undefined;

  return {
    create,
    body: createMasterDetailBody({
      master: { label: "通知定义", body: createPageBody([list]), presentation: "compact" },
      detail: createPageBody([
        ...(editor ? [editor] : []),
        ...auditSections,
      ]),
      desktop: { ratio: [3, 7] },
      mobile: { detailActive: mobileDetailActive, onNavigateToList: () => setMobileDetailActive(false) },
    }),
  };
}
