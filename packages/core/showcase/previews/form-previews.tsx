"use client";

import { useState, type FC } from "react";
import {
  AutoSizeTextField, BlockCreatePanel, CalendarDateInput, CheckboxChip, CheckboxField, ChoiceGroup,
  CreateConfirmActions, CreateStartButton, FileField, FormField, FormShell, HiddenDataField,
  InlineCreatePanel, RemovableTag, RatingControl, SearchInput, SelectField, SwitchField,
  TagPillButton, TagRemoveButton, TextField, TextareaField,
} from "@workspace/core/ui";

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

function CalendarDateInputPreview() { const [dateValue, setDateValue] = useState<string | null>("2026-06-24"); return <CalendarDateInput value={dateValue} onChange={setDateValue} className="max-w-xs" />; }

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
  return <div className="flex flex-wrap items-center gap-3"><CreateConfirmActions onSubmit={() => {}} onCancel={() => {}} /><CreateConfirmActions onSubmit={() => {}} onCancel={() => {}} order="cancel-first" submitDisabled /></div>;
}

function CreateStartButtonPreview() {
  const [active, setActive] = useState(false);
  return <div className="flex flex-wrap items-center gap-3"><CreateStartButton label="新增" active={active} onClick={() => setActive((v) => !v)} /><CreateStartButton label="新增" active={!active} disabled onClick={() => {}} /></div>;
}

function FileFieldPreview() {
  const [file, setFile] = useState<File | null>(null);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [paperFiles, setPaperFiles] = useState<File[]>([]);
  return (
    <div className="space-y-4">
      <div className="space-y-2"><span className="text-xs font-medium text-slate-600">默认单文件</span><FileField label="选择文件" onChange={setFile} />{file && <span className="text-xs text-slate-500">已选：{file.name}</span>}</div>
      <div className="space-y-2"><span className="text-xs font-medium text-slate-600">多文件图片</span><FileField accept="image/*" multiple buttonLabel="选择图片" resetOnChange onChange={() => {}} onFilesChange={(files) => setImageFiles(files ? Array.from(files) : [])} />{imageFiles.length > 0 && <ul className="text-xs text-slate-500">{imageFiles.map((f) => <li key={f.name}>· {f.name}</li>)}</ul>}</div>
      <div className="space-y-2">
        <span className="text-xs font-medium text-slate-600">内联纸面触发样式</span>
        <div className="text-sm text-slate-700">点击<FileField buttonLabel="此处上传附件" showFileName={false} resetOnChange className="inline text-inherit" controlsClassName="inline" inputClassName="inline cursor-pointer bg-transparent p-0 text-left align-baseline text-inherit outline-none disabled:cursor-default" onChange={() => {}} onFilesChange={(files) => setPaperFiles(files ? Array.from(files) : [])} />上传记录。</div>
        {paperFiles.length > 0 && <ul className="text-xs text-slate-500">{paperFiles.map((f) => <li key={f.name}>· {f.name}</li>)}</ul>}
      </div>
    </div>
  );
}

