"use client";

import { useState, type FC } from "react";
import {
  AutoSizeTextField,
  CalendarDateInput,
  CheckboxChip,
  CheckboxField,
  ChoiceGroup,
  FileField,
  RatingControl,
  SearchInput,
  SelectField,
  SwitchField,
  TagRemoveButton,
  TextField,
  TextareaField,
} from "@workspace/core/ui";

function AutoSizeTextFieldPreview() {
  const [text, setText] = useState("自适应宽度");
  return (
    <div className="flex flex-col gap-2">
      <AutoSizeTextField value={text} onChange={(e) => setText(e.target.value)} placeholder="输入文字观察宽度" />
      <span className="text-xs text-slate-400">当前值：{text}</span>
    </div>
  );
}

function BlockCreatePanelPreview() {
    return <div className="text-xs text-slate-400"><p className="font-medium">BlockCreatePanel</p><p>块状新建模式，用于需要多行或多字段的新建表单；标题旁只承载 +、取消和确认动作，编辑入口应放到行级 DataTable actions。</p><p className="mt-1 text-slate-300">实时预览待补充。</p></div>;
}

function CalendarDateInputPreview() {
  const [dateValue, setDateValue] = useState<string | null>("2026-06-24");
  return (
<CalendarDateInput value={dateValue} onChange={setDateValue} className="max-w-xs" />
  );
}

function CheckboxChipPreview() {
  const [boolValue, setBoolValue] = useState<boolean>(false);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <CheckboxChip checked={boolValue} onChange={setBoolValue}>选项 A</CheckboxChip>
      <CheckboxChip checked={!boolValue} onChange={() => setBoolValue((v) => !v)}>选项 B</CheckboxChip>
    </div>
  );
}

function CheckboxFieldPreview() {
  const [boolValue, setBoolValue] = useState<boolean>(false);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <CheckboxField checked={boolValue} onChange={setBoolValue} ariaLabel="默认尺寸" />
      <CheckboxField checked={boolValue} onChange={setBoolValue} size="sm" ariaLabel="小尺寸" />
    </div>
  );
}

function ChoiceGroupPreview() {
  const [value, setValue] = useState<string | null>(null);
  return (
    <ChoiceGroup
      value={value ?? "yes"}
      options={["是", "否"]}
      onChange={(v) => setValue(v)}
    />
  );
}

function CreateConfirmActionsPreview() {
    return <div className="text-xs text-slate-400"><p className="font-medium">CreateConfirmActions</p><p>新建模式的确认/取消图标动作 primitive，供 InlineCreatePanel、BlockCreatePanel 和工具条新建态共享。</p><p className="mt-1 text-slate-300">实时预览待补充。</p></div>;
}

function CreateStartButtonPreview() {
    return <div className="text-xs text-slate-400"><p className="font-medium">CreateStartButton</p><p>新建模式的 + 入口 primitive，统一普通态、激活态和禁用态。</p><p className="mt-1 text-slate-300">实时预览待补充。</p></div>;
}

function FileFieldPreview() {
  const [file, setFile] = useState<File | null>(null);
  return (
    <div className="space-y-3">
      <FileField label="选择文件" onChange={setFile} />
      {file && <span className="text-xs text-slate-500">已选：{file.name}</span>}
    </div>
  );
}

function FormFieldPreview() {
    return <div className="text-xs text-slate-400"><p className="font-medium">FormField</p><p>表单字段容器，统一 label、必填星号、提示和错误位置，支持表单纵向和筛选条横向布局。</p><p className="mt-1 text-slate-300">实时预览待补充。</p></div>;
}

function FormShellPreview() {
    return <div className="text-xs text-slate-400"><p className="font-medium">FormShell</p><p>语义表单外壳，统一 submit 入口，让业务和 Platform 不直接手写原生 form。</p><p className="mt-1 text-slate-300">实时预览待补充。</p></div>;
}

function getFieldInputClassNamePreview() {
    return <div className="text-xs text-slate-400"><p className="font-medium">getFieldInputClassName</p><p>字段输入框样式 token，用于少量需要业务自渲染输入的场景。</p><p className="mt-1 text-slate-300">Foundation / 样式 recipe，无运行时组件预览。</p></div>;
}

