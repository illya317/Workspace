"use client";

import {
  createFieldsSection,
  createListSection,
  createMasterDetailBody,
  createMessageSection,
  createPageBody,
  createPageDataSection,
  createPageTabBar,
  createPanelSection,
  createSectionSection,
  type BodySurfaceProps,
  type BodySurfaceSectionSpec,
  type DataSurfaceColumnSpec,
  type FormSurfaceItemSpec,
  type PageSurfaceCreateSpec,
  PageSurface,
} from "@workspace/core/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import { postJson, putJson, requestJson } from "@workspace/platform/ui/api-client";
import { useNotificationPublishingWorkbench } from "./NotificationPublishingWorkbench";
import { useWeComGroupGovernanceWorkbench } from "./WeComGroupGovernanceWorkbench";
import {
  formatSettingsApiDate,
  isSettingsApiTab,
  parseSettingsApiTab,
  type OpenApiConsoleData,
  type OpenApiEndpointRow,
  type OpenApiLogRow,
  type OpenApiRegistrationRow,
  type SettingsApiTab,
} from "./settings-api-client-model";

export default function SettingsApiClient({
  canCreateClient = false,
  canRotateSecret = false,
  canGrantScopes = false,
  canAccessNotifications = false,
}: {
  canCreateClient?: boolean;
  canRotateSecret?: boolean;
  canGrantScopes?: boolean;
  canAccessNotifications?: boolean;
}) {
  const [activeTab, setActiveTab] = useState<SettingsApiTab>("catalog");
  const [data, setData] = useState<OpenApiConsoleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [newClientName, setNewClientName] = useState("");
  const [newClientDescription, setNewClientDescription] = useState("");
  const [createClientOpen, setCreateClientOpen] = useState(false);
  const [freshSecret, setFreshSecret] = useState<string | null>(null);
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
  const [draftScopeKeys, setDraftScopeKeys] = useState<string[]>([]);
  const [mobileClientDetailActive, setMobileClientDetailActive] = useState(false);

  const notificationPublishing = useNotificationPublishingWorkbench({
    enabled: activeTab === "notifications" && canAccessNotifications,
  });
  const groupGovernance = useWeComGroupGovernanceWorkbench({
    enabled: activeTab === "groups" && canAccessNotifications,
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const next = await requestJson<OpenApiConsoleData>("/api/settings/api/open/overview");
      setData(next);
      setSelectedClientId((current) => current ?? next.clients[0]?.id ?? null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    function syncFromLocation() {
      const query = new URLSearchParams(window.location.search);
      setActiveTab(parseSettingsApiTab(query.get("tab"), canAccessNotifications));
    }
    syncFromLocation();
    window.addEventListener("popstate", syncFromLocation);
    return () => window.removeEventListener("popstate", syncFromLocation);
  }, [canAccessNotifications]);

  function switchTab(next: SettingsApiTab) {
    const resolved = parseSettingsApiTab(next, canAccessNotifications);
    setActiveTab(resolved);
    setCreateClientOpen(false);
    const url = new URL(window.location.href);
    if (resolved === "catalog") url.searchParams.delete("tab");
    else url.searchParams.set("tab", resolved);
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }

  const visibleScopes = useMemo(() => data?.scopes ?? [], [data?.scopes]);
  const visibleScopeKeys = useMemo(() => new Set(visibleScopes.map((scope) => scope.key)), [visibleScopes]);
  const selectedClient = data?.clients.find((client) => client.id === selectedClientId) ?? null;

  useEffect(() => {
    setDraftScopeKeys(selectedClient?.scopeKeys.filter((key) => visibleScopeKeys.has(key)) ?? []);
  }, [selectedClient, visibleScopeKeys]);

  async function createClient() {
    if (!newClientName.trim()) throw new Error("请输入 Client 名称");
    setBusy("create");
    setMessage(null);
    try {
      const result = await postJson<{ secret: string }>("/api/settings/api/open/clients", {
        name: newClientName.trim(),
        description: newClientDescription.trim(),
      });
      setFreshSecret(result.secret);
      setNewClientName("");
      setNewClientDescription("");
      setCreateClientOpen(false);
      setMessage("Client 已创建");
      await loadData();
      return { outcome: "saved" as const, message: "Client 已创建" };
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "创建失败");
      throw error;
    } finally {
      setBusy(null);
    }
  }

  async function rotateSecret(clientId: number) {
    setBusy(`rotate-${clientId}`);
    setMessage(null);
    try {
      const result = await postJson<{ secret: string }>(`/api/settings/api/open/clients/${clientId}/secret`, {});
      setFreshSecret(result.secret);
      setMessage("密钥已轮换");
      await loadData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "轮换失败");
    } finally {
      setBusy(null);
    }
  }

  async function saveScopes() {
    if (!selectedClient) return;
    setBusy(`scopes-${selectedClient.id}`);
    setMessage(null);
    try {
      await putJson(`/api/settings/api/open/clients/${selectedClient.id}/scopes`, { scopeKeys: draftScopeKeys });
      setMessage("Scope 已保存");
      await loadData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存失败");
    } finally {
      setBusy(null);
    }
  }

  const registrationColumns: DataSurfaceColumnSpec<OpenApiRegistrationRow>[] = [
    {
      key: "label",
      label: "开放能力",
      cell: (row) => ({
        kind: "stack",
        items: [
          { kind: "text", value: row.label, emphasis: "medium" },
          { kind: "text", value: row.description, tone: "muted" },
        ],
      }),
    },
    {
      key: "resource",
      label: "资源",
      cell: (row) => row.resources.map((resource) => resource.key).join(", "),
    },
    {
      key: "scope",
      label: "Scope",
      cell: (row) => row.scopes.map((scope) => scope.key).join(", "),
    },
    {
      key: "runtime",
      label: "运行归属",
      cell: (row) => row.runtimeParentResourceKey,
    },
    {
      key: "console",
      label: "配置",
      cell: (row) => row.consoleTab === "notifications"
        ? canAccessNotifications
          ? {
              kind: "action",
              action: {
                key: `open-${row.consoleTab}`,
                label: "进入通知发布",
                onClick: () => switchTab("notifications"),
              },
            }
          : { kind: "badge", label: "无权限", tone: "slate" }
        : { kind: "badge", label: "当前目录", tone: "slate" },
    },
  ];

  const endpointColumns: DataSurfaceColumnSpec<OpenApiEndpointRow>[] = [
    {
      key: "method",
      label: "Method",
      cell: (row) => ({ kind: "badge", label: row.method, tone: "sky", font: "mono", emphasis: "strong" }),
    },
    { key: "path", label: "Path", cell: (row) => ({ kind: "text", value: row.pathPrefix, font: "mono" }) },
    { key: "scope", label: "Scope", cell: (row) => row.scopeKey },
  ];

  const logColumns: DataSurfaceColumnSpec<OpenApiLogRow>[] = [
    { key: "createdAt", label: "时间", cell: (row) => formatSettingsApiDate(row.createdAt, "-") },
    { key: "client", label: "Client", cell: (row) => row.clientName || "-" },
    {
      key: "endpoint",
      label: "Endpoint",
      cell: (row) => ({
        kind: "group",
        items: [
          { kind: "badge", label: row.method, tone: "sky" },
          { kind: "text", value: row.path, font: "mono" },
        ],
      }),
    },
    { key: "status", label: "状态", cell: (row) => ({ kind: "text", value: row.status }) },
    { key: "duration", label: "耗时", cell: (row) => `${row.durationMs} ms` },
    { key: "error", label: "错误", cell: (row) => row.errorCode || "-" },
  ];

  const scopeFields: FormSurfaceItemSpec[] = visibleScopes.length
    ? visibleScopes.map((scope) => ({
        key: scope.key,
        label: scope.label,
        hint: `${scope.key} · ${scope.action}`,
        spec: {
          valueType: "boolean",
          control: "boolean",
          presentation: "checkbox",
          state: !selectedClient || !canGrantScopes ? "disabled" : "normal",
        },
        value: draftScopeKeys.includes(scope.key),
        onChange: (checked) => {
          setDraftScopeKeys((current) => checked
            ? [...new Set([...current, scope.key])]
            : current.filter((key) => key !== scope.key));
        },
      }))
    : [{ kind: "note", key: "empty-scopes", content: "暂无可授权 Scope" }];

  const clientList = createListSection("client-list", {
    presentation: "cards",
    density: "compact",
    empty: { content: loading ? "正在加载 Client…" : "暂无 Client", compact: true },
    items: (data?.clients ?? []).map((client) => ({
      key: String(client.id),
      title: client.name,
      description: client.description || `${client.scopeKeys.length} 个 Scope`,
      badges: [{
        key: "status",
        label: client.status === "active" ? "启用" : client.status,
        tone: client.status === "active" ? "success" : "muted",
      }],
      tone: client.id === selectedClientId ? "success" : "default",
      onClick: () => {
        setSelectedClientId(client.id);
        setMobileClientDetailActive(true);
      },
    })),
  });

  const clientDetail = selectedClient
    ? createPanelSection("client-detail", {
        title: selectedClient.name,
        actions: [
          { key: "refresh", label: "刷新", icon: "refresh", disabled: loading, onClick: () => void loadData() },
          ...(canRotateSecret ? [{
            key: "rotate-secret",
            label: "轮换密钥",
            icon: "reset" as const,
            disabled: busy === `rotate-${selectedClient.id}`,
            onClick: () => void rotateSecret(selectedClient.id),
          }] : []),
        ],
        sections: [
          createFieldsSection("client-summary", [
            { kind: "readonly", key: "status", label: "状态", value: selectedClient.status === "active" ? "启用" : selectedClient.status },
            { kind: "readonly", key: "last-used", label: "最近调用", value: formatSettingsApiDate(selectedClient.lastUsedAt) },
            { kind: "readonly", key: "expires", label: "到期时间", value: formatSettingsApiDate(selectedClient.expiresAt, "长期有效") },
            { kind: "readonly", key: "updated", label: "最近更新", value: formatSettingsApiDate(selectedClient.updatedAt, "-") },
            { kind: "note", key: "description", content: selectedClient.description || "未填写用途说明" },
          ], { layout: { columns: 2, density: "compact" } }),
          createFieldsSection("scope-form", scopeFields, {
            header: { title: "Scope 授权" },
            layout: { columns: 2, density: "compact" },
            actions: canGrantScopes ? [{
              key: "save-scopes",
              action: "grant",
              label: "保存授权",
              onClick: () => void saveScopes(),
              disabled: busy === `scopes-${selectedClient.id}`,
            }] : [],
          }),
        ],
      })
    : createMessageSection("client-empty", { tone: "muted", content: "选择一个 Client 查看详情与 Scope 授权。" });

  const catalogSections: BodySurfaceSectionSpec[] = [
    createSectionSection("open-api-catalog", {
      title: "开放能力目录",
      sections: [
        createPageDataSection("registration-table", {
          kind: "table",
          rows: data?.registrations ?? [],
          columns: registrationColumns,
          visibleColumns: registrationColumns.map((column) => column.key),
          loading,
          emptyText: "暂无开放能力",
          rowKey: (row) => row.key,
          presentation: { density: "compact" },
        }),
        createPageDataSection("endpoint-table", {
          kind: "table",
          rows: data?.endpoints ?? [],
          columns: endpointColumns,
          visibleColumns: endpointColumns.map((column) => column.key),
          emptyText: "暂无 Endpoint",
          rowKey: (row) => row.key,
          presentation: { density: "compact" },
        }),
      ],
    }),
  ];

  const clientSections: BodySurfaceSectionSpec[] = [
    ...(freshSecret ? [createSectionSection("fresh-secret", {
      title: "新密钥（仅展示一次）",
      actions: [{ key: "hide-secret", label: "隐藏", icon: "eye-off", onClick: () => setFreshSecret(null) }],
      sections: [createFieldsSection("fresh-secret-value", [{
        kind: "readonly",
        key: "secret",
        label: "Secret",
        value: freshSecret,
        variant: "plain",
        fontRole: "mono",
      }], { layout: { columns: 1, density: "compact" } })],
    })] : []),
    {
      key: "client-workspace",
      body: createMasterDetailBody({
        master: { label: "Client", body: createPageBody([clientList]), presentation: "compact" },
        detail: createPageBody([clientDetail]),
        desktop: { ratio: [3, 7] },
        mobile: {
          detailActive: mobileClientDetailActive,
          onNavigateToList: () => setMobileClientDetailActive(false),
        },
      }),
    },
  ];

  const logSections: BodySurfaceSectionSpec[] = [
    createSectionSection("logs", {
      title: "调用日志",
      actions: [{ key: "refresh", label: "刷新", icon: "refresh", onClick: () => void loadData(), disabled: loading }],
      sections: [createPageDataSection("log-table", {
        kind: "table",
        rows: data?.logs ?? [],
        columns: logColumns,
        visibleColumns: logColumns.map((column) => column.key),
        loading,
        emptyText: "暂无调用日志",
        rowKey: (row) => row.id,
        presentation: { density: "compact" },
      })],
    }),
  ];

  const navigation = createPageTabBar({
    items: [
      { key: "catalog", label: "能力目录" },
      { key: "clients", label: "Client 管理" },
      ...(canAccessNotifications ? [
        { key: "groups", label: "企业微信群发" },
        { key: "notifications", label: "通知定义" },
      ] : []),
      { key: "logs", label: "调用日志" },
    ],
    active: activeTab,
    onChange: (key) => {
      if (isSettingsApiTab(key)) switchTab(key);
    },
    variant: "large",
    ariaLabel: "API 接入",
  });

  const clientCreate: PageSurfaceCreateSpec | undefined = activeTab === "clients" && canCreateClient
    ? {
        id: "open-api-client-create",
        presentation: "block",
        title: "新增 Client",
        open: createClientOpen,
        canCreate: true,
        disabled: busy !== null,
        content: {
          kind: "form",
          form: {
            layout: { columns: 1, density: "compact" },
            items: [
              {
                key: "name",
                label: "名称",
                required: true,
                spec: { valueType: "string", control: "text" },
                value: newClientName,
                onChange: (value: unknown) => setNewClientName(String(value ?? "")),
                placeholder: "Client 名称",
                maxLength: 80,
              },
              {
                key: "description",
                label: "用途说明",
                spec: { valueType: "string", control: "text" },
                value: newClientDescription,
                onChange: (value: unknown) => setNewClientDescription(String(value ?? "")),
                placeholder: "说明调用方与使用场景",
                maxLength: 240,
              },
            ],
          },
        },
        submission: { action: "save", disabled: !newClientName.trim(), execute: createClient },
        feedback: { saved: "Client 已创建", error: "创建 Client 失败" },
        onOpenChange: setCreateClientOpen,
        onCancel: () => {
          setCreateClientOpen(false);
          setNewClientName("");
          setNewClientDescription("");
        },
      }
    : undefined;

  const overviewBody = (sections: BodySurfaceSectionSpec[]): BodySurfaceProps => createPageBody([
    ...(message ? [createMessageSection("message", { tone: "default", content: message })] : []),
    ...sections,
  ]);
  const activeBody: BodySurfaceProps = activeTab === "clients"
    ? overviewBody(clientSections)
    : activeTab === "groups"
      ? groupGovernance.body ?? createPageBody([])
      : activeTab === "notifications"
        ? notificationPublishing.body ?? createPageBody([])
        : activeTab === "logs"
          ? overviewBody(logSections)
          : overviewBody(catalogSections);
  const activeCreate = activeTab === "groups"
    ? groupGovernance.create
    : activeTab === "notifications"
      ? notificationPublishing.create
      : clientCreate;

  return (
    <PageSurface
      kind="standard"
      tabbar={navigation}
      create={activeCreate}
      body={activeBody}
    />
  );
}
