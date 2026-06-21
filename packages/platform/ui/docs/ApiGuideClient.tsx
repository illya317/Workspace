"use client";

import { workspacePath } from "@workspace/core/routing";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ActionButton, CodeBlock, ConfirmModal, DataTable, SectionCard } from "@workspace/core/ui";
import type { DataTableColumn } from "@workspace/core/ui";
import type { SessionUser } from "@workspace/platform/types";
import { DatabasePageFrame } from "@workspace/core/ui";

function MyApiKeyPanel({ apiKey, onApiKeyChange }: { apiKey: string | null; onApiKeyChange: (k: string | null) => void }) {
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{ show: boolean; onConfirm: (() => void) | null }>({ show: false, onConfirm: null });

  function openConfirm(onConfirm: () => void) { setConfirmModal({ show: true, onConfirm }); }
  function closeConfirm() { setConfirmModal({ show: false, onConfirm: null }); }

  async function applyApiKey() {
    const doApply = async () => {
      setLoading(true);
      const res = await fetch(workspacePath("/api/me/api-key"), { method: "POST" });
      if (res.ok) { const data = await res.json(); onApiKeyChange(data.apiKey || null); }
      setLoading(false);
      closeConfirm();
    };
    if (apiKey) { openConfirm(doApply); } else { await doApply(); }
  }

  async function copyKey() {
    if (!apiKey) return;
    try { await navigator.clipboard.writeText(apiKey); } catch {
      const el = document.createElement("textarea"); el.value = apiKey; el.style.cssText = "position:fixed;opacity:0"; document.body.appendChild(el); el.select(); document.execCommand("copy"); document.body.removeChild(el);
    }
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  }

  return (
    <SectionCard title="我的 API Key" subtitle="每人只有一个 Key，重新申请会覆盖旧的。" className="mb-6">
      {apiKey ? (
        <div className="flex items-center gap-3">
          <code className="rounded-md bg-gray-100 px-3 py-2 font-mono text-sm text-gray-800">{apiKey}</code>
          <ActionButton onClick={copyKey}>{copied ? "已复制" : "复制"}</ActionButton>
          <ActionButton onClick={applyApiKey} disabled={loading} variant="primary">{loading ? "申请中..." : "重新申请"}</ActionButton>
        </div>
      ) : (
        <ActionButton onClick={applyApiKey} disabled={loading} variant="primary">{loading ? "申请中..." : "申请 API Key"}</ActionButton>
      )}
      <ConfirmModal open={confirmModal.show} title="确认覆盖" message="申请新的 API Key 将覆盖旧的 Key，确定继续？" onConfirm={() => confirmModal.onConfirm?.()} onCancel={closeConfirm} confirmDanger={false} />
    </SectionCard>
  );
}

type EndpointRow = {
  method: string;
  path: string;
  note: string;
  params?: string;
  perm?: string;
};

const ENDPOINTS: EndpointRow[] = [
  { method: "GET", path: "/api/modules/work/tasks", note: "查看工作清单", params: "targetType, targetId, ?category, ?includeArchived" },
  { method: "POST", path: "/api/modules/work/tasks", note: "创建工作项", params: "category, content, importance, urgency" },
  { method: "PUT", path: "/api/modules/work/tasks/:id", note: "更新工作项", params: "category, content, ..." },
  { method: "DELETE", path: "/api/modules/work/tasks/:id", note: "删除工作项" },
  { method: "GET", path: "/api/modules/work/reports", note: "查看汇报", params: "date, targetType, targetIds" },
  { method: "POST", path: "/api/modules/work/reports", note: "提交汇报", params: "taskName, date, targetType, targetId, items" },
  { method: "PUT", path: "/api/modules/work/reports/:id", note: "更新汇报", params: "taskName, notes, items" },
  { method: "GET", path: "/api/modules/hr/employees", note: "员工列表", params: "?keyword, ?company", perm: "people.roster.access" },
  { method: "PUT", path: "/api/modules/hr/employees/:id", note: "更新员工单字段", params: "{field, value}", perm: "people.write" },
  { method: "DELETE", path: "/api/modules/hr/employees/:id", note: "删除员工", perm: "people.delete" },
  { method: "GET", path: "/api/modules/hr/employments", note: "雇佣关系列表", perm: "people.roster.access" },
  { method: "POST", path: "/api/modules/hr/employments", note: "新建雇佣关系", perm: "people.write" },
  { method: "PUT", path: "/api/modules/hr/employments/:id", note: "更新雇佣关系", perm: "people.write" },
  { method: "DELETE", path: "/api/modules/hr/employments/:id", note: "删除雇佣关系", perm: "people.delete" },
  { method: "GET", path: "/api/modules/hr/departments", note: "部门列表", params: "?keyword", perm: "people.roster.access" },
  { method: "POST", path: "/api/modules/hr/departments", note: "新建部门", perm: "people.write" },
  { method: "PUT", path: "/api/modules/hr/departments/:id", note: "更新部门", perm: "people.write" },
  { method: "DELETE", path: "/api/modules/hr/departments/:id", note: "删除部门", perm: "people.delete" },
  { method: "GET", path: "/api/modules/hr/positions", note: "岗位列表", params: "?keyword", perm: "people.roster.access" },
  { method: "POST", path: "/api/modules/hr/positions", note: "新建岗位", perm: "people.write" },
  { method: "PUT", path: "/api/modules/hr/positions/:id", note: "更新岗位", perm: "people.write" },
  { method: "DELETE", path: "/api/modules/hr/positions/:id", note: "删除岗位", perm: "people.delete" },
  { method: "GET", path: "/api/modules/hr/edps", note: "EDP 列表", perm: "people.roster.access" },
  { method: "POST", path: "/api/modules/hr/edps", note: "新建 EDP", perm: "people.write" },
  { method: "PUT", path: "/api/modules/hr/edps/:id", note: "更新 EDP", perm: "people.write" },
  { method: "DELETE", path: "/api/modules/hr/edps/:id", note: "删除 EDP", perm: "people.delete" },
  { method: "GET", path: "/api/modules/hr/companies", note: "公司列表", perm: "people.roster.access" },
  { method: "POST", path: "/api/modules/hr/companies", note: "新建公司", perm: "people.write" },
  { method: "PUT", path: "/api/modules/hr/companies/:id", note: "更新公司", perm: "people.write" },
  { method: "DELETE", path: "/api/modules/hr/companies/:id", note: "删除公司", perm: "people.delete" },
  { method: "GET", path: "/api/modules/work/plans", note: "工作计划列表", perm: "work.plan.access" },
  { method: "POST", path: "/api/modules/work/plans", note: "新建工作计划", perm: "work.plan.write" },
  { method: "DELETE", path: "/api/modules/work/plans/:id", note: "删除工作计划", perm: "work.plan.delete" },
  { method: "GET", path: "/api/modules/work/plan-members", note: "计划人员列表", perm: "work.plan.access" },
  { method: "POST", path: "/api/modules/work/plan-members", note: "新建计划人员", perm: "work.plan.write" },
  { method: "DELETE", path: "/api/modules/work/plan-members/:id", note: "删除计划人员", perm: "work.plan.delete" },
  { method: "GET", path: "/api/modules/hr/position-descriptions", note: "岗位说明书列表", params: "?code=xxx 查单个" },
  { method: "GET", path: "/api/system/admin/audit-log", note: "编辑历史", params: "?entityType=xxx", perm: "people.roster.access" },
];

