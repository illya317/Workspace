"use client";

import { useState, type FC } from "react";
import { FormSurface } from "@workspace/core/ui";
import {
  AutoSizeTextField, CalendarDateInput, CheckboxChip, CheckboxField, ChoiceGroup,
  FieldGrid, FieldInputShell,
  FormField, FormShell, HiddenDataField, PercentField, RatingControl, ReadOnlyField,
  SearchInput, SelectField, SwitchField,
  TagInlineTextField, TextField, TextareaField, TimeField,
} from "../internal-ui";
import BlockCreatePanel from "../../ui/internal/create/BlockCreatePanel";
import InlineCreatePanel from "../../ui/internal/create/InlineCreatePanel";
import { CreateConfirmActions, CreateStartButton } from "../../ui/internal/action/CreateActionControls";
import { CreatePanelPreview } from "./create-panel-preview";
import { FileFieldPreview } from "./form-file-preview";
import { foundationFormPreviewByName } from "./form-foundation-previews";
import { SelectionGridPreview } from "./selection-grid-preview";

function AutoSizeTextFieldPreview() {
  const [text, setText] = useState("自适应宽度");
  return <div className="flex flex-col gap-2"><AutoSizeTextField value={text} onChange={(e) => setText(e.target.value)} placeholder="输入文字观察宽度" /><span className="text-xs text-slate-400">当前值：{text}</span></div>;
}

function BlockCreatePanelPreview() {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  return (
    <div className="max-w-md">
      <BlockCreatePanel title="项目阶段" creating={creating} canCreate onStartCreate={() => setCreating(true)} onSubmitCreate={() => setCreating(false)} onCancelCreate={() => { setCreating(false); setName(""); }}
        createContent={(
          <div className="flex flex-wrap items-end gap-3">
            <FormField label="阶段名称" required className="min-w-[10rem]"><TextField value={name} onChange={setName} placeholder="请输入" className="w-full" /></FormField>
            <FormField label="计划开始"><CalendarDateInput value={null} onChange={() => {}} /></FormField>
          </div>
        )}
      >
        <p className="text-xs text-slate-400">非创建态下展示已有阶段列表或占位内容。</p>
      </BlockCreatePanel>
    </div>
  );
}

function CalendarDateInputPreview() {
  const [dateValue, setDateValue] = useState<string | null>("2026-06-24");
  return <CalendarDateInput value={dateValue} onChange={setDateValue} className="max-w-xs" />;
}

function CheckboxChipPreview() {
  const [boolValue, setBoolValue] = useState<boolean>(false);
  return <div className="flex flex-wrap items-center gap-2"><CheckboxChip checked={boolValue} onChange={setBoolValue}>选项 A</CheckboxChip><CheckboxChip checked={!boolValue} onChange={() => setBoolValue((v) => !v)}>选项 B</CheckboxChip></div>;
}

function CheckboxFieldPreview() {
  const [boolValue, setBoolValue] = useState<boolean>(false);
  return <div className="flex flex-wrap items-center gap-3"><CheckboxField checked={boolValue} onChange={setBoolValue} ariaLabel="默认尺寸" /><CheckboxField checked={boolValue} onChange={setBoolValue} size="sm" ariaLabel="小尺寸" /></div>;
}

function ChoiceGroupPreview() { const [value, setValue] = useState<string | null>(null); return <ChoiceGroup value={value ?? "yes"} options={["是", "否"]} onChange={(v) => setValue(v)} />; }

function CreateConfirmActionsPreview() {
  return <div className="flex flex-wrap items-center gap-3"><CreateConfirmActions onSubmit={() => {}} onCancel={() => {}} /><CreateConfirmActions onSubmit={() => {}} onCancel={() => {}} submitDisabled /></div>;
}

function CreateStartButtonPreview() {
  const [active, setActive] = useState(false);
  return <div className="flex flex-wrap items-center gap-3"><CreateStartButton label="新增" active={active} onClick={() => setActive((v) => !v)} /><CreateStartButton label="新增" active={!active} disabled onClick={() => {}} /></div>;
}