function getFieldGridCellClassNamePreview() {
    return <div className="text-xs text-slate-400"><p className="font-medium">getFieldGridCellClassName</p><p>字段网格单元样式 token，用于自渲染字段网格时保持统一边框、背景和间距。</p><p className="mt-1 text-slate-300">Foundation / 样式 recipe，无运行时组件预览。</p></div>;
}

function getFieldGridLabelClassNamePreview() {
    return <div className="text-xs text-slate-400"><p className="font-medium">getFieldGridLabelClassName</p><p>字段网格 label 样式 token，用于自渲染字段网格时统一标签列视觉。</p><p className="mt-1 text-slate-300">Foundation / 样式 recipe，无运行时组件预览。</p></div>;
}

function getFieldGridValueClassNamePreview() {
    return <div className="text-xs text-slate-400"><p className="font-medium">getFieldGridValueClassName</p><p>字段网格值区域样式 token，用于自渲染字段网格时统一值区布局。</p><p className="mt-1 text-slate-300">Foundation / 样式 recipe，无运行时组件预览。</p></div>;
}

function getFieldGroupTitleClassNamePreview() {
    return <div className="text-xs text-slate-400"><p className="font-medium">getFieldGroupTitleClassName</p><p>字段分组标题样式 token，用于表单详情页的分组标题。</p><p className="mt-1 text-slate-300">Foundation / 样式 recipe，无运行时组件预览。</p></div>;
}

function getReadOnlyFieldClassNamePreview() {
    return <div className="text-xs text-slate-400"><p className="font-medium">getReadOnlyFieldClassName</p><p>只读字段样式 token，用于展示不可编辑但仍属于表单布局的字段。</p><p className="mt-1 text-slate-300">Foundation / 样式 recipe，无运行时组件预览。</p></div>;
}

function getTagInputShellClassNamePreview() {
    return <div className="text-xs text-slate-400"><p className="font-medium">getTagInputShellClassName</p><p>标签输入外壳样式 token，统一 Tag 输入容器焦点和边框状态。</p><p className="mt-1 text-slate-300">Foundation / 样式 recipe，无运行时组件预览。</p></div>;
}

function getTagInlineInputClassNamePreview() {
    return <div className="text-xs text-slate-400"><p className="font-medium">getTagInlineInputClassName</p><p>标签内联输入样式 token，用于 chip 输入末尾的轻量文本输入。</p><p className="mt-1 text-slate-300">Foundation / 样式 recipe，无运行时组件预览。</p></div>;
}

function getTagPillClassNamePreview() {
    return <div className="text-xs text-slate-400"><p className="font-medium">getTagPillClassName</p><p>标签项样式 token，统一别名、标签和可删除 chip 外观。</p><p className="mt-1 text-slate-300">Foundation / 样式 recipe，无运行时组件预览。</p></div>;
}

function HiddenDataFieldPreview() {
    return <div className="text-xs text-slate-400"><p className="font-medium">HiddenDataField</p><p>隐藏数据字段 primitive，用于纸面模板或集成场景保留机器可读字段。</p><p className="mt-1 text-slate-300">实时预览待补充。</p></div>;
}

function InlineCreatePanelPreview() {
    return <div className="text-xs text-slate-400"><p className="font-medium">InlineCreatePanel</p><p>统一新建入口：在页面内单行展开，只放创建所需的 required/FK 字段和创建/取消动作；业务可选择输入控件，但不能自定义字段间距、改按钮文案或改成弹窗。</p><p className="mt-1 text-slate-300">实时预览待补充。</p></div>;
}

function RemovableTagPreview() {
    return <div className="text-xs text-slate-400"><p className="font-medium">RemovableTag</p><p>可删除标签模板，统一 chip 外观、内置 x 删除入口和确认弹窗；业务不要手写 tag 内删除按钮。</p><p className="mt-1 text-slate-300">实时预览待补充。</p></div>;
}

