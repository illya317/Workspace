import ActionToolbar from "../../ActionToolbar";
import EditToolbar from "../../EditToolbar";
import FilterToolbar from "../../FilterToolbar";
import PageToolbar from "../../PageToolbar";
import SelectField from "../../SelectField";
import { MiniButton } from "./PreviewBits";

export function ToolbarPreview({ variant }: { variant: "filter" | "action" | "edit" | "split" | "full" }) {
  if (variant === "full") {
    return (
      <PageToolbar
        onCreate={() => {}}
        onToggleList={() => {}}
        listVisible
        optionGroups={[{ value: "all", options: [{ value: "all", label: "全部" }, { value: "active", label: "现用" }, { value: "done", label: "已完成" }], onChange: () => {}, ariaLabel: "状态" }]}
        actions={[{ label: "导出", icon: "download" }, { label: "删除", icon: "delete-bin", variant: "danger" }]}
        editProps={{ editMode: false, onStartEdit: async () => {}, onSave: async () => {}, onCancel: () => {} }}
        meta={<>共 86 条</>}
      />
    );
  }

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
        secondaryActions={[{ label: "导出", kind: "download" }]}
        primaryActions={[{ label: "新增", kind: "add" }]}
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
