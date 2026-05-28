"use client";

import { useState } from "react";
import EditToolbar from "@/app/components/EditToolbar";
import Toast from "@/app/components/Toast";
import ConfirmModal from "@/app/components/ConfirmModal";
import { useInventoryTab } from "../hooks/useInventoryTab";

interface InventoryField {
  key: string;
  label: string;
  isComputed?: boolean;
}

interface CreateFieldConfig {
  key: string;
  label: string;
  type: "text" | "select";
  options?: string[];
  required?: boolean;
  span?: "full" | "half";
  defaultValue?: string;
}

interface OpTypeOption {
  value: string;
  label: string;
}

export interface InventoryConfig {
  title: string;
  createTitle: string;
  opButtonLabel: string;
  apiBase: string;
  targetType: string;
  fields: InventoryField[];
  createFields: CreateFieldConfig[];
  opTypes: OpTypeOption[];
  defaultOpType: string;
  calculateStock: (item: Record<string, unknown>) => number;
}

export default function InventoryTableTab({ config }: { config: InventoryConfig }) {
  const {
    items, loading, keyword, setKeyword, editMode, setEditMode,
    editingCell, setEditingCell, editValue, setEditValue, inputRef,
    toast, closeToast,
    showOp, setShowOp, opForm, setOpForm,
    creating, setCreating, createForm, setCreateForm,
    load, startEdit, saveEdit, handleCreate, handleDelete, handleOperation,
  } = useInventoryTab({
    apiBase: config.apiBase,
    targetType: config.targetType,
    defaultOpType: config.defaultOpType,
  });

  const [deleteId, setDeleteId] = useState<number | null>(null);

  const fieldCount = config.fields.length + 1;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load()}
            placeholder="搜索编码/名称"
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
          />
          <button
            onClick={load}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
          >
            搜索
          </button>
        </div>
        <div className="flex items-center gap-2">
          <EditToolbar
            editMode={editMode}
            onStartEdit={() => setEditMode(true)}
            onSave={async () => { setEditMode(false); setEditingCell(null); }}
            onCancel={async () => { setEditMode(false); setEditingCell(null); }}
          />
          <button
            onClick={() => setCreating(true)}
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-700"
          >
            新增
          </button>
          <button
            onClick={() => setShowOp(true)}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
          >
            {config.opButtonLabel}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg bg-white shadow-sm">
        {loading ? (
          <p className="p-8 text-center text-gray-500">加载中...</p>
        ) : (
          <table className="w-full text-xs">
            <thead className="border-b bg-gray-50">
              <tr>
                {config.fields.map((f) => (
                  <th key={f.key} className="whitespace-nowrap px-3 py-2 text-left font-medium text-gray-600">
                    {f.label}
                  </th>
                ))}
                <th className="px-3 py-2 text-left font-medium text-gray-600">操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id as number} className="border-b last:border-0 hover:bg-gray-50">
                  {config.fields.map((f) => {
                    const isEditing = editingCell?.id === item.id && editingCell?.field === f.key;
                    const val = f.isComputed
                      ? config.calculateStock(item)
                      : item[f.key];
                    if (isEditing) {
                      return (
                        <td key={f.key} className="whitespace-nowrap px-3 py-2">
                          <input
                            ref={inputRef}
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveEdit();
                              if (e.key === "Escape") setEditingCell(null);
                            }}
                            className="rounded border border-emerald-400 px-2 py-1 text-xs"
                          />
                        </td>
                      );
                    }
                    return (
                      <td
                        key={f.key}
                        onClick={() => startEdit(item, f.key)}
                        className={`whitespace-nowrap px-3 py-2 text-gray-700 ${editMode && !f.isComputed ? "cursor-pointer hover:bg-emerald-50" : ""}`}
                      >
                        {val != null ? String(val) : "-"}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2">
                    <button
                      onClick={() => { setOpForm({ ...opForm, targetId: item.id as number }); setShowOp(true); }}
                      className="mr-1 text-xs text-blue-500 hover:text-blue-700"
                    >
                      操作
                    </button>
                    <button
                      onClick={() => setDeleteId(item.id as number)}
                      className="text-xs text-red-500 hover:text-red-700"
                    >
                      删除
                    </button>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={fieldCount} className="px-3 py-8 text-center text-gray-400">
                    暂无数据
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {creating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-sm font-semibold">{config.createTitle}</h3>
            <div className="grid grid-cols-2 gap-3">
              {config.createFields.map((f) => (
                <div key={f.key} className={f.span === "full" ? "col-span-2" : ""}>
                  <label className="text-xs text-gray-600">
                    {f.label}{f.required && <span className="text-red-400 ml-0.5">*</span>}
                  </label>
                  {f.type === "select" ? (
                    <select
                      value={(createForm[f.key] as string) ?? f.defaultValue ?? ""}
                      onChange={(e) => setCreateForm({ ...createForm, [f.key]: e.target.value })}
                      className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
                    >
                      {f.options?.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      value={(createForm[f.key] as string) ?? ""}
                      onChange={(e) => setCreateForm({ ...createForm, [f.key]: e.target.value })}
                      className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
                    />
                  )}
                </div>
              ))}
            </div>
            <div className="mt-4 flex gap-2">
              <button onClick={handleCreate} className="rounded-md bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700">
                保存
              </button>
              <button onClick={() => { setCreating(false); setCreateForm({}); }} className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {showOp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-sm font-semibold">库存操作</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-600">操作类型</label>
                <select
                  value={opForm.opType}
                  onChange={(e) => setOpForm({ ...opForm, opType: e.target.value })}
                  className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
                >
                  {config.opTypes.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-600">数量</label>
                <input
                  type="number"
                  value={opForm.quantity}
                  onChange={(e) => setOpForm({ ...opForm, quantity: e.target.value })}
                  className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
                />
              </div>
              <div>
                <label className="text-xs text-gray-600">原因/备注</label>
                <input
                  value={opForm.reason}
                  onChange={(e) => setOpForm({ ...opForm, reason: e.target.value })}
                  className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
                />
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <button onClick={handleOperation} className="rounded-md bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700">
                确认
              </button>
              <button onClick={() => setShowOp(false)} className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={deleteId !== null}
        title="确认删除"
        message="确定要删除该记录吗？此操作不可撤销。"
        onConfirm={() => { if (deleteId != null) handleDelete(deleteId); setDeleteId(null); }}
        onCancel={() => setDeleteId(null)}
      />

      <Toast message={toast?.message || ""} type={toast?.type as "success" | "error" | undefined} show={!!toast} onClose={closeToast} />
    </div>
  );
}