function FormFieldPreview() {
  const [value, setValue] = useState("");
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="mb-2 text-xs font-medium text-slate-400">标签在上（stacked）</p>
        <div className="max-w-xs space-y-3">
          <FormField label="堆叠布局" required hint="这是提示文案"><TextField value={value} onChange={setValue} placeholder="请输入" className="w-full" /></FormField>
          <FormField label="错误态" error="字段不能为空"><TextField value="" onChange={() => {}} placeholder="请输入" className="w-full" /></FormField>
        </div>
      </div>
      <div>
        <p className="mb-2 text-xs font-medium text-slate-400">标签在左（inline）</p>
        <div className="flex flex-wrap items-center gap-3">
          <FormField label="行内布局" layout="inline"><TextField value={value} onChange={setValue} placeholder="请输入" /></FormField>
          <FormField label="状态" layout="inline" hint="筛选状态"><SelectField value="active" onChange={() => {}} options={[{ value: "active", label: "现用" }, { value: "archived", label: "已归档" }]} /></FormField>
        </div>
      </div>
    </div>
  );
}

function FormShellPreview() {
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [name, setName] = useState("");
  return (
    <div className="max-w-xs">
      <FormShell onSubmit={(e) => { e.preventDefault(); setSubmitted(name || "（空）"); }}>
        <FormField label="名称" required><TextField value={name} onChange={setName} placeholder="输入后提交" className="w-full" /></FormField>
        <button type="submit" className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700">提交</button>
        {submitted && <p className="text-xs text-slate-500">已提交：{submitted}</p>}
      </FormShell>
    </div>
  );
}

function FormSurfacePreview() {
  return <FormSurfaceFieldsPreview />;
}

function FormSurfaceFieldsPreview() {
  return (
    <div className="max-w-4xl">
      <FormSurface
        kind="fields"
        columns={3}
        fields={[
          {
            kind: "section",
            key: "basic",
            title: "基础信息",
            columns: 3,
            fields: [
              { key: "code", kind: "readonly", label: "项目编码", value: "保存后自动生成" },
              {
                key: "type",
                label: "项目类型",
                spec: {
                  valueType: "string",
                  control: "choice",
                  options: {
                    source: "static",
                    items: [
                      { value: "department", label: "部门项目" },
                      { value: "company", label: "公司项目" },
                    ],
                  },
                },
                value: "department",
              },
              { key: "owner", kind: "readonly", label: "负责人", value: "未设置" },
              { key: "name", label: "项目名称", required: true, spec: { valueType: "string", control: "text" }, value: "" },
              { key: "start", label: "计划开始", spec: { valueType: "date", control: "temporal", precision: "date" }, value: null, placeholder: "选择日期" },
              { key: "end", label: "计划结束", spec: { valueType: "date", control: "temporal", precision: "date" }, value: null, placeholder: "选择日期" },
            ],
          },
          {
            kind: "repeatable",
            key: "duties",
            title: "主要职责",
            columns: 2,
            items: [
              {
                key: "duty-1",
                title: "职责 1",
                actions: [{ key: "delete-duty", label: "删除", icon: "delete-bin", variant: "danger", size: "sm" }],
                fields: [
                  { key: "title", label: "职责标题", spec: { valueType: "string", control: "text" }, value: "制定计划" },
                  { key: "owner", label: "负责人", spec: { valueType: "string", control: "text" }, value: "未设置" },
                ],
              },
            ],
          },
        ]}
      />
    </div>
  );
}

function ReadOnlyFieldPreview() {
  const [clicked, setClicked] = useState(false);
  return (
    <div className="max-w-sm space-y-3">
      <ReadOnlyField value="input-like 只读值" />
      <ReadOnlyField value="plain 只读值" variant="plain" />
      <ReadOnlyField value="可点击只读字段" onClick={() => setClicked((v) => !v)} />
      {clicked && <span className="text-xs text-slate-400">已点击</span>}
    </div>
  );
}