function RatingControlPreview() {
  const [rating, setRating] = useState<number>(3);
  return (
<RatingControl value={rating} onChange={setRating} max={5} label="重要度" />
  );
}

function SearchInputPreview() {
  const [page, setPage] = useState("");
  const [toolbar, setToolbar] = useState("");
  const [compact, setCompact] = useState("");
  return (
    <div className="flex flex-col gap-2">
      <SearchInput value={page} onChange={setPage} size="page" placeholder="页面级搜索..." />
      <SearchInput value={toolbar} onChange={setToolbar} size="toolbar" placeholder="工具栏搜索..." />
      <SearchInput value={compact} onChange={setCompact} size="compact" placeholder="紧凑搜索..." />
    </div>
  );
}

function SelectFieldPreview() {
  const [value, setValue] = useState("");
  const options = [
    { value: "active", label: "现用" },
    { value: "archived", label: "已归档" },
    { value: "all", label: "全部" },
  ];
  return (
    <div className="space-y-3">
      <SelectField label="状态" options={options} value={value} onChange={setValue} placeholder="请选择" />
      <span className="text-xs text-slate-400">选中值：{value || "无"}</span>
    </div>
  );
}

function SwitchFieldPreview() {
  const [boolValue, setBoolValue] = useState<boolean>(false);
  return (
<SwitchField checked={boolValue} onChange={setBoolValue} ariaLabel="启用开关" />
  );
}

function TagPillButtonPreview() {
    return <div className="text-xs text-slate-400"><p className="font-medium">TagPillButton</p><p>可点击标签按钮，统一 chip 外观、单行省略、hover 和焦点态。</p><p className="mt-1 text-slate-300">实时预览待补充。</p></div>;
}

function TagRemoveButtonPreview() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700">
        标签示例 <TagRemoveButton label="删除标签" confirm={false} onClick={() => {}} />
      </span>
    </div>
  );
}

function TextareaFieldPreview() {
  const [text, setText] = useState<string>("");
  return (
<TextareaField value={text} onChange={setText} placeholder="请输入多行文本" className="max-w-xs" />
  );
}

function TextFieldPreview() {
  const [text, setText] = useState<string>("");
  return (
<TextField value={text} onChange={setText} placeholder="请输入文本" className="max-w-xs" />
  );
}

export const formPreviewByName: Record<string, FC> = {
  AutoSizeTextField: AutoSizeTextFieldPreview,
  BlockCreatePanel: BlockCreatePanelPreview,
  CalendarDateInput: CalendarDateInputPreview,
  CheckboxChip: CheckboxChipPreview,
  CheckboxField: CheckboxFieldPreview,
  ChoiceGroup: ChoiceGroupPreview,
  CreateConfirmActions: CreateConfirmActionsPreview,
  CreateStartButton: CreateStartButtonPreview,
  FileField: FileFieldPreview,
  FormField: FormFieldPreview,
  FormShell: FormShellPreview,
  getFieldInputClassName: getFieldInputClassNamePreview,
  getFieldGridCellClassName: getFieldGridCellClassNamePreview,
  getFieldGridLabelClassName: getFieldGridLabelClassNamePreview,
  getFieldGridValueClassName: getFieldGridValueClassNamePreview,
  getFieldGroupTitleClassName: getFieldGroupTitleClassNamePreview,
  getReadOnlyFieldClassName: getReadOnlyFieldClassNamePreview,
  getTagInputShellClassName: getTagInputShellClassNamePreview,
  getTagInlineInputClassName: getTagInlineInputClassNamePreview,
  getTagPillClassName: getTagPillClassNamePreview,
  HiddenDataField: HiddenDataFieldPreview,
  InlineCreatePanel: InlineCreatePanelPreview,
  RemovableTag: RemovableTagPreview,
  RatingControl: RatingControlPreview,
  SearchInput: SearchInputPreview,
  SelectField: SelectFieldPreview,
  SwitchField: SwitchFieldPreview,
  TagPillButton: TagPillButtonPreview,
  TagRemoveButton: TagRemoveButtonPreview,
  TextareaField: TextareaFieldPreview,
  TextField: TextFieldPreview,
};
