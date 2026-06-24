"use client";

import { useState, type FC } from "react";
import {
  PickerOptionButton,
  PickerSegmentedControl,
} from "@workspace/core/ui";

function ArchiveSelectorPanelPreview() {
    return <div className="text-xs text-slate-400"><p className="font-medium">ArchiveSelectorPanel</p><p>实体选择面板的旧归档语义入口，后续应收敛成中性选择器。</p><p className="mt-1 text-slate-300">实时预览待补充。</p></div>;
}

function FkFieldInputPreview() {
    return <div className="text-xs text-slate-400"><p className="font-medium">FkFieldInput</p><p>外键实体搜索输入，只负责展示和选择；业务域传入 reference-options endpoint，Platform registry 校验 FK 契约。</p><p className="mt-1 text-slate-300">实时预览待补充。</p></div>;
}

function GroupedOptionPickerPreview() {
    return <div className="text-xs text-slate-400"><p className="font-medium">GroupedOptionPicker</p><p>分组选项选择器，统一分组切换、清空和候选项按钮样式。</p><p className="mt-1 text-slate-300">实时预览待补充。</p></div>;
}

function OptionPickerPreview() {
    return <div className="text-xs text-slate-400"><p className="font-medium">OptionPicker</p><p>本地选项选择器，支持搜索过滤和 PickerShell 结构。</p><p className="mt-1 text-slate-300">实时预览待补充。</p></div>;
}

function PickerActionRowPreview() {
    return <div className="text-xs text-slate-400"><p className="font-medium">PickerActionRow</p><p>选择器弹层内的动作行，统一清空、更换分组和辅助动作排列。</p><p className="mt-1 text-slate-300">实时预览待补充。</p></div>;
}

function PickerOptionButtonPreview() {
  const [selected, setSelected] = useState<string | null>("a");
  return (
    <div className="flex flex-wrap gap-2">
      <PickerOptionButton selected={selected === "a"} onClick={() => setSelected("a")}>选项 A</PickerOptionButton>
      <PickerOptionButton selected={selected === "b"} onClick={() => setSelected("b")}>选项 B</PickerOptionButton>
      <PickerOptionButton selected={selected === "c"} onClick={() => setSelected("c")} size="compact">紧凑</PickerOptionButton>
    </div>
  );
}

function PickerShellPreview() {
    return <div className="text-xs text-slate-400"><p className="font-medium">PickerShell</p><p>选择器外壳，统一搜索、列表、空态和候选项区域。</p><p className="mt-1 text-slate-300">实时预览待补充。</p></div>;
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
    return <div className="text-xs text-slate-400"><p className="font-medium">SearchableOptionInput</p><p>可搜索选项输入，统一输入、清空、候选列表和键盘选择交互。</p><p className="mt-1 text-slate-300">实时预览待补充。</p></div>;
}

function SelectorCardPreview() {
    return <div className="text-xs text-slate-400"><p className="font-medium">SelectorCard</p><p>可点击选择卡片，用于实体列表、主从选择和状态标记。</p><p className="mt-1 text-slate-300">实时预览待补充。</p></div>;
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
