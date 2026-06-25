"use client";

import { useState } from "react";
import { ActionButton, IconActionButton, RefreshActionButton } from "../ActionControls";
import CommandToolbar from "../CommandToolbar";
import EditToolbar from "../EditToolbar";
import FieldValueFilter from "../FieldValueFilter";
import SearchInput from "../SearchInput";
import SelectField from "../SelectField";
import ToolbarOptionGroup from "../ToolbarOptionGroup";

const fieldOptions = [
  { value: "status", label: "状态" },
  { value: "scope", label: "范围" },
];

const valueOptions = {
  status: [
    { value: "", label: "全部" },
    { value: "active", label: "现用" },
    { value: "archived", label: "归档" },
  ],
  scope: [
    { value: "", label: "全部" },
    { value: "internal", label: "内部" },
    { value: "public", label: "公开" },
  ],
};

const modeOptions = [
  { value: "all", label: "全部" },
  { value: "active", label: "在职" },
  { value: "inactive", label: "离职" },
];

const pageSizeOptions = [
  { value: "50", label: "50条/页" },
  { value: "100", label: "100条/页" },
];

export interface PreviewToolbarProps {
  onToggleList?: () => void;
  listVisible?: boolean;
  onCreate?: () => void;
  totalLabel?: string;
  showMeta?: boolean;
  showPreviewAction?: boolean;
}

export default function PreviewToolbar({
  onToggleList,
  listVisible = true,
  onCreate,
  totalLabel = "共 343 人",
  showMeta = true,
  showPreviewAction = false,
}: PreviewToolbarProps) {
  const [keyword, setKeyword] = useState("");
  const [mode, setMode] = useState("all");
  const [field, setField] = useState("status");
  const [fieldValue, setFieldValue] = useState("");
  const [editMode, setEditMode] = useState(false);
  const viewControls = (onToggleList || onCreate) ? (
    <>
      {onToggleList && (
        <IconActionButton
          label={listVisible ? "隐藏" : "显示"}
          variant={listVisible ? "primary" : "secondary"}
          onClick={onToggleList}
        >
          ☰
        </IconActionButton>
      )}
      {onCreate && (
        <IconActionButton label="新建" variant="primary" onClick={onCreate}>
          +
        </IconActionButton>
      )}
    </>
  ) : undefined;

  return (
    <CommandToolbar
      viewControls={viewControls}
      filters={(
        <>
          <SearchInput value={keyword} onChange={setKeyword} placeholder="搜索" />
          <ToolbarOptionGroup value={mode} onChange={setMode} options={modeOptions} />
          <FieldValueFilter
            fields={fieldOptions}
            valueOptions={valueOptions}
            fieldKey={field}
            onFieldKeyChange={setField}
            value={fieldValue}
            onValueChange={setFieldValue}
          />
          <RefreshActionButton />
        </>
      )}
      selectionActions={(
        <>
          {showPreviewAction && <ActionButton>预览</ActionButton>}
          <ActionButton>导出</ActionButton>
        </>
      )}
      editActions={(
        <EditToolbar
          editMode={editMode}
          onStartEdit={() => setEditMode(true)}
          onSave={async () => setEditMode(false)}
          onCancel={() => setEditMode(false)}
          onShowHistory={() => {}}
        />
      )}
      meta={showMeta ? (
        <>
          <span>{totalLabel}</span>
          <SelectField
            options={pageSizeOptions}
            value="50"
            onChange={() => {}}
            triggerClassName="!w-[5.75rem] !min-w-[5.75rem]"
          />
        </>
      ) : undefined}
    />
  );
}
