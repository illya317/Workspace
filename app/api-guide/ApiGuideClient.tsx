"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ConfirmModal from "@/app/components/ConfirmModal";
import { SessionUser } from '@/lib/types';

function MyApiKeyPanel({ apiKey, onApiKeyChange }: { apiKey: string | null; onApiKeyChange: (k: string | null) => void }) {
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{ show: boolean; onConfirm: (() => void) | null }>({ show: false, onConfirm: null });

  function openConfirm(onConfirm: () => void) { setConfirmModal({ show: true, onConfirm }); }
  function closeConfirm() { setConfirmModal({ show: false, onConfirm: null }); }

  async function applyApiKey() {
    const doApply = async () => {
      setLoading(true);
      const res = await fetch("/workspace/api/my-api-key", { method: "POST" });
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
    <div className="mb-6 rounded-lg bg-white p-6 shadow-sm">
      <h2 className="mb-3 text-lg font-semibold text-gray-800">我的 API Key</h2>
      <p className="mb-4 text-sm text-gray-500">每人只有一个 Key，重新申请会覆盖旧的。</p>
      {apiKey ? (
        <div className="flex items-center gap-3">
          <code className="rounded-md bg-gray-100 px-3 py-2 font-mono text-sm text-gray-800">{apiKey}</code>
          <button onClick={copyKey} className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50">{copied ? "已复制" : "复制"}</button>
          <button onClick={applyApiKey} disabled={loading} className="rounded-md bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700 disabled:opacity-50">{loading ? "申请中..." : "重新申请"}</button>
        </div>
      ) : (
        <button onClick={applyApiKey} disabled={loading} className="rounded-md bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700 disabled:opacity-50">{loading ? "申请中..." : "申请 API Key"}</button>
      )}
      <ConfirmModal open={confirmModal.show} title="确认覆盖" message="申请新的 API Key 将覆盖旧的 Key，确定继续？" onConfirm={() => confirmModal.onConfirm?.()} onCancel={closeConfirm} confirmDanger={false} />
    </div>
  );
}

const ENDPOINTS = [
  { method: "GET", path: "/api/works", note: "查看工作清单", params: "targetType, targetId, ?category, ?includeArchived" },
  { method: "POST", path: "/api/works", note: "创建工作项", params: "category, content, importance, urgency" },
  { method: "PUT", path: "/api/works/:id", note: "更新工作项", params: "category, content, ..." },
  { method: "DELETE", path: "/api/works/:id", note: "删除工作项" },
  { method: "GET", path: "/api/reports", note: "查看汇报", params: "date, targetType, targetIds" },
  { method: "POST", path: "/api/reports", note: "提交汇报", params: "taskName, date, targetType, targetId, items" },
  { method: "PUT", path: "/api/reports/:id", note: "更新汇报", params: "taskName, notes, items" },
  { method: "GET", path: "/api/hr/employees", note: "员工列表", params: "?keyword, ?company", perm: "people.roster.access" },
  { method: "PUT", path: "/api/hr/employees/:id", note: "更新员工单字段", params: "{field, value}", perm: "people.write" },
  { method: "DELETE", path: "/api/hr/employees/:id", note: "删除员工", perm: "people.delete" },
  { method: "GET", path: "/api/hr/employments", note: "雇佣关系列表", perm: "people.roster.access" },
  { method: "POST", path: "/api/hr/employments", note: "新建雇佣关系", perm: "people.write" },
  { method: "PUT", path: "/api/hr/employments/:id", note: "更新雇佣关系", perm: "people.write" },
  { method: "DELETE", path: "/api/hr/employments/:id", note: "删除雇佣关系", perm: "people.delete" },
  { method: "GET", path: "/api/hr/departments", note: "部门列表", params: "?keyword", perm: "people.roster.access" },
  { method: "POST", path: "/api/hr/departments", note: "新建部门", perm: "people.write" },
  { method: "PUT", path: "/api/hr/departments/:id", note: "更新部门", perm: "people.write" },
  { method: "DELETE", path: "/api/hr/departments/:id", note: "删除部门", perm: "people.delete" },
  { method: "GET", path: "/api/hr/positions", note: "岗位列表", params: "?keyword", perm: "people.roster.access" },
  { method: "POST", path: "/api/hr/positions", note: "新建岗位", perm: "people.write" },
  { method: "PUT", path: "/api/hr/positions/:id", note: "更新岗位", perm: "people.write" },
  { method: "DELETE", path: "/api/hr/positions/:id", note: "删除岗位", perm: "people.delete" },
  { method: "GET", path: "/api/hr/edps", note: "EDP 列表", perm: "people.roster.access" },
  { method: "POST", path: "/api/hr/edps", note: "新建 EDP", perm: "people.write" },
  { method: "PUT", path: "/api/hr/edps/:id", note: "更新 EDP", perm: "people.write" },
  { method: "DELETE", path: "/api/hr/edps/:id", note: "删除 EDP", perm: "people.delete" },
  { method: "GET", path: "/api/hr/companies", note: "公司列表", perm: "people.roster.access" },
  { method: "POST", path: "/api/hr/companies", note: "新建公司", perm: "people.write" },
  { method: "PUT", path: "/api/hr/companies/:id", note: "更新公司", perm: "people.write" },
  { method: "DELETE", path: "/api/hr/companies/:id", note: "删除公司", perm: "people.delete" },
  { method: "GET", path: "/api/work/plans", note: "工作计划列表", perm: "work.plan.access" },
  { method: "POST", path: "/api/work/plans", note: "新建工作计划", perm: "work.plan.write" },
  { method: "DELETE", path: "/api/work/plans/:id", note: "删除工作计划", perm: "work.plan.delete" },
  { method: "GET", path: "/api/work/plan-members", note: "计划人员列表", perm: "work.plan.access" },
  { method: "POST", path: "/api/work/plan-members", note: "新建计划人员", perm: "work.plan.write" },
  { method: "DELETE", path: "/api/work/plan-members/:id", note: "删除计划人员", perm: "work.plan.delete" },
  { method: "GET", path: "/api/position-descriptions", note: "岗位说明书列表", params: "?code=xxx 查单个" },
  { method: "GET", path: "/api/admin/audit-log", note: "编辑历史", params: "?entityType=xxx", perm: "people.roster.access" },
];

export default function ApiGuidePage({ hideShell: _hideShell }: { hideShell?: boolean }) {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [apiKey, setApiKey] = useState<string | null>(null);

  useEffect(() => {
    fetch("/workspace/api/auth/me").then(r => r.ok ? r.json() : Promise.reject()).then(d => setUser(d.user)).catch(() => router.push("/login"));
    fetch("/workspace/api/my-api-key").then(r => r.json()).then(d => setApiKey(d.apiKey || null)).catch(() => {});
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
    <div className="min-h-screen bg-gray-50">
      <main className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="mb-6 text-2xl font-bold text-gray-800">接入指南</h1>

        <MyApiKeyPanel apiKey={apiKey} onApiKeyChange={setApiKey} />

        <div className="rounded-lg bg-white p-6 shadow-sm mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-800">认证方式</h2>
            <button onClick={copyForAgent} className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-700">{copyAllCopied ? "已复制" : "一键复制（给 Agent）"}</button>
          </div>
          <p className="mb-3 text-sm text-gray-600">所有请求携带以下两个 Header：</p>
          <div className="rounded-md bg-emerald-50 p-4 font-mono text-sm text-emerald-800 space-y-1">
            <div>X-API-Key: {apiKey || "（先申请）"}</div>
            <div>X-Username: {user?.username || user?.name || "（未获取）"}</div>
          </div>
          <p className="mt-3 text-xs text-gray-400">Base URL: {BASE}</p>
        </div>

        <div className="rounded-lg bg-white shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600 w-16">方法</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">路径</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">说明</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">参数</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 w-20">权限</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {ENDPOINTS.map((ep, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5">
                    <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-mono font-medium ${
                      ep.method === "GET" ? "bg-blue-50 text-blue-700" :
                      ep.method === "POST" ? "bg-emerald-50 text-emerald-700" :
                      ep.method === "PUT" ? "bg-amber-50 text-amber-700" :
                      "bg-red-50 text-red-700"
                    }`}>{ep.method}</span>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-gray-700">{ep.path}</td>
                  <td className="px-4 py-2.5 text-gray-600">{ep.note}</td>
                  <td className="px-4 py-2.5 text-xs text-gray-400">{ep.params || "—"}</td>
                  <td className="px-4 py-2.5 text-xs text-gray-400">{ep.perm || "登录"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
