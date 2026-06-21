"use client";

import { workspacePath } from "@workspace/core/routing";
import { useState, useEffect, useMemo, useRef } from "react";
import HRToolbar from "../components/HRToolbar";
import AuditLogModal from "@workspace/platform/ui/AuditLogModal";
import Toast from "@workspace/core/ui/Toast";
import { Pagination, PanelCard } from "@workspace/core/ui";
import { useToast } from "@workspace/core/hooks";
import GenericCreatePanel from "../components/GenericCreatePanel";
import GenericFieldInput from "../components/GenericFieldInput";
import GenericToolbarFilters from "../components/GenericToolbarFilters";
import { useGenericTab } from "../hooks/useGenericTab";
import EditableTable, { getVal } from "./EditableTable";
import { type TabConfig, type FieldConfig, type HRUser, hrCanEdit } from "@workspace/hr/types";

export default function GenericTableTab({ config, user }: { config: TabConfig; user: HRUser }) {
  const canEdit = hrCanEdit(user);
  const {
    items, loading, error, keyword, setKeyword, filters, setFilter, resetFilters,
    editMode, setEditMode,
    editingCell, editValue, setEditValue, startEdit, cancelEdit, saveCell,
    creating, setCreating, createForm, setCreateForm, submitCreate,
    saving, load, showHistory, setShowHistory,
    page, pageSize, total, setPage,
  } = useGenericTab(config);

  const { toast, showToast, closeToast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);

  // 动态加载公司列表作为编码池选项
  const [companyOptions, setCompanyOptions] = useState<Array<{ label: string; value: string }>>([]);
  useEffect(() => {
    fetch(workspacePath("/api/modules/hr/roster/companies?active=1"))
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

  const tableFields = useMemo(() => config.fields.map((f) =>
    f.optionsSource === "companies" ? { ...f, options: companyOptions } : f
  ), [companyOptions, config.fields]);

  const defaultVisibleColumns = useMemo(() => {
    const defaults = tableFields
      .filter((field) => field.required || field.defaultVisible)
      .map((field) => field.key);
    return defaults.length > 0
      ? defaults
      : tableFields.filter((field) => !field.hidden).map((field) => field.key);
  }, [tableFields]);

  const [visibleColumns, setVisibleColumns] = useState<string[]>(defaultVisibleColumns);

  useEffect(() => {
    setVisibleColumns(defaultVisibleColumns);
  }, [defaultVisibleColumns]);

  const columnToggleColumns = useMemo(() =>
    tableFields.map((field) => ({
      key: field.key,
      label: field.label,
      required: field.required,
      defaultVisible: field.defaultVisible,
    })),
    [tableFields],
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
    } else if (config.entityType === "Employee" && field.key === "alias") {
      try {
        const parsed = JSON.parse(String(item.alias || ""));
        initVal = Array.isArray(parsed) ? parsed.map((entry) => String(entry)).join("、") : item.alias ?? "";
      } catch {
        initVal = item.alias ?? "";
      }
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
        columns={columnToggleColumns}
        visibleColumns={visibleColumns}
        onColumnsChange={setVisibleColumns}
        showEdit={canEdit}
        editProps={{
          editMode, onStartEdit: () => setEditMode(true),
          onSave: handleSave, onCancel: () => { cancelEdit(); setEditMode(false); },
          canEdit: canEdit, saving,
          onShowHistory: () => setShowHistory(true),
        }}
        canCreate={!!config.canCreate && canEdit}
        onCreate={() => setCreating(true)}
      >
        <GenericToolbarFilters
          filters={config.filters || []}
          advancedFilters={config.advancedFilters ?? []}
          filterValues={filters}
          onFilterChange={(key, val) => setFilter(key, val)}
        />
      </HRToolbar>

      {creating && (
        <GenericCreatePanel
          config={config}
          createForm={createForm}
          onChange={(key, val) => setCreateForm((prev) => ({ ...prev, [key]: val }))}
          onSubmit={handleCreate}
          onCancel={() => { setCreating(false); setCreateForm({}); }}
        />
      )}

      <PanelCard className="overflow-hidden" bodyClassName="overflow-x-auto">
        {loading ? (
          <p className="p-8 text-center text-gray-500">加载中...</p>
        ) : error ? (
          <p className="p-8 text-center text-red-500">加载失败：{error}</p>
        ) : items.length === 0 ? (
          <p className="p-8 text-center text-gray-500">暂无数据</p>
        ) : (
          <EditableTable
            items={items}
            fields={tableFields}
            visibleColumns={visibleColumns}
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
      </PanelCard>

      <AuditLogModal open={showHistory} onClose={() => setShowHistory(false)} entityType={config.entityType} onRestored={load} />

      {total > 0 && (
        <Pagination
          total={total}
          page={page}
          totalPages={Math.ceil(total / pageSize)}
          onPageChange={setPage}
          className="mt-4 flex items-center justify-between"
          compact
        />
      )}

      <Toast message={toast?.message || ""} type={toast?.type as "success" | "error" | undefined} show={!!toast} onClose={closeToast} />
    </div>
  );
}