const endpointColumns: DataTableColumn<EndpointRow>[] = [
  {
    key: "method",
    label: "方法",
    required: true,
    render: (ep) => (
      <span className={`inline-block rounded px-1.5 py-0.5 font-mono text-xs font-medium ${
        ep.method === "GET" ? "bg-blue-50 text-blue-700" :
        ep.method === "POST" ? "bg-emerald-50 text-emerald-700" :
        ep.method === "PUT" ? "bg-amber-50 text-amber-700" :
        "bg-red-50 text-red-700"
      }`}>{ep.method}</span>
    ),
  },
  {
    key: "path",
    label: "路径",
    required: true,
    render: (ep) => <span className="font-mono text-xs text-slate-700">{ep.path}</span>,
  },
  {
    key: "note",
    label: "说明",
    required: true,
    render: (ep) => <span className="text-slate-700">{ep.note}</span>,
  },
  {
    key: "params",
    label: "参数",
    required: true,
    render: (ep) => <span className="text-xs text-slate-500">{ep.params || "—"}</span>,
  },
  {
    key: "perm",
    label: "权限",
    required: true,
    render: (ep) => <span className="text-xs text-slate-500">{ep.perm || "登录"}</span>,
  },
];

export default function ApiGuidePage({ hideShell: _hideShell }: { hideShell?: boolean }) {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [apiKey, setApiKey] = useState<string | null>(null);

  useEffect(() => {
    fetch(workspacePath("/api/auth/me")).then(r => r.ok ? r.json() : Promise.reject()).then(d => setUser(d.user)).catch(() => router.push("/login"));
    fetch(workspacePath("/api/me/api-key")).then(r => r.json()).then(d => setApiKey(d.apiKey || null)).catch(() => {});
  }, [router]);

  const BASE = "http://49.235.213.225:3000";
  const [copyAllCopied, setCopyAllCopied] = useState(false);

  function copyForAgent() {
    const lines = [
      `Base URL: ${BASE}`,
      `X-API-Key: ${apiKey || "<your-key>"}`,
      `X-Username: ${user?.username || user?.name || "<your-username>"}`,
      "",
      "## API Endpoints",
    ];
    for (const ep of ENDPOINTS) {
      lines.push(`- ${ep.method} ${ep.path} — ${ep.note}${ep.perm ? " (需 " + ep.perm + ")" : ""}`);
    }
    const text = lines.join("\n");
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
    } else { fallbackCopy(text); }
    setCopyAllCopied(true); setTimeout(() => setCopyAllCopied(false), 2000);
  }

  function fallbackCopy(text: string) {
    const el = document.createElement("textarea"); el.value = text; el.style.cssText = "position:fixed;opacity:0"; document.body.appendChild(el); el.select(); document.execCommand("copy"); document.body.removeChild(el);
  }

  return (
    <DatabasePageFrame contentClassName="py-8">
      <MyApiKeyPanel apiKey={apiKey} onApiKeyChange={setApiKey} />

      <SectionCard
        title="认证方式"
        className="mb-6"
        actions={<ActionButton onClick={copyForAgent} variant="primary">{copyAllCopied ? "已复制" : "一键复制（给 Agent）"}</ActionButton>}
      >
        <p className="mb-3 text-sm text-gray-600">所有请求携带以下两个 Header：</p>
        <CodeBlock className="space-y-1">
          <div>X-API-Key: {apiKey || "（先申请）"}</div>
          <div>X-Username: {user?.username || user?.name || "（未获取）"}</div>
        </CodeBlock>
        <p className="mt-3 text-xs text-gray-400">Base URL: {BASE}</p>
      </SectionCard>

      <SectionCard title="API Endpoints" bodyClassName="overflow-x-auto p-0">
        <DataTable
          rows={ENDPOINTS}
          columns={endpointColumns}
          visibleColumns={[]}
          density="compact"
          rowKey={(ep) => `${ep.method}:${ep.path}`}
        />
      </SectionCard>
    </DatabasePageFrame>
  );
}
