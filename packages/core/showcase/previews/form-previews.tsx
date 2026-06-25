"use client";

import { useState, type FC } from "react";
import {
  AutoSizeTextField, CalendarDateInput, CheckboxChip, CheckboxField, ChoiceGroup,
  CreatePanel, FieldGrid, FieldInputShell,
  FileField, FormField, FormShell, HiddenDataField, RatingControl, ReadOnlyField,
  SearchInput, SelectField, SwitchField,
  TagInlineTextField, TextField, TextareaField, TimeField,
} from "@workspace/core/ui";
import BlockCreatePanel from "../../ui/BlockCreatePanel";
import InlineCreatePanel from "../../ui/InlineCreatePanel";
import { CreateConfirmActions, CreateStartButton } from "../../ui/CreateActionControls";

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
        <div className="text-sm text-slate-700"><FileField variant="inline" buttonLabel="原始数据、图谱、待包装品检验报告单见数据图谱粘贴页。" showFileName={false} resetOnChange onChange={() => {}} onFilesChange={(files) => setPaperFiles(files ? Array.from(files) : [])} /></div>
        {paperFiles.length > 0 && <ul className="text-xs text-slate-500">{paperFiles.map((f) => <li key={f.name}>· {f.name}</li>)}</ul>}
      </div>
    </div>
  );
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

function ReadOnlyFieldPreview() {
  const [clicked, setClicked] = useState(false);
  return <div className="max-w-sm space-y-3"><ReadOnlyField value="只读值，保持表单视觉一致" /><ReadOnlyField value="可点击只读字段" onClick={() => setClicked((v) => !v)} />{clicked && <span className="text-xs text-slate-400">已点击</span>}</div>;
}

function FieldInputShellPreview() {
  const [value, setValue] = useState("50");
  return <div className="max-w-xs"><FieldInputShell className="focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500"><TextField value={value} onChange={setValue} unstyled className="h-9 flex-1 border-0 bg-transparent px-3 py-0 text-sm outline-none" /><span className="flex items-center border-l border-slate-200 bg-slate-50 px-3 text-sm text-slate-500">%</span></FieldInputShell></div>;
}

function FieldGridPreview() {
  return <div className="max-w-2xl space-y-3"><FieldGrid.GroupTitle>基础资料</FieldGrid.GroupTitle><FieldGrid className="grid-cols-2"><FieldGrid.Cell label="姓名" required><TextField value="张三" onChange={() => {}} /></FieldGrid.Cell><FieldGrid.Cell label="员工编码"><ReadOnlyField value="EMP001" /></FieldGrid.Cell><FieldGrid.Cell label="备注" className="col-span-2"><TextareaField value="跨列字段" onChange={() => {}} /></FieldGrid.Cell></FieldGrid></div>;
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

function CreatePanelPreview() {
  const [variant, setVariant] = useState<"inline" | "block" | "modal">("inline");
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState(false);
  const formContent = (
    <>
      <FormField label="名称" required><TextField value={name} onChange={setName} placeholder="输入名称" /></FormField>
      <FormField label="类型"><SelectField value="" onChange={() => {}} options={[{ value: "", label: "请选择" }, { value: "a", label: "类型 A" }, { value: "b", label: "类型 B" }]} /></FormField>
    </>
  );
  return (
    <div className="max-w-2xl space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {(["inline", "block", "modal"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setVariant(v)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${variant === v ? "border-emerald-600 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
          >
            {v}
          </button>
        ))}
      </div>
      {variant === "block" && (
        <CreatePanel
          variant="block"
          title="新增项目阶段"
          creating={creating}
          canCreate
          onStartCreate={() => setCreating(true)}
          onSubmit={() => setCreating(false)}
          onCancel={() => setCreating(false)}
          createContent={formContent}
        >
          <p className="text-xs text-slate-400">非创建态下展示列表占位。</p>
        </CreatePanel>
      )}
      {variant === "inline" && (
        <CreatePanel
          variant="inline"
          title="新增员工"
          onSubmit={() => {}}
          onCancel={() => setName("")}
        >
          {formContent}
        </CreatePanel>
      )}
      {variant === "modal" && (
        <>
          <button type="button" onClick={() => setOpen(true)} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700">打开弹窗新建</button>
          <CreatePanel
            variant="modal"
            title="弹窗新建"
            open={open}
            onSubmit={() => setOpen(false)}
            onCancel={() => setOpen(false)}
          >
            {formContent}
          </CreatePanel>
        </>
      )}
    </div>
  );
}

export const formPreviewByName: Record<string, FC> = {
  AutoSizeTextField: AutoSizeTextFieldPreview, BlockCreatePanel: BlockCreatePanelPreview, CalendarDateInput: CalendarDateInputPreview,
  CheckboxChip: CheckboxChipPreview, CheckboxField: CheckboxFieldPreview, ChoiceGroup: ChoiceGroupPreview,
  CreateConfirmActions: CreateConfirmActionsPreview, CreatePanel: CreatePanelPreview, CreateStartButton: CreateStartButtonPreview, FileField: FileFieldPreview,
  FieldGrid: FieldGridPreview, FieldInputShell: FieldInputShellPreview, FormField: FormFieldPreview, FormShell: FormShellPreview,
  getFieldInputClassName: getFieldInputClassNamePreview, getFieldGridCellClassName: getFieldGridCellClassNamePreview,
  getFieldGridLabelClassName: getFieldGridLabelClassNamePreview, getFieldGridValueClassName: getFieldGridValueClassNamePreview,
  getFieldGroupTitleClassName: getFieldGroupTitleClassNamePreview, getReadOnlyFieldClassName: getReadOnlyFieldClassNamePreview,
  getTagInputShellClassName: getTagInputShellClassNamePreview, getTagInlineInputClassName: getTagInlineInputClassNamePreview,
  getTagPillClassName: getTagPillClassNamePreview, HiddenDataField: HiddenDataFieldPreview, InlineCreatePanel: InlineCreatePanelPreview,
  RatingControl: RatingControlPreview, ReadOnlyField: ReadOnlyFieldPreview, SearchInput: SearchInputPreview,
  SelectField: SelectFieldPreview, SwitchField: SwitchFieldPreview, TagInlineTextField: TagInlineTextFieldPreview,
  TextareaField: TextareaFieldPreview, TextField: TextFieldPreview,
  TimeField: TimeFieldPreview,
};
