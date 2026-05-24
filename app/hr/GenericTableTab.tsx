"use client";

import { useState, useEffect, useRef } from "react";
import HRToolbar from "@/app/components/HRToolbar";
import AuditLogModal from "@/app/components/AuditLogModal";
import Toast from "@/app/components/Toast";
import { useToast } from "@/app/hooks/useToast";
import FKInput from "./FKInput";
import { AutoSizeInput } from "./AutoSizeInput";
import FilterModal from "./FilterModal";
import { useGenericTab } from "./useGenericTab";
import EditableTable, { getVal } from "./EditableTable";
import type { TabConfig, FieldConfig, HRUser } from "./types";

export default function GenericTableTab({ config, user }: { config: TabConfig; user: HRUser }) {
  const {
    items, loading, error, keyword, setKeyword, filters, setFilter, applyFilters, resetFilters,
    editMode, setEditMode,
    editingCell, editValue, setEditValue, startEdit, cancelEdit, saveCell,
    creating, setCreating, createForm, setCreateForm, submitCreate,
    saving, load, showHistory, setShowHistory,
  } = useGenericTab(config);

  const { toast, showToast, closeToast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [showFilterModal, setShowFilterModal] = useState(false);

  useEffect(() => {
    if (editingCell && inputRef.current && !config.fkFields?.[editingCell.field]) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingCell, config.fkFields]);

  const visibleFields = config.fields.filter((f) => !f.hidden);

  function handleStartEdit(item: any, field: FieldConfig) {
    if (!user.canAccessHR || !editMode || !field.editable) return;
    if (editingCell?.id === item.id && editingCell?.field === field.key) return;
    let initVal: any;
    if (field.key === "gender") {
      initVal = item.gender === true ? "男" : item.gender === false ? "女" : "";
    } else if (field.type === "fk") {
      initVal = getVal(item, field.key + "Name") ?? getVal(item, config.fkFields?.[field.key]?.displayField ?? field.key) ?? "";
    } else {
      initVal = item[field.key] ?? "";
    }
    startEdit(item.id, field.key, initVal);
  }

  async function handleSave() {
    if (!editingCell) { setEditMode(false); return; }
    const ok = await saveCell();
    if (ok) showToast("保存成功");
    else showToast("保存失败", "error");
  }

  async function handleCreate() {
    const ok = await submitCreate();
    if (ok) showToast("新建成功");
    else showToast("新建失败", "error");
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleSave();
    if (e.key === "Escape") cancelEdit();
  }

  function renderEditInput(fieldKey: string) {
    const field = config.fields.find((f) => f.key === fieldKey);
    if (!field) return null;
    if (field.key === "gender") {
      return (
        <select
          value={editValue === true || editValue === "男" ? "男" : editValue === false || editValue === "女" ? "女" : "男"}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          className="rounded border border-emerald-400 px-2 py-1.5 text-sm focus:outline-none"
        >
          <option value="男">男</option>
          <option value="女">女</option>
        </select>
      );
    }
    if (field.type === "boolean") {
      return (
        <button
          type="button"
          onClick={() => setEditValue(!editValue)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2 ${editValue ? 'bg-emerald-500' : 'bg-gray-300'}`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${editValue ? 'translate-x-6' : 'translate-x-1'}`}
          />
        </button>
      );
    }
    if (field.type === "fk" && config.fkFields?.[fieldKey]) {
      return (
        <FKInput
          value={null} displayValue={editValue ?? ""} entity={config.fkFields[fieldKey].entity}
          onChange={(opt) => setEditValue(opt?.name ?? "")}
        />
      );
    }
    return (
      <AutoSizeInput
        ref={inputRef}
        value={editValue ?? ""}
        onChange={(e) => setEditValue(e.target.value)}
        onKeyDown={handleKeyDown}
      />
    );
  }

  return (
    <div className="space-y-4">
      <HRToolbar
        keyword={keyword} onKeywordChange={setKeyword}
        onKeywordEnter={load}
        onReset={() => { setKeyword(""); resetFilters(); load(); }}
        showEdit={user.canAccessHR}
        editProps={{
          editMode, onStartEdit: () => setEditMode(true),
          onSave: handleSave, onCancel: () => { cancelEdit(); setEditMode(false); },
          canEdit: user.canAccessHR, saving,
          onShowHistory: () => setShowHistory(true),
        }}
      >
        {/* 简单筛选 */}
        {config.filters?.map((f) => (
          f.type === "boolean" ? (
            <select
              key={f.key}
              value={filters[f.key] ?? ""}
              onChange={(e) => { setFilter(f.key, e.target.value); }}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-emerald-400 focus:outline-none"
            >
              <option value="">{f.label}</option>
              <option value="true">是</option>
              <option value="false">否</option>
            </select>
          ) : f.type === "select" && f.options ? (
            <select
              key={f.key}
              value={filters[f.key] ?? ""}
              onChange={(e) => { setFilter(f.key, e.target.value); }}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-emerald-400 focus:outline-none"
            >
              <option value="">{f.label}</option>
              {f.options.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          ) : (
            <input
              key={f.key}
              type="text"
              value={filters[f.key] ?? ""}
              onChange={(e) => { setFilter(f.key, e.target.value); }}
              placeholder={f.label}
              className="w-28 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 placeholder-gray-400 focus:border-emerald-400 focus:outline-none"
            />
          )
        ))}

        {/* 高级筛选 */}
        <button
          onClick={() => setShowFilterModal(true)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
        >
          筛选
        </button>

        {config.canCreate && user.canAccessHR && (
          <button
            onClick={() => setCreating(true)}
            className="rounded-md bg-emerald-600 px-3 py-2 text-sm text-white hover:bg-emerald-700"
          >
            新建
          </button>
        )}
      </HRToolbar>

      <div className="overflow-x-auto rounded-lg bg-white shadow-sm">
        {loading ? (
          <p className="p-8 text-center text-gray-500">加载中...</p>
        ) : error ? (
          <p className="p-8 text-center text-red-500">加载失败：{error}</p>
        ) : items.length === 0 ? (
          <p className="p-8 text-center text-gray-500">暂无数据</p>
        ) : (
          <EditableTable
            items={items}
            visibleFields={visibleFields}
            config={config}
            editingCell={editingCell}
            editMode={editMode}
            canEdit={user.canAccessHR}
            renderEditInput={renderEditInput}
            onStartEdit={handleStartEdit}
          />
        )}
      </div>

      {creating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-sm font-semibold text-gray-800">新建 {config.title}</h3>
            <div className="grid grid-cols-2 gap-3">
              {config.fields.filter((f) => !f.hidden).map((f) => (
                <div key={f.key} className={f.type === "textarea" ? "col-span-2" : ""}>
                  <label className="mb-1 block text-xs text-gray-600">{f.label}{f.required && <span className="text-red-400 ml-0.5">*</span>}</label>
                  {f.type === "fk" && config.fkFields?.[f.key] ? (
                    <FKInput
                      value={(createForm[f.key] as any)?.id ?? null}
                      displayValue={(createForm[f.key] as any)?.name ?? ""}
                      entity={config.fkFields[f.key].entity}
                      onChange={(opt) => setCreateForm((prev) => ({ ...prev, [f.key]: opt }))}
                    />
                  ) : f.key === "gender" ? (
                    <select
                      value={(createForm[f.key] as string) ?? "男"}
                      onChange={(e) => setCreateForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                      className="w-20 rounded border border-gray-300 px-2 py-1 text-xs focus:border-emerald-400 focus:outline-none"
                    >
                      <option value="男">男</option>
                      <option value="女">女</option>
                    </select>
                  ) : f.type === "boolean" ? (
                    <input
                      type="checkbox"
                      checked={!!createForm[f.key]}
                      onChange={(e) => setCreateForm((prev) => ({ ...prev, [f.key]: e.target.checked }))}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                  ) : f.type === "textarea" ? (
                    <textarea
                      value={(createForm[f.key] as string) ?? ""}
                      onChange={(e) => setCreateForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                      className="w-full rounded border border-gray-300 px-2 py-1 text-xs focus:border-emerald-400 focus:outline-none"
                      rows={3}
                    />
                  ) : (
                    <AutoSizeInput
                      type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                      value={(createForm[f.key] as string) ?? ""}
                      onChange={(e) => setCreateForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                      className="border-gray-300 focus:border-emerald-400"
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

      <AuditLogModal open={showHistory} onClose={() => setShowHistory(false)} entityType={config.entityType} onRestored={load} />

      <FilterModal
        open={showFilterModal}
        fields={config.fields}
        fkFields={config.fkFields}
        items={items}
        onClose={() => setShowFilterModal(false)}
        onApply={applyFilters}
        onReset={resetFilters}
      />

      <Toast message={toast?.message || ""} type={toast?.type as any} show={!!toast} onClose={closeToast} />
    </div>
  );
}
