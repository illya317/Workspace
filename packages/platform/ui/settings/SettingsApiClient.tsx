"use client";

import { workspacePath } from "@workspace/core/routing";
import { PageSurface, type DataSurfaceColumnSpec, type FormSurfaceItemSpec, type PageSurfaceBlockSpec } from "@workspace/core/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import { postJson, putJson, requestJson } from "../api-client";
type OpenApiRegistrationRow = {
  key: string;
  label: string;
  description: string;
  consoleHref: string;
  runtimeParentResourceKey: string;
  resources: Array<{
    key: string;
    label: string;
  }>;
  scopes: Array<{
    key: string;
    label: string;
    action: string;
  }>;
  endpoints: Array<{
    key: string;
    method: string;
    pathPrefix: string;
    scopeKey: string;
  }>;
};
type OpenApiEndpointRow = {
  key: string;
  label: string;
  method: string;
  pathPrefix: string;
  scopeKey: string;
  registrationKey: string;
};
type OpenApiScopeRow = { id: number; key: string; label: string; action: string; registrationKey: string };
type OpenApiClientRow = {
  id: number;
  name: string;
  description: string | null;
  status: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
  scopeKeys: string[];
};
type OpenApiLogRow = {
  id: number;
  clientName: string | null;
  endpointKey: string;
  scopeKey: string;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  errorCode: string | null;
  createdAt: string;
};
type OpenApiConsoleData = {
  registrations: OpenApiRegistrationRow[];
  endpoints: OpenApiEndpointRow[];
  scopes: OpenApiScopeRow[];
  clients: OpenApiClientRow[];
  logs: OpenApiLogRow[];
};
function formatDate(value: string | null | undefined, empty = "未使用") {
  if (!value) return empty;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    hour12: false
  });
}
export default function SettingsApiClient({
  focusRegistrationKey
}: {
  focusRegistrationKey?: string;
}) {
  const [data, setData] = useState<OpenApiConsoleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [newClientName, setNewClientName] = useState("");
  const [newClientDescription, setNewClientDescription] = useState("");
  const [freshSecret, setFreshSecret] = useState<string | null>(null);
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
  const [draftScopeKeys, setDraftScopeKeys] = useState<string[]>([]);
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const next = await requestJson<OpenApiConsoleData>("/api/settings/api/open/overview");
      setData(next);
      setSelectedClientId(current => current ?? next.clients[0]?.id ?? null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void loadData();
  }, [loadData]);
  const registrations = useMemo(() => {
    if (!data) return [];
    if (!focusRegistrationKey) return data.registrations;
    return data.registrations.filter(registration => registration.key === focusRegistrationKey);
  }, [data, focusRegistrationKey]);
  const registrationKeys = useMemo(() => new Set(registrations.map(registration => registration.key)), [registrations]);
  const visibleScopes = useMemo(() => {
    if (!data) return [];
    return data.scopes.filter(scope => registrationKeys.size === 0 || registrationKeys.has(scope.registrationKey));
  }, [data, registrationKeys]);
  const visibleScopeKeys = useMemo(() => new Set(visibleScopes.map(scope => scope.key)), [visibleScopes]);
  const endpoints = useMemo(() => {
    if (!data) return [];
    return data.endpoints.filter(endpoint => registrationKeys.size === 0 || registrationKeys.has(endpoint.registrationKey));
  }, [data, registrationKeys]);
  const logs = useMemo(() => {
    if (!data) return [];
    return data.logs.filter(log => visibleScopeKeys.size === 0 || visibleScopeKeys.has(log.scopeKey));
  }, [data, visibleScopeKeys]);
  const selectedClient = data?.clients.find(client => client.id === selectedClientId) ?? null;
  useEffect(() => {
    setDraftScopeKeys(selectedClient?.scopeKeys.filter(key => visibleScopeKeys.has(key)) ?? []);
  }, [selectedClient, visibleScopeKeys]);
  async function createClient() {
    if (!newClientName.trim()) return;
    setBusy("create");
    setMessage(null);
    try {
      const result = await postJson<{
        secret: string;
      }>("/api/settings/api/open/clients", {
        name: newClientName,
        description: newClientDescription
      });
      setFreshSecret(result.secret);
      setNewClientName("");
      setNewClientDescription("");
      setMessage("Client 已创建");
      await loadData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "创建失败");
    } finally {
      setBusy(null);
    }
  }
  async function rotateSecret(clientId: number) {
    setBusy(`rotate-${clientId}`);
    setMessage(null);
    try {
      const result = await postJson<{
        secret: string;
      }>(`/api/settings/api/open/clients/${clientId}/secret`, {});
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
      await putJson(`/api/settings/api/open/clients/${selectedClient.id}/scopes`, {
        scopeKeys: draftScopeKeys
      });
      setMessage("Scope 已保存");
      await loadData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存失败");
    } finally {
      setBusy(null);
    }
  }
  const registrationColumns: DataSurfaceColumnSpec<OpenApiRegistrationRow>[] = [{
    key: "label",
    label: "能力",
    cell: row => <div className="font-medium text-slate-900">{row.label}<div className="text-xs font-normal text-slate-500">{row.key}</div></div>
  }, {
    key: "resource",
    label: "开放资源",
    cell: row => row.resources.map(resource => resource.key).join(", ")
  }, {
    key: "scope",
    label: "Scope",
    cell: row => row.scopes.map(scope => scope.key).join(", ")
  }, {
    key: "runtime",
    label: "运行归属",
    cell: row => row.runtimeParentResourceKey
  }, {
    key: "console",
    label: "页面",
    cell: row => <a className="text-cyan-700 hover:underline" href={workspacePath(row.consoleHref)}>进入</a>
  }];
  const endpointColumns: DataSurfaceColumnSpec<OpenApiEndpointRow>[] = [{
    key: "method",
    label: "Method",
    cell: row => ({ kind: "badge", label: row.method, tone: "sky", className: "font-mono font-semibold" })
  }, {
    key: "path",
    label: "Path",
    cell: row => <code className="text-xs text-slate-700">{row.pathPrefix}</code>
  }, {
    key: "scope",
    label: "Scope",
    cell: row => row.scopeKey
  }];
  const clientColumns: DataSurfaceColumnSpec<OpenApiClientRow>[] = [{
    key: "name",
    label: "Client",
    cell: row => <div className="font-medium text-slate-900">{row.name}<div className="text-xs font-normal text-slate-500">{row.description || "无说明"}</div></div>
  }, {
    key: "status",
    label: "状态",
    cell: row => ({ kind: "badge", label: row.status === "active" ? "启用" : row.status, tone: row.status === "active" ? "green" : "slate" })
  }, {
    key: "scopes",
    label: "Scope",
    cell: row => row.scopeKeys.length ? row.scopeKeys.join(", ") : "未授权"
  }, {
    key: "lastUsedAt",
    label: "最近调用",
    cell: row => formatDate(row.lastUsedAt)
  }, {
    key: "actions",
    label: "操作",
    cell: row => ({
      kind: "action",
      action: {
        key: `rotate-${row.id}`,
        label: "轮换密钥",
        disabled: busy === `rotate-${row.id}`,
        onClick: () => rotateSecret(row.id),
      },
    })
  }];
  const logColumns: DataSurfaceColumnSpec<OpenApiLogRow>[] = [{
    key: "createdAt",
    label: "时间",
    cell: row => formatDate(row.createdAt, "-")
  }, {
    key: "client",
    label: "Client",
    cell: row => row.clientName || "-"
  }, {
    key: "endpoint",
    label: "Endpoint",
    cell: row => <span><span className="inline-block rounded bg-sky-100 px-1.5 py-0.5 font-mono text-xs font-medium text-sky-700">{row.method}</span> <code className="ml-2 text-xs">{row.path}</code></span>
  }, {
    key: "status",
    label: "状态",
    cell: row => ({ kind: "text", value: row.status, className: row.status < 400 ? "text-emerald-700" : "text-red-600" })
  }, {
    key: "duration",
    label: "耗时",
    cell: row => `${row.durationMs} ms`
  }, {
    key: "error",
    label: "错误",
    cell: row => row.errorCode || "-"
  }];
  const scopeFields: FormSurfaceItemSpec[] = visibleScopes.length
    ? visibleScopes.map((scope) => ({
        key: scope.key,
        label: scope.key,
        spec: {
          valueType: "boolean",
          editor: "checkbox",
          state: !selectedClient ? "disabled" : "normal",
        },
        value: draftScopeKeys.includes(scope.key),
        onChange: (checked) => {
          setDraftScopeKeys((current) => checked ? [...new Set([...current, scope.key])] : current.filter((key) => key !== scope.key));
        },
      }))
    : [{ kind: "note" as const, key: "empty-scopes", content: "暂无 Scope" }];
  const blocks: PageSurfaceBlockSpec[] = [
    ...(message ? [{
      kind: "message" as const,
      key: "message",
      tone: "default" as const,
      content: message,
    }] : []),
    ...(freshSecret ? [{
      kind: "section" as const,
      key: "fresh-secret",
      title: "新密钥",
      subtitle: "只在本次操作后显示。",
      actions: [{ key: "hide-secret", label: "隐藏", onClick: () => setFreshSecret(null) }],
      blocks: [{
        kind: "data" as const,
        key: "secret",
        surface: { kind: "raw" as const, value: freshSecret, rawClassName: "bg-slate-950 text-white" },
      }],
    }] : []),
    {
      kind: "section",
      key: "registrations",
      title: "开放能力",
      subtitle: "Registry 中已注册的页面、资源、Scope 和 endpoint。",
      blocks: [
        {
          kind: "data",
          key: "registration-table",
          surface: { kind: "table", rows: registrations, columns: registrationColumns, visibleColumns: registrationColumns.map((column) => column.key), loading, emptyText: "暂无开放能力", rowKey: (row) => row.key, density: "compact" },
        },
        {
          kind: "data",
          key: "endpoint-table",
          surface: { kind: "table", rows: endpoints, columns: endpointColumns, visibleColumns: endpointColumns.map((column) => column.key), emptyText: "暂无 endpoint", rowKey: (row) => row.key, density: "compact" },
        },
      ],
    },
    {
      kind: "section",
      key: "clients",
      title: "Client",
      actions: [{ key: "refresh", label: "刷新", onClick: () => loadData(), disabled: loading }],
      blocks: [
        {
          kind: "form",
          key: "client-form",
          surface: {
            kind: "inline",
            fields: [
              {
                key: "name",
                label: "名称",
                required: true,
                spec: { valueType: "string", editor: "input" },
                value: newClientName,
                onChange: (value) => setNewClientName(String(value ?? "")),
                placeholder: "Client 名称",
                maxLength: 80,
              },
              {
                key: "description",
                label: "说明",
                spec: { valueType: "string", editor: "input" },
                value: newClientDescription,
                onChange: (value) => setNewClientDescription(String(value ?? "")),
                placeholder: "用途说明",
                maxLength: 240,
              },
            ],
            actions: [{ key: "create", label: "创建", variant: "primary", onClick: createClient, disabled: busy === "create" || !newClientName.trim() }],
          },
        },
        {
          kind: "data",
          key: "client-table",
          surface: {
            kind: "table",
            rows: data?.clients ?? [],
            columns: clientColumns,
            visibleColumns: clientColumns.map((column) => column.key),
            loading,
            emptyText: "暂无 Client",
            rowKey: (row) => row.id,
            density: "compact",
            onRowClick: (row) => setSelectedClientId(row.id),
            rowClassName: (row) => row.id === selectedClientId ? "bg-emerald-50/70" : "",
          },
        },
      ],
    },
    {
      kind: "section",
      key: "scopes",
      title: "Scope 授权",
      subtitle: selectedClient ? selectedClient.name : "先选择一个 Client。",
      actions: [{ key: "save-scopes", label: "保存", onClick: saveScopes, disabled: !selectedClient || busy === `scopes-${selectedClient?.id}` }],
      blocks: [{ kind: "form", key: "scope-form", surface: { kind: "fields", fields: scopeFields, columns: 3 } }],
    },
    {
      kind: "section",
      key: "logs",
      title: "调用日志",
      blocks: [{
        kind: "data",
        key: "log-table",
        surface: { kind: "table", rows: logs, columns: logColumns, visibleColumns: logColumns.map((column) => column.key), loading, emptyText: "暂无调用日志", rowKey: (row) => row.id, density: "compact" },
      }],
    },
  ];
  return <PageSurface kind="settings" contentClassName="py-8" blocks={blocks} />;
}
