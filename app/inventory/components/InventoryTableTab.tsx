"use client";

import { useState } from "react";
import { ConfirmModal, EditToolbar, PanelCard, SearchInput, Toast, getToolbarActionClassName } from "@workspace/core/ui";
import { useInventoryTab } from "../hooks/useInventoryTab";
import InventoryCreateModal from "./InventoryCreateModal";
import InventoryOpModal from "./InventoryOpModal";

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
          <SearchInput
            value={keyword}
            onChange={setKeyword}
            onKeyDown={(e) => e.key === "Enter" && load()}
            placeholder="搜索编码/名称"
            size="toolbar"
            className="min-w-0 sm:w-[22rem]"
          />
          <button
            onClick={load}
            className={getToolbarActionClassName("secondary")}
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
            className={getToolbarActionClassName("primary")}
          >
            新增
          </button>
          <button
            onClick={() => setShowOp(true)}
            className={getToolbarActionClassName("secondary")}
          >
            {config.opButtonLabel}
          </button>
        </div>
      </div>

      <PanelCard bodyClassName="overflow-x-auto">
        {loading ? (
          <p className="p-8 text-center text-gray-500">加载中...</p>
        ) : (
          <table className="w-full text-sm">
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
      </PanelCard>

      <InventoryCreateModal
        open={creating}
        title={config.createTitle}
        fields={config.createFields}
        form={createForm}
        onFieldChange={(key, value) => setCreateForm((prev) => ({ ...prev, [key]: value }))}
        onSave={handleCreate}
        onCancel={() => { setCreating(false); setCreateForm({}); }}
      />

      <InventoryOpModal
        open={showOp}
        opTypes={config.opTypes}
        opForm={opForm}
        onFieldChange={(key, value) => setOpForm((prev) => ({ ...prev, [key]: value }))}
        onConfirm={handleOperation}
        onCancel={() => setShowOp(false)}
      />

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
