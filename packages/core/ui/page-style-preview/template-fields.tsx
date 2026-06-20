"use client";

import { useState } from "react";
import CalendarDateInput from "../CalendarDateInput";
import FormField from "../FormField";
import { getTagInputShellClassName, getTagPillClassName } from "../FormStyles";
import OptionPicker from "../OptionPicker";
import SearchableOptionInput from "../SearchableOptionInput";
import TextField from "../TextField";

const basicOptions = [
  { value: "全部", label: "全部" },
  { value: "现用", label: "现用" },
  { value: "归档", label: "归档" },
  { value: "内部", label: "内部" },
  { value: "公开", label: "公开" },
  { value: "博士", label: "博士" },
  { value: "硕士", label: "硕士" },
  { value: "本科", label: "本科" },
  { value: "男", label: "男" },
  { value: "女", label: "女" },
  { value: "是", label: "是" },
  { value: "否", label: "否" },
];

const fkOptions = [
  { value: "轮执委员会", label: "轮执委员会", searchText: "lun zhi wei yuan hui" },
  { value: "董事长", label: "董事长", searchText: "dong shi zhang" },
  { value: "张明", label: "张明", searchText: "zhang ming" },
  { value: "张慧君", label: "张慧君", searchText: "zhang hui jun" },
  { value: "月度主数据", label: "月度主数据", searchText: "yue du zhu shu ju" },
];

function fieldValue(field: string, index: number) {
  if (field.includes("编号") || field.includes("编码")) return "A001";
  if (field.includes("姓名")) return "张慧君";
  if (field.includes("部门")) return "轮执委员会";
  if (field.includes("岗位") || field.includes("职称")) return "董事长";
  if (field.includes("日期") || field.includes("时间") || field.includes("出生年月")) return "2026-06-18";
  if (field.includes("金额") || field.includes("预算") || field.includes("占比")) return "99.98";
  if (field.includes("电话")) return "137 7004 3888";
  if (field.includes("状态")) return "现用";
  if (field.includes("范围") || field.includes("保密")) return "内部";
  if (field.includes("性别")) return "男";
  if (field.includes("学历")) return "博士";
  if (field.includes("政治")) return "党员";
  if (field.includes("类型") || field.includes("分类")) return "标准";
  if (field.includes("负责人") || field.includes("上级")) return "张明";
  if (field.includes("名称")) return "月度主数据";
  return index < 2 ? `值${index + 1}` : "";
}

function isOptionField(field: string) {
  return /性别|学历|主岗|状态|范围|类型|分类|保密|风险|优先级/.test(field);
}

function isReferenceField(field: string) {
  return /部门|岗位|负责人|上级|计划|客户|供应商|投资人/.test(field);
}

function isDateField(field: string) {
  return /日期|时间|出生年月/.test(field);
}

function isPercentField(field: string) {
  return /占比|完成率/.test(field);
}

function PreviewTags() {
  return (
    <div className={getTagInputShellClassName()}>
      {["Jone", "大张"].map((item) => (
        <span key={item} className={getTagPillClassName()}>
          {item}
          <span className="text-slate-400">×</span>
        </span>
      ))}
    </div>
  );
}

function PercentField({ value }: { value: string }) {
  return (
    <div className="flex min-h-10 overflow-hidden rounded-md border border-slate-300 bg-white text-sm text-slate-800 shadow-sm">
      <TextField value={value} onChange={() => {}} readOnly unstyled className="min-w-0 flex-1 border-0 bg-transparent px-3 py-2 font-sans text-sm tabular-nums outline-none" />
      <span className="grid min-w-12 place-items-center border-l border-slate-200 bg-slate-50 text-sm font-semibold text-slate-500">%</span>
    </div>
  );
}

function PreviewField({ field, index }: { field: string; index: number }) {
  const initial = fieldValue(field, index);
  const [value, setValue] = useState(initial);

  if (field.includes("别名")) return <PreviewTags />;
  if (isPercentField(field)) return <PercentField value={initial} />;
  if (isDateField(field)) return <CalendarDateInput value={initial} onChange={() => {}} />;
  if (isReferenceField(field)) {
    return (
      <SearchableOptionInput
        value={value}
        onChange={(next) => setValue(next ?? "")}
        options={fkOptions}
        placeholder={`搜索${field}`}
      />
    );
  }
  if (isOptionField(field)) {
    return (
      <OptionPicker
        value={value}
        onChange={(next) => setValue(next ?? "")}
        options={basicOptions}
        placeholder="未设置"
        visibleCount={6}
      />
    );
  }
  return <TextField value={initial} onChange={() => {}} placeholder={field} readOnly />;
}

export function FormGrid({
  fields,
  columns = "md:grid-cols-3",
}: {
  fields: string[];
  columns?: string;
}) {
  return (
    <div className={`grid gap-3 ${columns}`}>
      {fields.map((field, index) => (
        <FormField key={field} label={field} required={index < 2}>
          <PreviewField field={field} index={index} />
        </FormField>
      ))}
    </div>
  );
}

export function DetailStats({ items }: { items: string[] }) {
  return (
    <div className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm md:grid-cols-4">
      {items.map((item, index) => (
        <div key={item} className="flex items-center gap-2">
          <span className="text-slate-500">{item}</span>
          <span className="font-semibold text-slate-900">{index + 1}</span>
        </div>
      ))}
    </div>
  );
}