function FieldInputShellPreview() {
  const [value, setValue] = useState("50");
  return (
    <div className="max-w-xs space-y-3">
      <FieldInputShell suffix="%" className="focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500">
        <TextField value={value} onChange={setValue} unstyled className="h-9 flex-1 border-0 bg-transparent px-3 py-0 text-sm outline-none" />
      </FieldInputShell>
      <FieldInputShell prefix="¥" className="focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500">
        <TextField value={value} onChange={setValue} unstyled className="h-9 flex-1 border-0 bg-transparent px-3 py-0 text-sm outline-none" />
      </FieldInputShell>
    </div>
  );
}

function PercentFieldPreview() {
  const [value, setValue] = useState<number | null>(75);
  return <div className="max-w-xs"><PercentField value={value} onChange={setValue} /></div>;
}

function FieldGridPreview() {
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <FieldGrid.GroupTitle>基础资料（编辑态）</FieldGrid.GroupTitle>
        <FieldGrid columns={2} mode="mixed">
          <FieldGrid.Cell label="姓名" required><TextField value="张三" onChange={() => {}} /></FieldGrid.Cell>
          <FieldGrid.Cell label="员工编码"><ReadOnlyField value="EMP001" /></FieldGrid.Cell>
          <FieldGrid.Cell label="完成度"><PercentField value={85} onChange={() => {}} /></FieldGrid.Cell>
          <FieldGrid.Cell label="入职日期"><CalendarDateInput value="2026-06-24" onChange={() => {}} /></FieldGrid.Cell>
          <FieldGrid.Cell label="备注" span="wide" hint="跨列字段的短提示"><TextareaField value="跨列字段" onChange={() => {}} /></FieldGrid.Cell>
          <FieldGrid.Note>整行说明：长说明应使用 FieldGrid.Note，避免把长文本塞进单个 cell 的 hint 撑高行。</FieldGrid.Note>
        </FieldGrid>
      </div>
      <div>
        <FieldGrid.GroupTitle>基础资料（只读态）</FieldGrid.GroupTitle>
        <FieldGrid columns={3} mode="view">
          <FieldGrid.Cell label="项目编码"><ReadOnlyField value="PRJ-2026-001" /></FieldGrid.Cell>
          <FieldGrid.Cell label="项目类型"><ReadOnlyField value="公司项目" /></FieldGrid.Cell>
          <FieldGrid.Cell label="项目级别"><ReadOnlyField value="普通" /></FieldGrid.Cell>
          <FieldGrid.Cell label="项目描述" span="wide"><ReadOnlyField value="跨列的只读描述信息" /></FieldGrid.Cell>
        </FieldGrid>
      </div>
    </div>
  );
}

function TagInlineTextFieldPreview() {
  const [value, setValue] = useState("");
  return <div className="max-w-sm rounded-md border border-sky-200 bg-white px-2 py-1 shadow-sm"><TagInlineTextField value={value} onChange={setValue} placeholder="输入新标签…" /></div>;
}

function HiddenDataFieldPreview() { return <div className="space-y-2"><p className="text-xs text-slate-400">HiddenDataField 渲染为不可见 input，DOM 中保留 data-field-key</p><HiddenDataField fieldKey="recordId" value="12345" /><p className="text-xs text-slate-500">已渲染 recordId=12345 的隐藏字段（检查 DOM 可见）</p></div>; }

function InlineCreatePanelPreview() {
  const [name, setName] = useState("");
  const [submitted, setSubmitted] = useState<string | null>(null);
  return (
    <div className="max-w-2xl">
      <InlineCreatePanel title="新增员工" onSubmit={() => setSubmitted(name || "（空）")} onCancel={() => { setName(""); setSubmitted(null); }}>
        <FormField label="姓名" required><TextField value={name} onChange={setName} placeholder="输入姓名" /></FormField>
        <FormField label="部门"><SelectField value="" onChange={() => {}} options={[{ value: "", label: "请选择" }, { value: "hr", label: "人力资源" }, { value: "it", label: "信息技术" }]} /></FormField>
      </InlineCreatePanel>
      {submitted && <p className="mt-2 text-xs text-slate-500">尝试创建：{submitted}</p>}
    </div>
  );
}

