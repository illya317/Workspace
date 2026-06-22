"use client";

import {
  ActionButton,
  ColumnToggle,
  CommandToolbar,
  EditToolbar,
  IconActionButton,
  RefreshActionButton,
  SearchInput,
} from "@workspace/core/ui";
import type { ColumnDef, EditToolbarProps } from "@workspace/core/ui";

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
  onCreate,
  onDownload,
  downloading,
  showEdit,
  editProps,
}: Props) {
  const viewControls = (canCreate && onCreate) || (rosterFilter && onRosterChange) ? (
    <>
      {canCreate && onCreate && (
        <IconActionButton label="新建" variant="primary" onClick={onCreate}>
          +
        </IconActionButton>
      )}
      {rosterFilter && onRosterChange && (
        <>
          <ActionButton
            onClick={() => onRosterChange("在职")}
            variant={rosterFilter === "在职" ? "primary" : "secondary"}
          >
            在职
          </ActionButton>
          <ActionButton
            onClick={() => onRosterChange("离职")}
            variant={rosterFilter === "离职" ? "primary" : "secondary"}
          >
            离职
          </ActionButton>
        </>
      )}
    </>
  ) : undefined;

  return (
    <CommandToolbar
      onSubmit={onKeywordEnter}
      viewControls={viewControls}
      filters={
        <>
          <SearchInput
            value={keyword}
            onChange={onKeywordChange}
            placeholder={keywordPlaceholder}
            size="toolbar"
          />
          {children}
          {columns && visibleColumns && onColumnsChange && (
            <ColumnToggle columns={columns} visible={visibleColumns} onChange={onColumnsChange} />
          )}
          <RefreshActionButton onClick={onReset} label="重置" />
        </>
      }
      editActions={showEdit && editProps ? <EditToolbar {...editProps} onDownload={onDownload} downloading={downloading} /> : null}
    />
  );
}
