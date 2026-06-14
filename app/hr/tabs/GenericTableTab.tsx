"use client";

import { useState, useEffect, useRef } from "react";
import HRToolbar from "@/app/components/HRToolbar";
import AuditLogModal from "@/app/components/AuditLogModal";
import Toast from "@/app/components/Toast";
import { useToast } from "@/app/hooks/useToast";
import FilterModal from "../components/FilterModal";
import GenericFieldInput from "../components/GenericFieldInput";
import GenericToolbarFilters from "../components/GenericToolbarFilters";
import GenericCreateModal from "../components/GenericCreateModal";
import GenericPagination from "../components/GenericPagination";
import { useGenericTab } from "../hooks/useGenericTab";
import EditableTable, { getVal } from "./EditableTable";
import { type TabConfig, type FieldConfig, type HRUser, hrCanEdit } from "../types";

export default function GenericTableTab({ config, user }: { config: TabConfig; user: HRUser }) {
  const canEdit = hrCanEdit(user);
  const {
    items, loading, error, keyword, setKeyword, filters, setFilter, applyFilters, resetFilters,
    editMode, setEditMode,
    editingCell, editValue, setEditValue, startEdit, cancelEdit, saveCell,
    creating, setCreating, createForm, setCreateForm, submitCreate,
    saving, load, showHistory, setShowHistory,
    page, pageSize, total, setPage,
  } = useGenericTab(config);

  const { toast, showToast, closeToast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [showFilterModal, setShowFilterModal] = useState(false);

  // 动态加载公司列表作为编码池选项
  const [companyOptions, setCompanyOptions] = useState<Array<{ label: string; value: string }>>([]);
  useEffect(() => {
    fetch("/workspace/api/hr/companies?active=1")
      .then((r) => r.json())
      .then((data) => {
        const companies = (data.companies || []) as Array<{ code: string; name: string }>;
        const opts = [
          { label: "自身", value: "" },
          ...companies.map((c) => ({ label: `${c.code} ${c.name}`, value: c.code })),
        ];
        setCompanyOptions(opts);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (editingCell && inputRef.current && !config.fkFields?.[editingCell.field]) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingCell, config.fkFields]);

  const visibleFields = config.fields.filter((f) => !f.hidden).map((f) =>
    f.optionsSource === "companies" ? { ...f, options: companyOptions } : f
  );

  function handleStartEdit(item: Record<string, unknown>, field: FieldConfig) {
    if (!canEdit || !editMode || !field.editable) return;
    const itemId = item.id as number;
    if (editingCell?.id === itemId && editingCell?.field === field.key) return;
    let initVal: string | boolean | number | unknown;
    if (field.key === "gender") {
      initVal = item.gender === true ? "男" : item.gender === false ? "女" : "";
    } else if (field.type === "fk") {
      initVal = getVal(item, field.key + "Name") ?? getVal(item, config.fkFields?.[field.key]?.displayField ?? field.key) ?? "";
    } else {
      initVal = item[field.key] ?? "";
    }
    startEdit(itemId, field.key, initVal);
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

  const editingField = editingCell
    ? config.fields.find((f) => f.key === editingCell.field)
    : undefined;

  return (
    <div className="space-y-4">
      <HRToolbar
        keyword={keyword} onKeywordChange={setKeyword}
        onKeywordEnter={load}
        onReset={() => { setKeyword(""); resetFilters(); load(); }}
        showEdit={canEdit}
        editProps={{
          editMode, onStartEdit: () => setEditMode(true),
          onSave: handleSave, onCancel: () => { cancelEdit(); setEditMode(false); },
          canEdit: canEdit, saving,
          onShowHistory: () => setShowHistory(true),
        }}
      >
        <GenericToolbarFilters
          filters={config.filters || []}
          filterValues={filters}
          onFilterChange={(key, val) => setFilter(key, val)}
          onShowAdvancedFilters={() => setShowFilterModal(true)}
          canCreate={!!config.canCreate && canEdit}
          onCreate={() => setCreating(true)}
        />
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
            canEdit={canEdit}
            renderEditInput={(fieldKey) =>
              editingField ? (
                <GenericFieldInput
                  field={editingField}
                  value={editValue}
                  onChange={setEditValue}
                  onKeyDown={handleKeyDown}
                  inputRef={inputRef}
                  fkConfig={config.fkFields?.[fieldKey]}
                  mode="edit"
                />
              ) : null
            }
            onStartEdit={handleStartEdit}
          />
        )}
      </div>

      {creating && (
        <GenericCreateModal
          config={config}
          createForm={createForm}
          onChange={(key, val) => setCreateForm((prev) => ({ ...prev, [key]: val }))}
          onSubmit={handleCreate}
          onCancel={() => { setCreating(false); setCreateForm({}); }}
        />
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

      <GenericPagination
        total={total}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
      />

      <Toast message={toast?.message || ""} type={toast?.type as "success" | "error" | undefined} show={!!toast} onClose={closeToast} />
    </div>
  );
}