function RatingControlPreview() { const [rating, setRating] = useState<number>(3); return <RatingControl value={rating} onChange={setRating} max={5} label="重要度" />; }

function SearchInputPreview() {
  const [value, setValue] = useState("");
  return <SearchInput value={value} onChange={setValue} placeholder="搜索..." />;
}

function SelectFieldPreview() {
  const [value, setValue] = useState("");
  const [multiValue, setMultiValue] = useState<string[]>(["hr", "it"]);
  const options = [{ value: "active", label: "现用" }, { value: "archived", label: "已归档" }, { value: "all", label: "全部" }];
  const multiOptions = [
    { value: "hr", label: "人力资源" },
    { value: "it", label: "信息技术" },
    { value: "finance", label: "财务" },
    { value: "production", label: "生产" },
    { value: "qa", label: "质量" },
  ];
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="text-xs text-slate-400">单选</p>
        <SelectField label="状态" options={options} value={value} onChange={setValue} placeholder="请选择" />
        <p className="text-xs text-slate-400">选中值：{value || "无"}</p>
      </div>
      <div className="space-y-1">
        <p className="text-xs text-slate-400">多选</p>
        <SelectField multiple label="部门" options={multiOptions} value={multiValue} onChange={setMultiValue} placeholder="请选择" />
        <p className="text-xs text-slate-400">选中值：{multiValue.join("、") || "无"}</p>
      </div>
    </div>
  );
}

function SwitchFieldPreview() { const [boolValue, setBoolValue] = useState<boolean>(false); return <SwitchField checked={boolValue} onChange={setBoolValue} ariaLabel="启用开关" />; }

function TextareaFieldPreview() { const [text, setText] = useState<string>(""); return <TextareaField value={text} onChange={setText} placeholder="请输入多行文本" className="max-w-xs" />; }

function TextFieldPreview() {
  const [text, setText] = useState<string>("");
  const [amount, setAmount] = useState<string>("12");
  return <div className="flex flex-col gap-3"><TextField value={text} onChange={setText} placeholder="请输入文本" className="max-w-xs" /><TextField type="number" value={amount} onChange={setAmount} className="max-w-xs" /></div>;
}

function TimeFieldPreview() {
  const [time, setTime] = useState<string | null>("09:30");
  return <TimeField value={time} onChange={setTime} className="max-w-[8rem]" />;
}

export const formPreviewByName: Record<string, FC> = {
  AutoSizeTextField: AutoSizeTextFieldPreview, BlockCreatePanel: BlockCreatePanelPreview, CalendarDateInput: CalendarDateInputPreview,
  CheckboxChip: CheckboxChipPreview, CheckboxField: CheckboxFieldPreview, ChoiceGroup: ChoiceGroupPreview,
  CreateConfirmActions: CreateConfirmActionsPreview, CreatePanel: CreatePanelPreview, CreateStartButton: CreateStartButtonPreview, FileField: FileFieldPreview,
  FieldGrid: FieldGridPreview, FieldInputShell: FieldInputShellPreview, FormField: FormFieldPreview, FormShell: FormShellPreview, FormSurface: FormSurfacePreview,
  FormSurfaceFields: FormSurfaceFieldsPreview,
  ...foundationFormPreviewByName,
  HiddenDataField: HiddenDataFieldPreview, InlineCreatePanel: InlineCreatePanelPreview,
  PercentField: PercentFieldPreview, RatingControl: RatingControlPreview, ReadOnlyField: ReadOnlyFieldPreview, SearchInput: SearchInputPreview,
  SelectField: SelectFieldPreview, SelectionGrid: SelectionGridPreview, SwitchField: SwitchFieldPreview, TagInlineTextField: TagInlineTextFieldPreview,
  TextareaField: TextareaFieldPreview, TextField: TextFieldPreview,
  TimeField: TimeFieldPreview,
};
