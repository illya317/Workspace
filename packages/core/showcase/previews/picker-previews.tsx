"use client";

import { useState, type FC } from "react";
import {
  ArchiveSelectorPanel,
  Badge,
  FkFieldInput,
  GroupedOptionPicker,
  OptionPicker,
  PickerActionRow,
  PickerOptionButton,
  PickerSegmentedControl,
  PickerShell,
  SearchableOptionInput,
  SelectorCard,
} from "@workspace/core/ui";

function ArchiveSelectorPanelPreview() {
  const [tab, setTab] = useState<"active" | "archived">("active");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | number | null>("emp-1");
  const items = [
    { id: "emp-1", title: "张三", code: "EMP001", badge: <Badge label="现用" tone="emerald" />, meta: "人力资源部" },
    { id: "emp-2", title: "李四", code: "EMP002", badge: <Badge label="现用" tone="emerald" />, meta: "信息技术部" },
    { id: "emp-3", title: "王五", code: "EMP003", badge: <Badge label="已归档" tone="slate" />, meta: "财务部" },
  ];
  return (
    <div className="max-w-md">
      <ArchiveSelectorPanel
        title="选择员工"
        subtitle="切换现用 / 已归档"
        tabs={[
          { id: "active", label: "现用", count: 2 },
          { id: "archived", label: "已归档", count: 1 },
        ]}
        activeTab={tab}
        onTabChange={setTab}
        searchValue={query}
        onSearchChange={setQuery}
        items={items}
        activeItemId={selectedId}
        onItemSelect={(item) => setSelectedId(item.id)}
      />
    </div>
  );
}

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
        size="compact"
      />
    </div>
  );
}

function GroupedOptionPickerPreview() {
  const [value, setValue] = useState<string | null>("pharmacy");
  return (
    <div className="max-w-xs">
      <GroupedOptionPicker
        value={value}
        onChange={setValue}
        placeholder="未设置专业"
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

function OptionPickerPreview() {
  const [value, setValue] = useState<string | null>("");
  return (
    <div className="max-w-xs">
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
    </div>
  );
}

function PickerActionRowPreview() {
  return (
    <div className="max-w-xs space-y-2">
      <PickerActionRow>
        <button type="button" className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50">清空</button>
        <button type="button" className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50">更换分组</button>
      </PickerActionRow>
      <PickerActionRow align="start">
        <span className="text-xs text-slate-500">左侧对齐动作行</span>
      </PickerActionRow>
    </div>
  );
}

function PickerOptionButtonPreview() {
  const [selected, setSelected] = useState<string | null>("a");
  return (
    <div className="flex flex-wrap gap-2">
      <PickerOptionButton selected={selected === "a"} onClick={() => setSelected("a")}>选项 A</PickerOptionButton>
      <PickerOptionButton selected={selected === "b"} onClick={() => setSelected("b")}>选项 B</PickerOptionButton>
      <PickerOptionButton selected={selected === "c"} onClick={() => setSelected("c")} size="compact">紧凑</PickerOptionButton>
      <PickerOptionButton selected={selected === "d"} onClick={() => setSelected("d")} align="left">左对齐长文本选项</PickerOptionButton>
    </div>
  );
}

function PickerShellPreview() {
  const [value, setValue] = useState<string | null>(null);
  return (
    <div className="max-w-xs">
      <PickerShell
        valueLabel={value ? `已选：${value}` : ""}
        placeholder="点击选择"
      >
        {({ close }) => (
          <div className="grid grid-cols-2 gap-2">
            {["红色", "绿色", "蓝色", "黄色"].map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => { setValue(color); close(); }}
                className="rounded-md border border-slate-200 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50"
              >
                {color}
              </button>
            ))}
          </div>
        )}
      </PickerShell>
    </div>
  );
}

function PickerSegmentedControlPreview() {
  const [value, setValue] = useState("day");
  return (
    <PickerSegmentedControl
      value={value}
      onChange={setValue}
      options={[
        { label: "日", value: "day" },
        { label: "周", value: "week" },
        { label: "月", value: "month" },
      ]}
    />
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

function SelectorCardPreview() {
  const [selected, setSelected] = useState<string | null>("card-1");
  return (
    <div className="flex flex-col gap-2 max-w-xs">
      <SelectorCard
        title="项目 Alpha"
        subtitle="2026-06-01 创建"
        meta={["阶段 3/5", "负责人 张三"]}
        trailing={<Badge label="进行中" tone="emerald" />}
        active={selected === "card-1"}
        onClick={() => setSelected("card-1")}
      />
      <SelectorCard
        title="项目 Beta"
        subtitle="2026-05-20 创建"
        meta={["阶段 5/5", "负责人 李四"]}
        trailing={<Badge label="已完成" tone="slate" />}
        active={selected === "card-2"}
        onClick={() => setSelected("card-2")}
      />
      <SelectorCard
        title="已归档项目"
        subtitle="2025-12-01 归档"
        meta={["仅查看"]}
        archived
        onClick={() => setSelected("card-3")}
      />
    </div>
  );
}

export const pickerPreviewByName: Record<string, FC> = {
  ArchiveSelectorPanel: ArchiveSelectorPanelPreview,
  FkFieldInput: FkFieldInputPreview,
  GroupedOptionPicker: GroupedOptionPickerPreview,
  OptionPicker: OptionPickerPreview,
  PickerActionRow: PickerActionRowPreview,
  PickerOptionButton: PickerOptionButtonPreview,
  PickerShell: PickerShellPreview,
  PickerSegmentedControl: PickerSegmentedControlPreview,
  SearchableOptionInput: SearchableOptionInputPreview,
  SelectorCard: SelectorCardPreview,
};
