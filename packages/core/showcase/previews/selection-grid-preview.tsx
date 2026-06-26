"use client";

import { useState } from "react";
import { SelectionGrid } from "@workspace/core/ui";

export function SelectionGridPreview() {
  const [value, setValue] = useState("dev");
  const options = [
    { value: "dev", label: "研发工程师", code: "DEV" },
    { value: "pm", label: "产品经理", code: "PM" },
    { value: "design", label: "设计师", code: "DSN" },
    { value: "qa", label: "测试工程师", code: "QA" },
    { value: "ops", label: "运维工程师", code: "OPS" },
    { value: "hrbp", label: "HRBP", code: "HR" },
  ];
  return (
    <div className="max-w-2xl space-y-4">
      <SelectionGrid options={options} value={value} onChange={setValue} columns={3} ariaLabel="选择岗位" />
      <p className="text-xs text-slate-400">当前选中：{options.find((o) => o.value === value)?.label}</p>
    </div>
  );
}
