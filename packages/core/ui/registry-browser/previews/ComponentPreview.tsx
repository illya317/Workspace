import type { ReactNode } from "react";
import CalendarDateInput from "../../CalendarDateInput";
import ChoiceGroup from "../../ChoiceGroup";
import CheckboxField from "../../CheckboxField";
import { PanelCard, SelectorCard } from "../../Card";
import DataTable from "../../DataTable";
import FieldValueFilter from "../../FieldValueFilter";
import FormField from "../../FormField";
import InlineCreatePanel from "../../InlineCreatePanel";
import OptionPicker from "../../OptionPicker";
import Pagination from "../../Pagination";
import SearchInput from "../../SearchInput";
import SearchableOptionInput from "../../SearchableOptionInput";
import SelectField from "../../SelectField";
import Badge from "../../Badge";
import SwitchField from "../../SwitchField";
import TextareaField from "../../TextareaField";
import TextField from "../../TextField";
import TimeField from "../../TimeField";
import ToolbarOptionGroup from "../../ToolbarOptionGroup";
import { PreviewFrame } from "../PreviewFrame";
import type { RegistryBrowserItem } from "../types";
import {
  ConfirmPreview,
  DetailPreview,
  EntitySearchPreview,
  MiniButton,
  MiniField,
  PreviewNote,
} from "./PreviewBits";
import { LayoutPreview } from "./LayoutPreviews";
import { ToolbarPreview } from "./ToolbarPreviews";

export function ComponentPreview({ item }: { item: RegistryBrowserItem }) {
  const tableRows = [{ id: 1, name: "示例行", status: "已启用" }];
  const tableColumns = [
    { key: "name", label: "名称", required: true, render: (row: typeof tableRows[number]) => row.name },
    { key: "status", label: "状态", required: true, render: (row: typeof tableRows[number]) => row.status },
  ];

  let preview: ReactNode;

  switch (item.name) {
    case "SearchInput":
      preview = <SearchInput value="张" onChange={() => {}} placeholder="搜索姓名、编码、拼音" />;
      break;
    case "TextField":
      preview = <TextField value="张慧君" onChange={() => {}} placeholder="输入文本" />;
      break;
    case "TextareaField":
      preview = <TextareaField value="适合多行备注和说明。" onChange={() => {}} rows={3} />;
      break;
    case "SelectField":
      preview = (
        <SelectField
          value="active"
          onChange={() => {}}
          options={[{ value: "active", label: "现用" }, { value: "archived", label: "已归档" }]}
        />
      );
      break;
    case "SearchableOptionInput":
      preview = (
        <SearchableOptionInput
          value="VU管理学院"
          onChange={() => {}}
          options={[
            { value: "VU管理学院", searchText: "vu guanli xueyuan" },
            { value: "复旦大学", searchText: "fudan daxue" },
          ]}
          placeholder="搜索学校"
        />
      );
      break;
    case "FieldValueFilter":
      preview = (
        <FieldValueFilter
          fieldKey="status"
          onFieldKeyChange={() => {}}
          value="active"
          onValueChange={() => {}}
          fields={[{ value: "status", label: "状态" }, { value: "department", label: "部门" }]}
          valueOptions={{
            status: [{ value: "active", label: "现用" }, { value: "archived", label: "已归档" }],
            department: [{ value: "prod", label: "生产部" }, { value: "qc", label: "质检部" }],
          }}
        />
      );
      break;
    case "CalendarDateInput":
      preview = <CalendarDateInput value="2026-06-20" onChange={() => {}} />;
      break;
    case "TimeField":
      preview = <TimeField value="09:30" onChange={() => {}} className="max-w-[8rem]" />;
      break;
    case "ChoiceGroup":
      preview = (
        <ChoiceGroup
          value="在职"
          onChange={() => {}}
          options={["全部", "在职", "离职"]}
          className="inline-flex gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1"
          optionClassName="inline-flex min-h-8 items-center gap-1 rounded-md px-3 text-xs font-semibold text-slate-600 has-[:checked]:bg-emerald-600 has-[:checked]:text-white"
          markerClassName="hidden"
        />
      );
      break;
    case "CheckboxField":
      preview = <CheckboxField checked onChange={() => {}} ariaLabel="示例复选" />;
      break;
    case "SwitchField":
      preview = <SwitchField checked onChange={() => {}} />;
      break;
    case "Badge":
      preview = <Badge label="已启用" tone="green" />;
      break;
    case "Pagination":
      preview = <Pagination page={2} totalPages={5} total={48} onPageChange={() => {}} compact />;
      break;
    case "MetricCard":
      preview = <LayoutPreview variant="analysis" />;
      break;
    case "PanelCard":
    case "SectionCard":
      preview = (
        <PanelCard title="面板标题" subtitle="面板说明" bodyClassName="p-3">
          <div className="grid grid-cols-2 gap-2">
            <MiniField label="字段 A" value="已填写" />
            <MiniField label="字段 B" value="待确认" />
          </div>
        </PanelCard>
      );
      break;
    case "DataTable":
      preview = <DataTable rows={tableRows} columns={tableColumns} visibleColumns={[]} density="compact" rowKey={(row) => row.id} />;
      break;
    case "AmountCell":
      preview = <span className="font-mono text-sm font-semibold text-slate-900">¥ 12,800.00</span>;
      break;
    case "NumberCell":
      preview = <span className="font-mono text-sm font-semibold text-slate-900">1,280</span>;
      break;
    case "Toolbar":
    case "PageToolbar":
      preview = <ToolbarPreview variant="full" />;
      break;
    case "FilterToolbar":
    case "FilterBar":
    case "CommandToolbar":
      preview = <ToolbarPreview variant="filter" />;
      break;
    case "ActionToolbar":
      preview = <ToolbarPreview variant="action" />;
      break;
    case "ActionButton":
      preview = <MiniButton primary>+</MiniButton>;
      break;
    case "ToolbarOptionGroup":
      preview = (
        <ToolbarOptionGroup
          value="active"
          onChange={() => {}}
          options={[{ value: "all", label: "全部" }, { value: "active", label: "现用" }, { value: "archived", label: "归档" }]}
        />
      );
      break;
    case "getToolbarActionClassName":
      preview = <ActionClassPreview />;
      break;
    case "EditToolbar":
      preview = <ToolbarPreview variant="edit" />;
      break;
    case "SplitWorkspaceToolbar":
      preview = <ToolbarPreview variant="split" />;
      break;
    case "ConfirmModal":
      preview = <ConfirmPreview />;
      break;
    case "ConfirmProvider":
      preview = <PreviewNote title="统一确认入口">页面调用 confirm()，实际弹窗由 Provider 统一挂载，避免业务页手写 window.confirm。</PreviewNote>;
      break;
    case "DetailModal":
      preview = <DetailPreview />;
      break;
    case "FkFieldInput":
      preview = <EntitySearchPreview mode="single" />;
      break;
    case "OptionPicker":
      preview = <OptionPreview />;
      break;
    case "PickerShell":
      preview = <EntitySearchPreview mode="multiple" />;
      break;
    case "SelectorCard":
      preview = <SelectorPreview />;
      break;
    case "PageContent":
    case "PageShell":
      preview = <LayoutPreview variant="page" />;
      break;
    case "ModuleCardBody":
    case "ModuleGridPage":
      preview = <LayoutPreview variant="module" />;
      break;
    case "SplitWorkspace":
      preview = <LayoutPreview variant="split" />;
      break;
    case "TreeNodeBranch":
    case "TreeNodeCard":
      preview = <LayoutPreview variant="tree" />;
      break;
    case "EmptyStateCard":
      preview = <LayoutPreview variant="empty" />;
      break;
    case "AnalysisBlock":
      preview = <LayoutPreview variant="analysis" />;
      break;
    case "InlineCreatePanel":
      preview = <InlineCreatePreview />;
      break;
    case "CreatePanel":
      preview = <PreviewNote title="CreatePanel">通过 variant 选择 inline / block / modal，内部复用已有创建面板。</PreviewNote>;
      break;
    default:
      preview = <PreviewNote title={item.name}>{item.example}</PreviewNote>;
  }

  return <PreviewFrame>{preview}</PreviewFrame>;
}