function FormFieldPreview() {
  const [value, setValue] = useState("");
  return (
    <div className="flex flex-col gap-4">
      <div className="max-w-xs space-y-3">
        <FormField label="堆叠布局" required hint="这是提示文案"><TextField value={value} onChange={setValue} placeholder="请输入" className="w-full" /></FormField>
        <FormField label="错误态" error="字段不能为空"><TextField value="" onChange={() => {}} placeholder="请输入" className="w-full" /></FormField>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <FormField label="行内布局" layout="inline"><SelectField value="all" onChange={() => {}} options={[{ value: "all", label: "全部" }, { value: "active", label: "进行中" }]} /></FormField>
        <FormField label="状态" layout="inline" hint="筛选状态"><SelectField value="active" onChange={() => {}} options={[{ value: "active", label: "现用" }, { value: "archived", label: "已归档" }]} /></FormField>
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

function foundationPreview(name: string, description: string) {
  return function FoundationPreview() { return <div className="text-xs text-slate-400"><p className="font-medium">{name}</p><p>{description}</p><p className="mt-1 text-slate-300">Foundation / 样式 recipe，无运行时组件预览。</p></div>; };
}
const getFieldInputClassNamePreview = foundationPreview("getFieldInputClassName", "字段输入框样式 token，用于少量需要业务自渲染输入的场景。");
const getFieldGridCellClassNamePreview = foundationPreview("getFieldGridCellClassName", "字段网格单元样式 token，用于自渲染字段网格时保持统一边框、背景和间距。");
const getFieldGridLabelClassNamePreview = foundationPreview("getFieldGridLabelClassName", "字段网格 label 样式 token，用于自渲染字段网格时统一标签列视觉。");
const getFieldGridValueClassNamePreview = foundationPreview("getFieldGridValueClassName", "字段网格值区域样式 token，用于自渲染字段网格时统一值区布局。");
const getFieldGroupTitleClassNamePreview = foundationPreview("getFieldGroupTitleClassName", "字段分组标题样式 token，用于表单详情页的分组标题。");
const getReadOnlyFieldClassNamePreview = foundationPreview("getReadOnlyFieldClassName", "只读字段样式 token，用于展示不可编辑但仍属于表单布局的字段。");
const getTagInputShellClassNamePreview = foundationPreview("getTagInputShellClassName", "标签输入外壳样式 token，统一 Tag 输入容器焦点和边框状态。");
const getTagInlineInputClassNamePreview = foundationPreview("getTagInlineInputClassName", "标签内联输入样式 token，用于 chip 输入末尾的轻量文本输入。");
const getTagPillClassNamePreview = foundationPreview("getTagPillClassName", "标签项样式 token，统一别名、标签和可删除 chip 外观。");

function HiddenDataFieldPreview() { return <div className="space-y-2"><p className="text-xs text-slate-400">HiddenDataField 渲染为不可见 input，DOM 中保留 data-field-key</p><HiddenDataField fieldKey="recordId" value="12345" /><p className="text-xs text-slate-500">已渲染 recordId=12345 的隐藏字段（检查 DOM 可见）</p></div>; }

function InlineCreatePanelPreview() {
  const [name, setName] = useState("");
  const [submitted, setSubmitted] = useState<string | null>(null);
  return (
    <div className="max-w-2xl">
      <InlineCreatePanel title="新增员工" onSubmit={() => setSubmitted(name || "（空）")} onCancel={() => { setName(""); setSubmitted(null); }}>
        <FormField label="姓名" required><TextField value={name} onChange={setName} placeholder="输入姓名" className="w-40" /></FormField>
        <FormField label="部门"><SelectField value="" onChange={() => {}} options={[{ value: "", label: "请选择" }, { value: "hr", label: "人力资源" }, { value: "it", label: "信息技术" }]} className="w-40" /></FormField>
      </InlineCreatePanel>
      {submitted && <p className="mt-2 text-xs text-slate-500">尝试创建：{submitted}</p>}
    </div>
  );
}

function RemovableTagPreview() {
  const [tags, setTags] = useState(["重点项目", "GMP", "长期客户"]);
  return <div className="flex flex-wrap items-center gap-2">{tags.map((tag) => <RemovableTag key={tag} label={`删除 ${tag}`} onRemove={() => setTags((prev) => prev.filter((t) => t !== tag))} confirmMessage={`确定删除标签「${tag}」？`}>{tag}</RemovableTag>)}</div>;
}

function RatingControlPreview() { const [rating, setRating] = useState<number>(3); return <RatingControl value={rating} onChange={setRating} max={5} label="重要度" />; }

function SearchInputPreview() {
  const [page, setPage] = useState("");
  const [toolbar, setToolbar] = useState("");
  const [compact, setCompact] = useState("");
  return <div className="flex flex-col gap-2"><SearchInput value={page} onChange={setPage} size="page" placeholder="页面级搜索..." /><SearchInput value={toolbar} onChange={setToolbar} size="toolbar" placeholder="工具栏搜索..." /><SearchInput value={compact} onChange={setCompact} size="compact" placeholder="紧凑搜索..." /></div>;
}

function SelectFieldPreview() {
  const [value, setValue] = useState("");
  const options = [{ value: "active", label: "现用" }, { value: "archived", label: "已归档" }, { value: "all", label: "全部" }];
  return <div className="space-y-3"><SelectField label="状态" options={options} value={value} onChange={setValue} placeholder="请选择" /><span className="text-xs text-slate-400">选中值：{value || "无"}</span></div>;
}

function SwitchFieldPreview() { const [boolValue, setBoolValue] = useState<boolean>(false); return <SwitchField checked={boolValue} onChange={setBoolValue} ariaLabel="启用开关" />; }

function TagPillButtonPreview() { return <div className="flex flex-wrap items-center gap-2"><TagPillButton onClick={() => {}}>可点击标签</TagPillButton><TagPillButton onClick={() => {}}>长文本标签会自动省略显示</TagPillButton><TagPillButton onClick={() => {}} disabled>禁用标签</TagPillButton></div>; }

function TagRemoveButtonPreview() { return <div className="flex flex-wrap items-center gap-2"><span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700">标签示例 <TagRemoveButton label="删除标签" confirm={false} onClick={() => {}} /></span></div>; }

function TextareaFieldPreview() { const [text, setText] = useState<string>(""); return <TextareaField value={text} onChange={setText} placeholder="请输入多行文本" className="max-w-xs" />; }

function TextFieldPreview() {
  const [text, setText] = useState<string>("");
  const [datetime, setDatetime] = useState<string>("2026-06-24T09:00");
  return <div className="flex flex-col gap-3"><TextField value={text} onChange={setText} placeholder="请输入文本" className="max-w-xs" /><div className="space-y-1"><TextField type="datetime-local" value={datetime} onChange={setDatetime} className="max-w-xs" /><span className="text-xs text-slate-400">当前值：{datetime}</span></div></div>;
}

export const formPreviewByName: Record<string, FC> = {
  AutoSizeTextField: AutoSizeTextFieldPreview, BlockCreatePanel: BlockCreatePanelPreview, CalendarDateInput: CalendarDateInputPreview,
  CheckboxChip: CheckboxChipPreview, CheckboxField: CheckboxFieldPreview, ChoiceGroup: ChoiceGroupPreview,
  CreateConfirmActions: CreateConfirmActionsPreview, CreateStartButton: CreateStartButtonPreview, FileField: FileFieldPreview,
  FormField: FormFieldPreview, FormShell: FormShellPreview,
  getFieldInputClassName: getFieldInputClassNamePreview, getFieldGridCellClassName: getFieldGridCellClassNamePreview,
  getFieldGridLabelClassName: getFieldGridLabelClassNamePreview, getFieldGridValueClassName: getFieldGridValueClassNamePreview,
  getFieldGroupTitleClassName: getFieldGroupTitleClassNamePreview, getReadOnlyFieldClassName: getReadOnlyFieldClassNamePreview,
  getTagInputShellClassName: getTagInputShellClassNamePreview, getTagInlineInputClassName: getTagInlineInputClassNamePreview,
  getTagPillClassName: getTagPillClassNamePreview, HiddenDataField: HiddenDataFieldPreview, InlineCreatePanel: InlineCreatePanelPreview,
  RemovableTag: RemovableTagPreview, RatingControl: RatingControlPreview, SearchInput: SearchInputPreview,
  SelectField: SelectFieldPreview, SwitchField: SwitchFieldPreview, TagPillButton: TagPillButtonPreview,
  TagRemoveButton: TagRemoveButtonPreview, TextareaField: TextareaFieldPreview, TextField: TextFieldPreview,
};
