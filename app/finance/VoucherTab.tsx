"use client";

import { useEffect, useState } from "react";
import EditToolbar from "@/app/components/EditToolbar";
import Toast from "@/app/components/Toast";
import { useToast } from "@/app/hooks/useToast";

interface Account {
  id: number;
  code: string;
  name: string;
}

interface VoucherItem {
  id?: number;
  accountId: number;
  account?: Account;
  debit: number;
  credit: number;
  description: string;
}

interface Voucher {
  id: number;
  voucherNo: string;
  date: string;
  description: string;
  totalDebit: number;
  totalCredit: number;
  status: string;
  items: VoucherItem[];
}

export default function VoucherTab() {
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [editingVoucher, setEditingVoucher] = useState<Partial<Voucher>>({});
  const [items, setItems] = useState<VoucherItem[]>([{ accountId: 0, debit: 0, credit: 0, description: "" }]);
  const { toast, showToast, closeToast } = useToast();

  async function load() {
    setLoading(true);
    const [vRes, aRes] = await Promise.all([
      fetch("/api/finance/vouchers"),
      fetch("/api/finance/accounts"),
    ]);
    if (vRes.ok) setVouchers((await vRes.json()).vouchers || []);
    if (aRes.ok) setAccounts((await aRes.json()).accounts || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const totalDebit = items.reduce((s, i) => s + (Number(i.debit) || 0), 0);
  const totalCredit = items.reduce((s, i) => s + (Number(i.credit) || 0), 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;

  function startCreate() {
    setEditingVoucher({ voucherNo: `V${new Date().toISOString().slice(0, 10).replace(/-/g, "")}001`, date: new Date().toISOString().slice(0, 10), description: "" });
    setItems([{ accountId: 0, debit: 0, credit: 0, description: "" }]);
    setEditMode(true);
  }

  function startEdit(v: Voucher) {
    setEditingVoucher({ ...v });
    setItems(v.items.map((i) => ({ ...i, accountId: i.account?.id || i.accountId })));
    setEditMode(true);
  }

  function addItem() {
    setItems([...items, { accountId: 0, debit: 0, credit: 0, description: "" }]);
  }

  function removeItem(idx: number) {
    setItems(items.filter((_, i) => i !== idx));
  }

  function updateItem(idx: number, field: keyof VoucherItem, value: unknown) {
    const next = [...items];
    next[idx] = { ...next[idx], [field]: value };
    setItems(next);
  }

  async function handleSave() {
    if (!editingVoucher.voucherNo || !editingVoucher.date) { showToast("凭证号和日期为必填", "error"); return; }
    if (!isBalanced) { showToast("借贷不平衡", "error"); return; }
    const validItems = items.filter((i) => i.accountId && (i.debit > 0 || i.credit > 0));
    if (validItems.length === 0) { showToast("至少需要一条有效分录", "error"); return; }

    const isCreate = !editingVoucher.id;
    const url = isCreate ? "/api/finance/vouchers" : `/api/finance/vouchers/${editingVoucher.id}`;
    const method = isCreate ? "POST" : "PUT";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...editingVoucher,
        periodId: 1, // TODO: 动态获取当前期间
        items: validItems.map((i) => ({ ...i, debit: Number(i.debit), credit: Number(i.credit) })),
      }),
    });

    if (res.ok) {
      showToast(isCreate ? "创建成功" : "保存成功");
      setEditMode(false);
      load();
    } else {
      const err = await res.json().catch(() => ({ error: "保存失败" }));
      showToast(err.error || "保存失败", "error");
    }
  }

  async function handlePost(id: number, post: boolean) {
    const res = await fetch(`/api/finance/vouchers/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: post ? "posted" : "draft" }),
    });
    if (res.ok) { showToast(post ? "过账成功" : "反过账成功"); load(); }
    else showToast("操作失败", "error");
  }

  async function handleDelete(id: number) {
    if (!confirm("确定删除该凭证？")) return;
    const res = await fetch(`/api/finance/vouchers/${id}`, { method: "DELETE" });
    if (res.ok) { showToast("删除成功"); load(); }
    else showToast("删除失败", "error");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-800">记账凭证</h2>
        {!editMode && <EditToolbar editMode={false} onStartEdit={startCreate} onSave={async () => {}} onCancel={() => {}} editLabel="新增凭证" />}
        {editMode && (
          <div className="flex items-center gap-2">
            <span className={`text-xs font-medium ${isBalanced ? "text-emerald-600" : "text-red-500"}`}>
              借 {totalDebit.toFixed(2)} / 贷 {totalCredit.toFixed(2)} {isBalanced ? "✓" : "✗ 不平衡"}
            </span>
            <EditToolbar editMode={true} onStartEdit={() => {}} onSave={handleSave} onCancel={() => setEditMode(false)} />
          </div>
        )}
      </div>

      {editMode && (
        <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <input value={editingVoucher.voucherNo || ""} onChange={(e) => setEditingVoucher({ ...editingVoucher, voucherNo: e.target.value })} placeholder="凭证号" className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
            <input type="date" value={editingVoucher.date || ""} onChange={(e) => setEditingVoucher({ ...editingVoucher, date: e.target.value })} className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
            <input value={editingVoucher.description || ""} onChange={(e) => setEditingVoucher({ ...editingVoucher, description: e.target.value })} placeholder="摘要" className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div className="space-y-1">
            {items.map((item, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                <div className="col-span-4">
                  <select value={item.accountId || ""} onChange={(e) => updateItem(idx, "accountId", parseInt(e.target.value))} className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-xs">
                    <option value="">选择科目</option>
                    {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
                  </select>
                </div>
                <input type="number" step="0.01" value={item.debit || ""} onChange={(e) => updateItem(idx, "debit", parseFloat(e.target.value) || 0)} placeholder="借方" className="col-span-2 rounded-md border border-gray-300 px-2 py-1.5 text-xs" />
                <input type="number" step="0.01" value={item.credit || ""} onChange={(e) => updateItem(idx, "credit", parseFloat(e.target.value) || 0)} placeholder="贷方" className="col-span-2 rounded-md border border-gray-300 px-2 py-1.5 text-xs" />
                <input value={item.description || ""} onChange={(e) => updateItem(idx, "description", e.target.value)} placeholder="摘要" className="col-span-3 rounded-md border border-gray-300 px-2 py-1.5 text-xs" />
                <button onClick={() => removeItem(idx)} className="col-span-1 text-red-500 hover:text-red-700 text-xs">×</button>
              </div>
            ))}
          </div>
          <button onClick={addItem} className="text-xs text-emerald-600 hover:text-emerald-800">+ 添加分录</button>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg bg-white shadow-sm">
        {loading ? <p className="p-8 text-center text-gray-500">加载中...</p> : (
          <table className="w-full text-xs">
            <thead className="border-b bg-gray-50"><tr>
              <th className="px-3 py-2 text-left font-medium text-gray-600">凭证号</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600">日期</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600">摘要</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600">借方</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600">贷方</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600">状态</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600">操作</th>
            </tr></thead>
            <tbody>
              {vouchers.map((v) => (
                <tr key={v.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-3 py-2 font-mono text-gray-700">{v.voucherNo}</td>
                  <td className="px-3 py-2 text-gray-600">{v.date}</td>
                  <td className="px-3 py-2 text-gray-700">{v.description}</td>
                  <td className="px-3 py-2 text-gray-700">{v.totalDebit.toFixed(2)}</td>
                  <td className="px-3 py-2 text-gray-700">{v.totalCredit.toFixed(2)}</td>
                  <td className="px-3 py-2"><span className={`text-xs px-1.5 py-0.5 rounded ${v.status === "posted" ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-600"}`}>{v.status === "posted" ? "已过账" : "草稿"}</span></td>
                  <td className="px-3 py-2 space-x-1">
                    <button onClick={() => startEdit(v)} className="text-emerald-600 hover:text-emerald-800 text-xs">编辑</button>
                    <button onClick={() => handlePost(v.id, v.status !== "posted")} className="text-blue-500 hover:text-blue-700 text-xs">{v.status === "posted" ? "反过账" : "过账"}</button>
                    <button onClick={() => handleDelete(v.id)} className="text-red-500 hover:text-red-700 text-xs">删除</button>
                  </td>
                </tr>
              ))}
              {vouchers.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-gray-400">暂无凭证</td></tr>}
            </tbody>
          </table>
        )}
      </div>
      <Toast message={toast?.message || ""} type={toast?.type} show={!!toast} onClose={closeToast} />
    </div>
  );
}
