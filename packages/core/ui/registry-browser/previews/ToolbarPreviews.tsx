import { ActionToolbar } from "../../ActionControls";
import EditToolbar from "../../EditToolbar";
import FilterToolbar from "../../FilterToolbar";
import SelectField from "../../SelectField";
import { MiniButton } from "./PreviewBits";

export function ToolbarPreview({ variant }: { variant: "filter" | "action" | "edit" | "split" }) {
  if (variant === "filter") {
    return (
      <FilterToolbar
        keyword="张"
        onKeywordChange={() => {}}
        searchPlaceholder="搜索姓名、编码"
        pageSize={50}
        onPageSizeChange={() => {}}
        searchClassName="sm:w-48"
      >
        <SelectField
          value="active"
          onChange={() => {}}
          options={[
            { value: "active", label: "现用" },
            { value: "archived", label: "已归档" },
          ]}
        />
      </FilterToolbar>
    );
  }

  if (variant === "action") {
    return (
      <ActionToolbar
        leftSlot={<span className="text-sm font-semibold text-slate-800">已选择 2 条记录</span>}
        secondaryActions={[{ label: "导出" }]}
        primaryActions={[{ label: "新增" }]}
      />
    );
  }

  if (variant === "edit") {
    return (
      <EditToolbar
        editMode
        onStartEdit={() => {}}
        onSave={async () => {}}
        onCancel={() => {}}
        onShowHistory={() => {}}
      />
    );
  }

  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-3">
      <span className="text-sm font-semibold text-slate-900">左侧列表</span>
      <div className="flex gap-2">
        <MiniButton>收起</MiniButton>
        <MiniButton primary>保存详情</MiniButton>
      </div>
    </div>
  );
}
