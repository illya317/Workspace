"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import EditToolbar from "@/app/components/EditToolbar";
import Toast from "@/app/components/Toast";
import { useToast } from "@/app/hooks/useToast";

interface Packaging {
  id: number;
  code: string;
  name: string;
  spec: string | null;
  unit: string;
  packagingType: string;
  status: string;
  lastBalance: number;
  currentInbound: number;
  currentOutbound: number;
  batchNo: string | null;
  expiryDate: string | null;
  remark: string | null;
}

const FIELDS = [
  { key: "code", label: "物料编码" },
  { key: "name", label: "物料名称" },
  { key: "spec", label: "规格型号" },
  { key: "unit", label: "单位" },
  { key: "packagingType", label: "包装类型" },
  { key: "status", label: "库存状态" },
  { key: "lastBalance", label: "上次结存" },
  { key: "currentInbound", label: "本次入库" },
  { key: "currentOutbound", label: "本次出库" },
  { key: "currentStock", label: "当前库存" },
  { key: "batchNo", label: "批号" },
  { key: "expiryDate", label: "有效期" },
  { key: "remark", label: "备注" },
];

export default function PackagingTab() {
  const [items, setItems] = useState<Packaging[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [editingCell, setEditingCell] = useState<{
    id: number;
    field: string;
  } | null>(null);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast, showToast, closeToast } = useToast();
  const [showOp, setShowOp] = useState(false);
  const [opForm, setOpForm] = useState({
    opType: "inbound",
    targetId: 0,
    quantity: "",
    reason: "",
  });
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState<Partial<Packaging>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (keyword) params.set("keyword", keyword);
    const res = await fetch(`/api/inventory/packaging?${params.toString()}`);
    if (res.ok) setItems((await res.json()).items || []);
    setLoading(false);
  }, [keyword]);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingCell]);

  function startEdit(item: Packaging, field: string) {
    if (!editMode) return;
    setEditingCell({ id: item.id, field });
    setEditValue((item as any)[field] ?? "");
  }

  async function saveEdit() {
    if (!editingCell) return;
    const res = await fetch(`/api/inventory/packaging/${editingCell.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        field: editingCell.field,
        value: editValue || null,
      }),
    });
    if (res.ok) {
      showToast("保存成功");
      setEditingCell(null);
      load();
    } else showToast("保存失败", "error");
  }

  async function handleCreate() {
    const res = await fetch("/api/inventory/packaging", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(createForm),
    });
    if (res.ok) {
      showToast("创建成功");
      setCreating(false);
      setCreateForm({});
      load();
    } else {
      const err = await res.json().catch(() => ({ error: "创建失败" }));
      showToast(err.error, "error");
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("确定删除？")) return;
    const res = await fetch(`/api/inventory/packaging/${id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      showToast("删除成功");
      load();
    } else showToast("删除失败", "error");
  }

  async function handleOperation() {
    const res = await fetch("/api/inventory/operations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...opForm,
        targetType: "packaging",
        quantity: parseFloat(opForm.quantity),
      }),
    });
    if (res.ok) {
      showToast("操作成功");
      setShowOp(false);
      setOpForm({ opType: "inbound", targetId: 0, quantity: "", reason: "" });
      load();
    } else {
      const err = await res.json().catch(() => ({ error: "操作失败" }));
      showToast(err.error, "error");
    }
  }

  const currentStock = (item: Packaging) =>
    item.lastBalance + item.currentInbound - item.currentOutbound;

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
            onSave={async () => {
              setEditMode(false);
              setEditingCell(null);
            }}
            onCancel={async () => {
              setEditMode(false);
              setEditingCell(null);
            }}
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
            入库/出库
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
                {FIELDS.map((f) => (
                  <th
                    key={f.key}
                    className="whitespace-nowrap px-3 py-2 text-left font-medium text-gray-600"
                  >
                    {f.label}
                  </th>
                ))}
                <th className="px-3 py-2 text-left font-medium text-gray-600">
                  操作
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr
                  key={item.id}
                  className="border-b last:border-0 hover:bg-gray-50"
                >
                  {FIELDS.map((f) => {
                    const isEditing =
                      editingCell?.id === item.id &&
                      editingCell?.field === f.key;
                    const val =
                      f.key === "currentStock"
                        ? currentStock(item)
                        : (item as any)[f.key];
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
                        className={`whitespace-nowrap px-3 py-2 text-gray-700 ${editMode && f.key !== "currentStock" ? "cursor-pointer hover:bg-emerald-50" : ""}`}
                      >
                        {val ?? "-"}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2">
                    <button
                      onClick={() => {
                        setOpForm({ ...opForm, targetId: item.id });
                        setShowOp(true);
                      }}
                      className="mr-1 text-xs text-blue-500 hover:text-blue-700"
                    >
                      操作
                    </button>
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="text-xs text-red-500 hover:text-red-700"
                    >
                      删除
                    </button>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td
                    colSpan={14}
                    className="px-3 py-8 text-center text-gray-400"
                  >
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
            <h3 className="mb-4 text-sm font-semibold">新增包装材料</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-600">编码*</label>
                <input
                  value={createForm.code || ""}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, code: e.target.value })
                  }
                  className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
                />
              </div>
              <div>
                <label className="text-xs text-gray-600">名称*</label>
                <input
                  value={createForm.name || ""}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, name: e.target.value })
                  }
                  className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
                />
              </div>
              <div>
                <label className="text-xs text-gray-600">规格</label>
                <input
                  value={createForm.spec || ""}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, spec: e.target.value })
                  }
                  className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
                />
              </div>
              <div>
                <label className="text-xs text-gray-600">单位</label>
                <input
                  value={createForm.unit || ""}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, unit: e.target.value })
                  }
                  className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
                />
              </div>
              <div>
                <label className="text-xs text-gray-600">包装类型</label>
                <select
                  value={createForm.packagingType || "小容量"}
                  onChange={(e) =>
                    setCreateForm({
                      ...createForm,
                      packagingType: e.target.value,
                    })
                  }
                  className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
                >
                  <option>小容量</option>
                  <option>片剂包装</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-600">状态</label>
                <select
                  value={createForm.status || "正常"}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, status: e.target.value })
                  }
                  className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
                >
                  <option>正常</option>
                  <option>待检</option>
                  <option>不合格</option>
                </select>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                onClick={handleCreate}
                className="rounded-md bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700"
              >
                保存
              </button>
              <button
                onClick={() => {
                  setCreating(false);
                  setCreateForm({});
                }}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
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
                  onChange={(e) =>
                    setOpForm({ ...opForm, opType: e.target.value })
                  }
                  className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
                >
                  <option value="inbound">采购入库</option>
                  <option value="outbound">生产领用</option>
                  <option value="adjust">库存调整</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-600">数量</label>
                <input
                  type="number"
                  value={opForm.quantity}
                  onChange={(e) =>
                    setOpForm({ ...opForm, quantity: e.target.value })
                  }
                  className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
                />
              </div>
              <div>
                <label className="text-xs text-gray-600">原因/备注</label>
                <input
                  value={opForm.reason}
                  onChange={(e) =>
                    setOpForm({ ...opForm, reason: e.target.value })
                  }
                  className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
                />
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                onClick={handleOperation}
                className="rounded-md bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700"
              >
                确认
              </button>
              <button
                onClick={() => setShowOp(false)}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      <Toast
        message={toast?.message || ""}
        type={toast?.type as any}
        show={!!toast}
        onClose={closeToast}
      />
    </div>
  );
}
