"use client";

import { useState, type FC } from "react";
import {
  Badge,
  FkFieldInput,
  OptionPicker,
  PanelCard,
  PickerOptionButton,
  PickerShell,
  SearchableOptionInput,
  SelectorCard,
  TabBar,
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

function PickerOptionButtonPreview() {
  const [selected, setSelected] = useState<string | null>("a");
  return (
    <div className="flex flex-wrap gap-2">
      <PickerOptionButton selected={selected === "a"} onClick={() => setSelected("a")}>选项 A</PickerOptionButton>
      <PickerOptionButton selected={selected === "b"} onClick={() => setSelected("b")}>选项 B</PickerOptionButton>
      <PickerOptionButton selected={selected === "c"} onClick={() => setSelected("c")} size="compact">紧凑</PickerOptionButton>
      <PickerOptionButton selected={selected === "d"} onClick={() => setSelected("d")} align="left">左对齐长文本选项</PickerOptionButton>
      <PickerOptionButton variant="placeholder" selected={selected === ""} onClick={() => setSelected("")} size="compact">未设置</PickerOptionButton>
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
  const [tab, setTab] = useState<"all" | "active" | "archived">("all");
  const [selected, setSelected] = useState<string | null>("card-1");
  const items = [
    { id: "card-1", title: "项目 Alpha", subtitle: "2026-06-01 创建", meta: ["阶段 3/5", "负责人 张三"], trailing: <Badge label="进行中" tone="emerald" />, archived: false },
    { id: "card-2", title: "项目 Beta", subtitle: "2026-05-20 创建", meta: ["阶段 5/5", "负责人 李四"], trailing: <Badge label="已完成" tone="slate" />, archived: false },
    { id: "card-3", title: "已归档项目", subtitle: "2025-12-01 归档", meta: ["仅查看"], archived: true },
    { id: "card-4", title: "张三", code: "EMP001", metaLine: "人力资源部", leading: <Badge label="现用" tone="emerald" />, archived: false },
  ];
  const filteredItems = tab === "all"
    ? items
    : tab === "active"
      ? items.filter((item) => !item.archived)
      : items.filter((item) => item.archived);
  return (
    <div className="flex flex-col gap-4 max-w-xs">
      <div className="flex flex-col gap-2">
        <SelectorCard
          title="项目 Alpha"
          subtitle="2026-06-01 创建"
          meta={["阶段 3/5", "负责人 张三"]}
          trailing={<Badge label="进行中" tone="emerald" />}
          active={selected === "card-1"}
          onClick={() => setSelected("card-1")}
        />
        <SelectorCard
          title="已归档项目"
          subtitle="2025-12-01 归档"
          meta={["仅查看"]}
          archived
          onClick={() => setSelected("card-3")}
        />
      </div>
      <PanelCard bodyClassName="p-3">
        <TabBar
          variant="micro"
          active={tab}
          onChange={(key) => setTab(key as typeof tab)}
          tabs={[
            { key: "all", label: "全部" },
            { key: "active", label: "现用" },
            { key: "archived", label: "已归档" },
          ]}
        />
        <div className="mt-3 space-y-2">
          {filteredItems.map((item) => (
            <SelectorCard
              key={item.id}
              size="sm"
              title={item.title}
              subtitle={item.subtitle}
              code={item.code}
              meta={item.meta}
              metaLine={item.metaLine}
              leading={item.leading}
              trailing={item.trailing}
              archived={item.archived}
              active={selected === item.id}
              onClick={() => setSelected(item.id)}
            />
          ))}
        </div>
      </PanelCard>
    </div>
  );
}

export const pickerPreviewByName: Record<string, FC> = {
  FkFieldInput: FkFieldInputPreview,
  OptionPicker: OptionPickerPreview,
  PickerOptionButton: PickerOptionButtonPreview,
  PickerShell: PickerShellPreview,
  SearchableOptionInput: SearchableOptionInputPreview,
  SelectorCard: SelectorCardPreview,
};
