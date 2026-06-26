"use client";

import { workspacePath } from "@workspace/core/routing";
import { CommandButton, DataTable, DatabasePageFrame, FormField, InputControl, SectionCard, type DataTableColumn } from "@workspace/core/ui";
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
type OpenApiScopeRow = {
  id: number;
  key: string;
  label: string;
  action: string;
  registrationKey: string;
};
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
function StatusPill({
  value
}: {
  value: string;
}) {
  const active = value === "active";
  return <span className={`rounded-full px-2 py-0.5 text-xs ${active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
      {active ? "启用" : value}
    </span>;
}
function MethodPill({
  value
}: {
  value: string;
}) {
  return <span className="rounded bg-cyan-50 px-2 py-0.5 font-mono text-xs font-semibold text-cyan-700">
      {value}
    </span>;
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
  const registrationColumns: DataTableColumn<OpenApiRegistrationRow>[] = [{
    key: "label",
    label: "能力",
    render: row => <div className="font-medium text-slate-900">{row.label}<div className="text-xs font-normal text-slate-500">{row.key}</div></div>
  }, {
    key: "resource",
    label: "开放资源",
    render: row => row.resources.map(resource => resource.key).join(", ")
  }, {
    key: "scope",
    label: "Scope",
    render: row => row.scopes.map(scope => scope.key).join(", ")
  }, {
    key: "runtime",
    label: "运行归属",
    render: row => row.runtimeParentResourceKey
  }, {
    key: "console",
    label: "页面",
    render: row => <a className="text-cyan-700 hover:underline" href={workspacePath(row.consoleHref)}>进入</a>
  }];
  const endpointColumns: DataTableColumn<OpenApiEndpointRow>[] = [{
    key: "method",
    label: "Method",
    render: row => <MethodPill value={row.method} />
  }, {
    key: "path",
    label: "Path",
    render: row => <code className="text-xs text-slate-700">{row.pathPrefix}</code>
  }, {
    key: "scope",
    label: "Scope",
    render: row => row.scopeKey
  }];
  const clientColumns: DataTableColumn<OpenApiClientRow>[] = [{
    key: "name",
    label: "Client",
    render: row => <div className="font-medium text-slate-900">{row.name}<div className="text-xs font-normal text-slate-500">{row.description || "无说明"}</div></div>
  }, {
    key: "status",
    label: "状态",
    render: row => <StatusPill value={row.status} />
  }, {
    key: "scopes",
    label: "Scope",
    render: row => row.scopeKeys.length ? row.scopeKeys.join(", ") : "未授权"
  }, {
    key: "lastUsedAt",
    label: "最近调用",
    render: row => formatDate(row.lastUsedAt)
  }, {
    key: "actions",
    label: "操作",
    render: row => <CommandButton disabled={busy === `rotate-${row.id}`} onClick={() => rotateSecret(row.id)}>轮换密钥</CommandButton>
  }];
  const logColumns: DataTableColumn<OpenApiLogRow>[] = [{
    key: "createdAt",
    label: "时间",
    render: row => formatDate(row.createdAt, "-")
  }, {
    key: "client",
    label: "Client",
    render: row => row.clientName || "-"
  }, {
    key: "endpoint",
    label: "Endpoint",
    render: row => <span><MethodPill value={row.method} /> <code className="ml-2 text-xs">{row.path}</code></span>
  }, {
    key: "status",
    label: "状态",
    render: row => <span className={row.status < 400 ? "text-emerald-700" : "text-red-600"}>{row.status}</span>
  }, {
    key: "duration",
    label: "耗时",
    render: row => `${row.durationMs} ms`
  }, {
    key: "error",
    label: "错误",
    render: row => row.errorCode || "-"
  }];
  return <DatabasePageFrame contentClassName="py-8">
      {message && <div className="rounded-lg border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-800">{message}</div>}
      {freshSecret && <SectionCard title="新密钥" subtitle="只在本次操作后显示。" actions={<CommandButton onClick={() => setFreshSecret(null)}>隐藏</CommandButton>}>
          <code className="block overflow-x-auto rounded-md bg-slate-950 px-4 py-3 text-xs text-white">{freshSecret}</code>
        </SectionCard>}

      <SectionCard title="开放能力" subtitle="Registry 中已注册的页面、资源、Scope 和 endpoint。">
        <DataTable rows={registrations} columns={registrationColumns} visibleColumns={registrationColumns.map(column => column.key)} loading={loading} emptyText="暂无开放能力" rowKey={row => row.key} density="compact" />
        <div className="mt-4">
          <DataTable rows={endpoints} columns={endpointColumns} visibleColumns={endpointColumns.map(column => column.key)} emptyText="暂无 endpoint" rowKey={row => row.key} density="compact" />
        </div>
      </SectionCard>

      <SectionCard title="Client" actions={<CommandButton onClick={() => loadData()} disabled={loading}>刷新</CommandButton>}>
        <div className="mb-4 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <FormField label="名称" required>
            <InputControl spec={{ valueType: "string", editor: "input" }} value={newClientName} onChange={(value) => setNewClientName(String(value ?? ""))} placeholder="Client 名称" maxLength={80} />
          </FormField>
          <FormField label="说明">
            <InputControl spec={{ valueType: "string", editor: "input" }} value={newClientDescription} onChange={(value) => setNewClientDescription(String(value ?? ""))} placeholder="用途说明" maxLength={240} />
          </FormField>
          <div className="flex items-end">
            <CommandButton variant="primary" onClick={createClient} disabled={busy === "create" || !newClientName.trim()}>创建</CommandButton>
          </div>
        </div>
        <DataTable rows={data?.clients ?? []} columns={clientColumns} visibleColumns={clientColumns.map(column => column.key)} loading={loading} emptyText="暂无 Client" rowKey={row => row.id} density="compact" onRowClick={row => setSelectedClientId(row.id)} rowClassName={row => row.id === selectedClientId ? "bg-emerald-50/70" : ""} />
      </SectionCard>

      <SectionCard title="Scope 授权" subtitle={selectedClient ? selectedClient.name : "先选择一个 Client。"} actions={<CommandButton onClick={saveScopes} disabled={!selectedClient || busy === `scopes-${selectedClient?.id}`}>保存</CommandButton>}>
        <div className="flex flex-wrap gap-2">
          {visibleScopes.map(scope => <label key={scope.key} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600">
              <InputControl spec={{ valueType: "boolean", editor: "checkbox", state: !selectedClient ? "disabled" : "normal" }} value={draftScopeKeys.includes(scope.key)} onChange={checked => {
            setDraftScopeKeys(current => checked ? [...new Set([...current, scope.key])] : current.filter(key => key !== scope.key));
          }} />
              <span>{scope.key}</span>
            </label>)}
          {visibleScopes.length === 0 && <span className="text-sm text-slate-500">暂无 Scope</span>}
        </div>
      </SectionCard>

      <SectionCard title="调用日志">
        <DataTable rows={logs} columns={logColumns} visibleColumns={logColumns.map(column => column.key)} loading={loading} emptyText="暂无调用日志" rowKey={row => row.id} density="compact" />
      </SectionCard>
    </DatabasePageFrame>;
}
