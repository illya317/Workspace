"use client";

import { useState } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: Record<string, unknown>) => void;
}

const COMPANIES: Record<string, string> = {
  "01": "丰华生物",
  "02": "上海天力通",
  "03": "上海悦通",
  "04": "加拿大",
  "05": "丰华悦通",
};

const CATEGORIES: Record<string, string> = {
  asset: "资产",
  liability: "负债",
  equity: "权益",
  cost: "成本",
  revenue: "收入",
  expense: "费用",
  other: "其他",
};

export default function AccountCreateModal({ open, onClose, onSubmit }: Props) {
  const [form, setForm] = useState<Record<string, unknown>>({
    code: "",
    name: "",
    category: "asset",
    balanceDirection: "debit",
    companyCode: "01",
    subjectLevel: 1,
    parentId: "",
    groupSubjectCode: "",
    mnemonicCode: "",
    currency: "",
    isActive: true,
    sortOrder: 0,
  });

  if (!open) return null;

  function handleChange(key: string, value: unknown) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit() {
    const data = { ...form };
    if (data.parentId === "") data.parentId = null;
    if (data.groupSubjectCode === "") data.groupSubjectCode = null;
    if (data.mnemonicCode === "") data.mnemonicCode = null;
    if (data.currency === "") data.currency = null;
    onSubmit(data);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl max-h-[85vh] overflow-auto rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-800">新增科目</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs text-gray-600">
              科目编码 <span className="text-red-400">*</span>
            </label>
            <input
              value={String(form.code || "")}
              onChange={(e) => handleChange("code", e.target.value)}
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-emerald-400 focus:outline-none"
              placeholder="如 100201"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-600">
              科目名称 <span className="text-red-400">*</span>
            </label>
            <input
              value={String(form.name || "")}
              onChange={(e) => handleChange("name", e.target.value)}
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-emerald-400 focus:outline-none"
              placeholder="科目名称"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-600">
              所属公司 <span className="text-red-400">*</span>
            </label>
            <select
              value={String(form.companyCode || "01")}
              onChange={(e) => handleChange("companyCode", e.target.value)}
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-emerald-400 focus:outline-none"
            >
              {Object.entries(COMPANIES).map(([code, name]) => (
                <option key={code} value={code}>{name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-600">
              科目类别 <span className="text-red-400">*</span>
            </label>
            <select
              value={String(form.category || "asset")}
              onChange={(e) => handleChange("category", e.target.value)}
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-emerald-400 focus:outline-none"
            >
              {Object.entries(CATEGORIES).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-600">
              余额方向 <span className="text-red-400">*</span>
            </label>
            <select
              value={String(form.balanceDirection || "debit")}
              onChange={(e) => handleChange("balanceDirection", e.target.value)}
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-emerald-400 focus:outline-none"
            >
              <option value="debit">借</option>
              <option value="credit">贷</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-600">科目级次</label>
            <input
              type="number"
              min={1}
              max={5}
              value={Number(form.subjectLevel || 1)}
              onChange={(e) => handleChange("subjectLevel", parseInt(e.target.value, 10))}
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-emerald-400 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-600">父级科目ID</label>
            <input
              type="number"
              value={form.parentId === null || form.parentId === undefined ? "" : String(form.parentId)}
              onChange={(e) => handleChange("parentId", e.target.value ? parseInt(e.target.value, 10) : "")}
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-emerald-400 focus:outline-none"
              placeholder="留空表示一级科目"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-600">集团统一编码</label>
            <input
              value={String(form.groupSubjectCode || "")}
              onChange={(e) => handleChange("groupSubjectCode", e.target.value)}
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-emerald-400 focus:outline-none"
              placeholder="留空表示非集团科目"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-600">助记码</label>
            <input
              value={String(form.mnemonicCode || "")}
              onChange={(e) => handleChange("mnemonicCode", e.target.value)}
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-emerald-400 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-600">外币币种</label>
            <input
              value={String(form.currency || "")}
              onChange={(e) => handleChange("currency", e.target.value)}
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-emerald-400 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-600">排序</label>
            <input
              type="number"
              value={Number(form.sortOrder || 0)}
              onChange={(e) => handleChange("sortOrder", parseInt(e.target.value, 10))}
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-emerald-400 focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-600">启用状态</label>
            <input
              type="checkbox"
              checked={!!form.isActive}
              onChange={(e) => handleChange("isActive", e.target.checked)}
              className="h-4 w-4 accent-emerald-600"
            />
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <button
            onClick={handleSubmit}
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700"
          >
            保存
          </button>
          <button
            onClick={onClose}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  );
}
