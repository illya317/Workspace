"use client";

import { CreateStartButton, RefreshActionButton, SearchInput, SelectField, Toolbar, getToolbarActionClassName } from "@workspace/core/ui";
import type { ColumnDef, EditToolbarProps, ToolbarItem } from "@workspace/core/ui";
interface Props {
  rosterFilter?: "在职" | "离职";
  onRosterChange?: (value: "在职" | "离职") => void;
  keyword: string;
  onKeywordChange: (value: string) => void;
  keywordPlaceholder?: string;
  onKeywordEnter?: () => void;
  onReset: () => void;
  children?: React.ReactNode;
  columns?: ColumnDef[];
  visibleColumns?: string[];
  onColumnsChange?: (visible: string[]) => void;
  canCreate?: boolean;
  createActive?: boolean;
  onCreate?: () => void;
  onDownload?: () => void;
  downloading?: boolean;
  showEdit?: boolean;
  editProps?: EditToolbarProps;
}
export default function HRToolbar({
  rosterFilter,
  onRosterChange,
  keyword,
  onKeywordChange,
  keywordPlaceholder = "搜索...",
  onKeywordEnter,
  onReset,
  children,
  columns,
  visibleColumns,
  onColumnsChange,
  canCreate,
  createActive,
  onCreate,
  onDownload,
  downloading,
  showEdit,
  editProps
}: Props) {
  const viewControls = canCreate && onCreate || rosterFilter && onRosterChange ? <>
      {canCreate && onCreate && <CreateStartButton label="新建" active={createActive} onClick={onCreate} />}
      {rosterFilter && onRosterChange && <>
          <button type="button" onClick={() => onRosterChange("在职")} className={getToolbarActionClassName(rosterFilter === "在职" ? "primary" : "secondary")}>
            在职
          </button>
          <button type="button" onClick={() => onRosterChange("离职")} className={getToolbarActionClassName(rosterFilter === "离职" ? "primary" : "secondary")}>
            离职
          </button>
        </>}
    </> : undefined;
  const items = [viewControls ? {
    kind: "custom",
    key: "view",
    section: "view",
    content: viewControls
  } as ToolbarItem : null, {
    kind: "custom",
    key: "filter",
    section: "filter",
    content: <>
          <SearchInput value={keyword} onChange={onKeywordChange} placeholder={keywordPlaceholder} />
          {children}
          {columns && visibleColumns && onColumnsChange && <SelectField multiple summaryMode="count" label="字段" options={columns.map(column => ({
        value: column.key,
        label: String(column.label),
        disabled: column.required
      }))} value={visibleColumns} onChange={onColumnsChange} />}
          <RefreshActionButton onClick={onReset} label="重置" />
        </>
  } as ToolbarItem, showEdit && editProps ? {
    kind: "edit-group",
    key: "edit",
    section: "edit",
    ...editProps,
    onDownload,
    downloading
  } as ToolbarItem : null].filter((item): item is ToolbarItem => item !== null);
  return <Toolbar items={items} onSubmit={onKeywordEnter} />;
}
