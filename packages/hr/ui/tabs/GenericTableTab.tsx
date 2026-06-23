"use client";

import { workspacePath } from "@workspace/core/routing";
import { useState, useEffect, useMemo, useRef } from "react";
import HRToolbar from "../components/HRToolbar";
import AuditLogModal from "@workspace/platform/ui/AuditLogModal";
import Toast from "@workspace/core/ui/Toast";
import { Pagination, PanelCard, useConfirm } from "@workspace/core/ui";
import { useToast } from "@workspace/core/hooks";
import GenericCreatePanel from "../components/GenericCreatePanel";
import GenericFieldInput from "../components/GenericFieldInput";
import GenericToolbarFilters from "../components/GenericToolbarFilters";
import { useGenericTab } from "../hooks/useGenericTab";
import EditableTable, { formatEditableTableCell } from "./EditableTable";
import { type TabConfig, type FieldConfig, type HRUser, hrCanEdit } from "@workspace/hr/types";

const EXPORT_PAGE_SIZE = 500;

function escapeCsvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadCsv(filename: string, content: string) {
  const blob = new Blob([`\uFEFF${content}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function GenericTableTab({ config, user }: { config: TabConfig; user: HRUser }) {
  const canEdit = hrCanEdit(user);
  const {
    items, loading, error, keyword, searchKeyword, setKeyword, filters, setFilter, resetFilters,
    editMode, setEditMode,
    editingCell, editValue, setEditValue, startEdit, cancelEdit, saveCell,
    creating, setCreating, createForm, setCreateForm, submitCreate,
    saving, load, showHistory, setShowHistory,
    page, pageSize, total, setPage,
  } = useGenericTab(config);

  const { toast, showToast, closeToast } = useToast();
  const confirm = useConfirm();
  const inputRef = useRef<HTMLInputElement>(null);
  const [downloading, setDownloading] = useState(false);

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
    if (!canEdit || !editMode || !field.editable || field.type === "fk") return;
    const itemId = item.id as number;
    if (editingCell?.id === itemId && editingCell?.field === field.key) return;
    let initVal: string | boolean | number | unknown;
    if (field.key === "gender") {
      initVal = item.gender === true ? "男" : item.gender === false ? "女" : "";
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
    const result = await saveCell();
    if (result.ok) {
      showToast("保存成功");
      return;
    }
    await confirm({
      title: "保存失败",
      message: result.error || "保存失败",
      confirmLabel: "关闭",
      confirmDanger: true,
      showCancel: false,
    });
  }

  async function handleCreate() {
    const ok = await submitCreate();
    if (ok) showToast("新建成功");
    else showToast("新建失败", "error");
  }

  async function handleDownload() {
    setDownloading(true);
    try {
      const rows: Record<string, unknown>[] = [];
      let nextPage = 1;
      let totalRows = 0;
      do {
        const params = new URLSearchParams({
          page: String(nextPage),
          pageSize: String(EXPORT_PAGE_SIZE),
        });
        if (searchKeyword) params.set("keyword", searchKeyword);
        for (const [key, value] of Object.entries(filters)) {
          if (value !== "" && value !== undefined && value !== null) params.set(key, value);
        }
        const response = await fetch(`${workspacePath(config.apiPath)}?${params.toString()}`);
        if (!response.ok) throw new Error("下载失败");
        const data = await response.json();
        const pageRows = config.listGetter ? config.listGetter(data) : data.items || data;
        if (!Array.isArray(pageRows)) throw new Error("下载数据格式错误");
        rows.push(...(pageRows as Record<string, unknown>[]));
        totalRows = typeof data.total === "number" ? data.total : rows.length;
        if (pageRows.length === 0) break;
        nextPage += 1;
      } while (rows.length < totalRows);

      const exportFields = tableFields.filter((field) => !field.createOnly);
      const header = exportFields.map((field) => escapeCsvCell(field.label)).join(",");
      const body = rows
        .map((row) =>
          exportFields
            .map((field) => escapeCsvCell(formatEditableTableCell(row, field, config).replace(/^-$/, "")))
            .join(","),
        )
        .join("\n");
      downloadCsv(`${config.title}_${new Date().toISOString().slice(0, 10)}.csv`, `${header}\n${body}`);
      showToast("下载完成");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "下载失败", "error");
    } finally {
      setDownloading(false);
    }
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
        createActive={creating}
        onCreate={() => setCreating(true)}
        onDownload={handleDownload}
        downloading={downloading}
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
