"use client";

import { useEffect, useState } from "react";
import EditToolbar from "@/app/components/EditToolbar";
import Toast from "@/app/components/Toast";
import { useToast } from "@/app/hooks/useToast";

interface Account {
  id: number;
  code: string;
  name: string;
  category: string;
  parentId: number | null;
  balanceDirection: string;
  isActive: boolean;
  sortOrder: number;
}

const CATEGORIES: Record<string, string> = {
  asset: "资产", liability: "负债", equity: "权益", cost: "成本", revenue: "损益",
};

export default function AccountTab() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editRow, setEditRow] = useState<Partial<Account>>({});
  const { toast, showToast, closeToast } = useToast();

  async function load() {
    setLoading(true);
    const res = await fetch("/api/finance/accounts");
    if (res.ok) {
      const data = await res.json();
      setAccounts(data.accounts || []);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function startCreate() {
    setEditingId(-1);
    setEditRow({ code: "", name: "", category: "asset", balanceDirection: "debit", isActive: true, sortOrder: 0 });
    setEditMode(true);
  }

  function startEdit(acc: Account) {
    setEditingId(acc.id);
    setEditRow({ ...acc });
    setEditMode(true);
  }

  async function handleSave() {
    if (!editRow.code || !editRow.name) { showToast("编码和名称为必填", "error"); return; }
    const isCreate = editingId === -1;
    const url = isCreate ? "/api/finance/accounts" : `/api/finance/accounts/${editingId}`;
    const method = isCreate ? "POST" : "PUT";
    // 对于PUT单字段编辑模式，简化处理：直接用POST逻辑创建新记录或删除重建
    // 这里为了用户体验，使用完整保存
    const saveBody = isCreate ? editRow : { ...editRow, field: undefined };

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(saveBody),
    });

    if (res.ok) {
      showToast(isCreate ? "创建成功" : "保存成功");
      setEditMode(false);
      setEditingId(null);
      load();
    } else {
      const err = await res.json().catch(() => ({ error: "保存失败" }));
      showToast(err.error || "保存失败", "error");
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("确定删除该科目？")) return;
    const res = await fetch(`/api/finance/accounts/${id}`, { method: "DELETE" });
    if (res.ok) { showToast("删除成功"); load(); }
    else showToast("删除失败", "error");
  }

  const sorted = [...accounts].sort((a, b) => a.code.localeCompare(b.code));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-800">会计科目</h2>
        <EditToolbar
          editMode={editMode}
          onStartEdit={startCreate}
          onSave={handleSave}
          onCancel={() => { setEditMode(false); setEditingId(null); }}
          editLabel="新增科目"
        />
      </div>

      <div className="overflow-x-auto rounded-lg bg-white shadow-sm">
        {loading ? (
          <p className="p-8 text-center text-gray-500">加载中...</p>
        ) : (
          <table className="w-full text-xs">
            <thead className="border-b bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-gray-600">编码</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">名称</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">类别</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">余额方向</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">状态</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">操作</th>
              </tr>
            </thead>
            <tbody>
              {editMode && editingId === -1 && (
                <tr className="border-b bg-emerald-50">
                  <td className="px-3 py-2"><input value={editRow.code || ""} onChange={(e) => setEditRow({ ...editRow, code: e.target.value })} className="w-full rounded border border-emerald-400 px-2 py-1 text-xs" placeholder="编码" /></td>
                  <td className="px-3 py-2"><input value={editRow.name || ""} onChange={(e) => setEditRow({ ...editRow, name: e.target.value })} className="w-full rounded border border-emerald-400 px-2 py-1 text-xs" placeholder="名称" /></td>
                  <td className="px-3 py-2">
                    <select value={editRow.category || "asset"} onChange={(e) => setEditRow({ ...editRow, category: e.target.value })} className="rounded border border-emerald-400 px-2 py-1 text-xs">
                      {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <select value={editRow.balanceDirection || "debit"} onChange={(e) => setEditRow({ ...editRow, balanceDirection: e.target.value })} className="rounded border border-emerald-400 px-2 py-1 text-xs">
                      <option value="debit">借</option>
                      <option value="credit">贷</option>
                    </select>
                  </td>
                  <td className="px-3 py-2">-</td>
                  <td className="px-3 py-2">-</td>
                </tr>
              )}
              {sorted.map((acc) => (
                <tr key={acc.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-3 py-2 font-mono text-gray-700">{acc.code}</td>
                  <td className="px-3 py-2 text-gray-700">{acc.name}</td>
                  <td className="px-3 py-2 text-gray-600">{CATEGORIES[acc.category] || acc.category}</td>
                  <td className="px-3 py-2 text-gray-600">{acc.balanceDirection === "debit" ? "借" : "贷"}</td>
                  <td className="px-3 py-2"><span className={`text-xs ${acc.isActive ? "text-emerald-600" : "text-gray-400"}`}>{acc.isActive ? "启用" : "停用"}</span></td>
                  <td className="px-3 py-2">
                    <button onClick={() => startEdit(acc)} className="mr-2 text-emerald-600 hover:text-emerald-800 text-xs">编辑</button>
                    <button onClick={() => handleDelete(acc.id)} className="text-red-500 hover:text-red-700 text-xs">删除</button>
                  </td>
                </tr>
              ))}
              {accounts.length === 0 && <tr><td colSpan={6} className="px-3 py-8 text-center text-gray-400">暂无科目，请先新增</td></tr>}
            </tbody>
          </table>
        )}
      </div>
      <Toast message={toast?.message || ""} type={toast?.type} show={!!toast} onClose={closeToast} />
    </div>
  );
}