function ActionClassPreview() {
  return (
    <div className="flex flex-wrap gap-2">
      <MiniButton primary>主操作</MiniButton>
      <MiniButton>次操作</MiniButton>
      <MiniButton danger>危险操作</MiniButton>
    </div>
  );
}

function OptionPreview() {
  return (
    <OptionPicker
      value="doctor"
      onChange={() => {}}
      options={[
        { value: "doctor", label: "博士" },
        { value: "master", label: "硕士" },
        { value: "bachelor", label: "本科" },
        { value: "college", label: "大专" },
        { value: "other", label: "其他" },
      ]}
      visibleCount={5}
    />
  );
}

function SelectorPreview() {
  return (
    <SelectorCard
      title="张云"
      subtitle="员工 · E-1024"
      active
      meta={[{ label: "部门", value: "生产部" }, { label: "状态", value: "现用" }]}
    />
  );
}

function InlineCreatePreview() {
  return (
    <InlineCreatePanel
      title="快速新建"
      onSubmit={() => {}}
      onCancel={() => {}}
    >
      <FormField label="名称" required className="w-64">
        <TextField value="" onChange={() => {}} placeholder="输入名称" />
      </FormField>
      <FormField label="状态" required className="w-56">
        <SelectField
          value="active"
          onChange={() => {}}
          options={[{ value: "active", label: "现用" }, { value: "draft", label: "草稿" }]}
        />
      </FormField>
    </InlineCreatePanel>
  );
}
