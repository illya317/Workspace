"use client";

import { useState, type FC } from "react";
import {
  FkFieldInput,
  OptionPicker,
  SearchableOptionInput,
} from "@workspace/core/ui";



function FkFieldInputPreview() {
  return (
    <div className="max-w-xs">
      <FkFieldInput
        fkKey="employee"
        endpoint="#"
        value="emp-001"
        displayValue="张三"
        onChange={() => {}}
        placeholder="输入姓名搜索..."
        disabled
      />
    </div>
  );
}

function OptionPickerPreview() {
  const [value, setValue] = useState<string | null>("");
  const [grouped, setGrouped] = useState<string | null>("pharmacy");
  return (
    <div className="flex max-w-xs flex-col gap-4">
      <OptionPicker
        value={value}
        onChange={setValue}
        placeholder="未设置"
        options={[
          { value: "beijing", label: "北京" },
          { value: "shanghai", label: "上海" },
          { value: "guangzhou", label: "广州" },
          { value: "shenzhen", label: "深圳" },
          { value: "hangzhou", label: "杭州" },
          { value: "chengdu", label: "成都" },
          { value: "wuhan", label: "武汉" },
          { value: "xian", label: "西安" },
        ]}
        commonValues={["beijing", "shanghai", "guangzhou"]}
        visibleCount={4}
      />
      <OptionPicker
        value={grouped}
        onChange={setGrouped}
        placeholder="未设置专业"
        description="分组模式：先选学科分类，再选具体专业。"
        groups={[
          {
            key: "science",
            label: "理学",
            options: [
              { value: "math", label: "数学" },
              { value: "physics", label: "物理学" },
            ],
          },
          {
            key: "medicine",
            label: "医学",
            options: [
              { value: "pharmacy", label: "药学", description: "四年制" },
              { value: "clinical", label: "临床医学", description: "五年制" },
            ],
          },
        ]}
      />
    </div>
  );
}

function SearchableOptionInputPreview() {
  const [value, setValue] = useState<string | null>("zh");
  return (
    <div className="max-w-xs">
      <SearchableOptionInput
        value={value}
        onChange={setValue}
        placeholder="搜索学校..."
        options={[
          { value: "pk", label: "北京大学", subtitle: "北京" },
          { value: "thu", label: "清华大学", subtitle: "北京" },
          { value: "fdu", label: "复旦大学", subtitle: "上海" },
          { value: "sjtu", label: "上海交通大学", subtitle: "上海" },
          { value: "zju", label: "浙江大学", subtitle: "杭州" },
        ]}
      />
    </div>
  );
}

export const pickerPreviewByName: Record<string, FC> = {
  FkFieldInput: FkFieldInputPreview,
  OptionPicker: OptionPickerPreview,
  SearchableOptionInput: SearchableOptionInputPreview,
};
