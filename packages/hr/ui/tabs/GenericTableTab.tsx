"use client";

import { workspacePath } from "@workspace/core/routing";
import { useState, useEffect, useMemo, useRef } from "react";
import { useAuditLogModal } from "../audit/AuditLogModal";
import { createPageBody, PageSurface, useFeedback, type BodySurfaceSectionSpec } from "@workspace/core/ui";
import { createGenericEditInputSpec } from "../components/GenericFieldInput";
import { buildHRToolbarItems } from "../components/hr-toolbar-items";
import {
  buildAdvancedFilterValueOptions,
  mapAdvancedFilterField,
} from "../components/generic-filter-toolbar-items";
import { useGenericTab } from "../hooks/useGenericTab";
import { formatEditableTableCell, useEditableTableSection } from "./EditableTable";
import { columnToggleOptions, defaultVisibleColumnKeys, fieldsWithCompanyOptions } from "./generic-table-columns";
import { downloadGenericTableCsv } from "./generic-table-export";
import { type TabConfig, type FieldConfig, type HRUser, hrCanEdit } from "@workspace/hr/types";
import type { RosterSurfaceTabBarProps } from "../roster-surface";

export default function GenericTableTab({
  config,
  user,
  surface,
  onUnsavedChange,
}: {
  config: TabConfig;
  user: HRUser;
  surface?: RosterSurfaceTabBarProps;
  onUnsavedChange?: (dirty: boolean) => void;
}) {
  const canEdit = hrCanEdit(user);
  const {
    items, loading, error, keyword, searchKeyword, setKeyword, filters, setFilter, resetFilters,
    editMode, dirty, startPageEdit, cancelPageEdit,
    editingCell, editValue, setEditValue, startEdit, finishCellEdit, discardCellEdit, saveDraft,
    saving, load, showHistory, setShowHistory,
    page, pageSize, total, setPage,
  } = useGenericTab(config);

  const feedback = useFeedback({ unsavedChanges: dirty });
  const inputRef = useRef<HTMLInputElement>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    onUnsavedChange?.(dirty);
    return () => onUnsavedChange?.(false);
  }, [dirty, onUnsavedChange]);

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

  const tableFields = useMemo(
    () => fieldsWithCompanyOptions(config.fields, companyOptions),
    [companyOptions, config.fields],
  );

  const defaultVisibleColumns = useMemo(() => defaultVisibleColumnKeys(tableFields), [tableFields]);

  const [visibleColumns, setVisibleColumns] = useState<string[]>(defaultVisibleColumns);

  useEffect(() => {
    setVisibleColumns(defaultVisibleColumns);
  }, [defaultVisibleColumns]);

  const columnToggleColumns = useMemo(() => columnToggleOptions(tableFields), [tableFields]);

  const advancedFilters = useMemo(() => config.advancedFilters ?? [], [config.advancedFilters]);
  const [advancedFieldKey, setAdvancedFieldKey] = useState(() =>
    advancedFilters.find((filter) => filters[filter.queryParam])?.key ?? "",
  );

  useEffect(() => {
    const active = advancedFilters.find((filter) => filters[filter.queryParam]);
    if (active && active.key !== advancedFieldKey) {
      setAdvancedFieldKey(active.key);
    } else if (!active && advancedFieldKey) {
      setAdvancedFieldKey("");
    }
  }, [filters, advancedFilters, advancedFieldKey]);

  const advancedFilterFields = useMemo(
    () => advancedFilters.map(mapAdvancedFilterField),
    [advancedFilters],
  );

  const advancedFilterValueOptions = useMemo(
    () => buildAdvancedFilterValueOptions(advancedFilters),
    [advancedFilters],
  );

  function handleAdvancedFieldChange(nextKey: string) {
    if (advancedFieldKey && advancedFieldKey !== nextKey) {
      const previous = advancedFilters.find((filter) => filter.key === advancedFieldKey);
      if (previous) setFilter(previous.queryParam, "");
    }
    setAdvancedFieldKey(nextKey);
  }

  function handleAdvancedValueChange(value: string, fieldKey?: string) {
    const key = fieldKey ?? advancedFieldKey;
    const target = advancedFilters.find((filter) => filter.key === key);
    if (target) setFilter(target.queryParam, value);
  }

  function handleStartEdit(item: Record<string, unknown>, field: FieldConfig) {
    if (!canEdit || !editMode || !field.editable) return;
    const itemId = item.id as number;
    if (editingCell?.id === itemId && editingCell?.field === field.key) return;
    let initVal: string | boolean | number | unknown;
    if (field.type === "fk") {
      const displayName = formatEditableTableCell(item, field, config);
      initVal = {
        id: typeof item[field.key] === "number" ? item[field.key] as number : undefined,
        name: displayName === "-" ? "" : displayName,
      };
    } else if (field.key === "gender") {
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
    const result = await saveDraft();
    if (result.ok) {
      feedback.success("保存成功");
      return;
    }
    await feedback.confirm({
      title: "保存失败",
      message: result.error || "保存失败",
      confirmLabel: "关闭",
      confirmDanger: true,
      showCancel: false,
    });
  }

  async function handleDownload() {
    setDownloading(true);
    try {
      await downloadGenericTableCsv({ config, fields: tableFields, keyword: searchKeyword, filters });
      feedback.success("下载完成");
    } catch (error) {
      feedback.error(error instanceof Error ? error.message : "下载失败");
    } finally {
      setDownloading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      finishCellEdit();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      discardCellEdit();
    }
  }

  const editingField = editingCell
    ? config.fields.find((f) => f.key === editingCell.field)
    : undefined;

  const toolbarItems = buildHRToolbarItems({
    search: { value: keyword, onChange: setKeyword, placeholder: "搜索..." },
    filters: config.filters && config.filters.length > 0
      ? { configs: config.filters, values: filters, onChange: setFilter }
      : undefined,
    advancedFilter: advancedFilters.length > 0
      ? {
          fields: advancedFilterFields,
          valueOptions: advancedFilterValueOptions,
          fieldKey: advancedFieldKey,
          value: advancedFilters.find((filter) => filter.key === advancedFieldKey)
            ? (filters[advancedFilters.find((filter) => filter.key === advancedFieldKey)!.queryParam] ?? "")
            : "",
          onFieldKeyChange: handleAdvancedFieldChange,
          onValueChange: handleAdvancedValueChange,
          referenceEndpoint: "/api/modules/hr/roster/reference-options",
        }
      : undefined,
    columnToggle: { columns: columnToggleColumns, visible: visibleColumns, onChange: setVisibleColumns },
    reset: {
      onClick: () => {
        setKeyword("");
        setAdvancedFieldKey("");
        resetFilters();
        load();
      },
    },
    editGroup: canEdit
      ? {
          editMode,
          dirty,
          onStartEdit: startPageEdit,
          onSave: handleSave,
          onCancel: cancelPageEdit,
          canEdit,
          saving,
          onShowHistory: () => setShowHistory(true),
          onDownload: handleDownload,
          downloading,
        }
      : undefined,
    assistant: surface?.assistantAction
      ? { label: surface.assistantAction.label, disabled: surface.assistantAction.disabled, onClick: surface.assistantAction.onClick ?? (() => {}) }
      : undefined,
  });

  const pagination = total > 0 ? {
    total,
    page,
    totalPages: Math.ceil(total / pageSize),
    onPageChange: setPage,
    className: "mt-4 flex items-center justify-between",
    compact: true,
  } : undefined;

  const tableSection = useEditableTableSection({
    loading,
    emptyText: error ? `加载失败：${error}` : "暂无数据",
    items,
    fields: tableFields,
    visibleColumns,
    config,
    editingCell,
    editMode,
    canEdit,
    renderEditInput: (fieldKey) => editingField ? createGenericEditInputSpec({
      field: editingField,
      value: editValue,
      onChange: setEditValue,
      onKeyDown: handleKeyDown,
      inputRef,
      fkConfig: config.fkFields?.[fieldKey],
    }) : null,
    onStartEdit: handleStartEdit,
  });
  const auditLogModal = useAuditLogModal({ open: showHistory, onClose: () => setShowHistory(false), entityType: config.entityType, onRestored: load });

  const sections: BodySurfaceSectionSpec[] = [tableSection];

  return (
    <PageSurface kind="standard"
      {...surface}
      toolbar={{ items: toolbarItems, onSubmit: load }}
      body={createPageBody([...sections, auditLogModal])}
      footer={pagination ? { pagination } : undefined}
    />
  );
}
