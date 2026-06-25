"use client";

import { useMemo, useRef, useState } from "react";
import OptionPickerContent from "./OptionPickerContent";
import PickerShell from "./PickerShell";
import type { OptionPickerProps, PickerGroupItem, PickerOption } from "./OptionPickerTypes";

function normalizeValue(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function uniqOptions(options: PickerOption[]) {
  const seen = new Set<string>();
  const next: PickerOption[] = [];
  for (const option of options) {
    if (seen.has(option.value)) continue;
    seen.add(option.value);
    next.push(option);
  }
  return next;
}

function findCurrentMatch(groups: PickerGroupItem[], current: string) {
  for (const group of groups) {
    const option = group.options.find((item) => item.value === current);
    if (option) return { group, option };
  }
  return null;
}

export default function OptionPicker({
  value,
  options,
  groups,
  disabled,
  onChange,
  placeholder = "未设置",
  description,
  emptyText = "暂无选项",
  groupLabel = "分类",
  optionLabel = "选项",
  changeGroupLabel = "更换分类",
  formatValueLabel,
  renderOption,
  searchPlaceholder = "搜索选项",
  commonValues,
  visibleCount = 6,
  gridColumnCount,
  gridColumns,
  placeholderInGrid = false,
  className,
  buttonClassName,
  popoverClassName,
}: OptionPickerProps) {
  const current = normalizeValue(value);
  const [showMore, setShowMore] = useState(false);
  const [query, setQuery] = useState("");
  const groupItems = useMemo(() => groups ?? [], [groups]);
  const grouped = groupItems.length > 0;
  const currentMatch = grouped ? findCurrentMatch(groupItems, current) : null;
  const [activeGroupKey, setActiveGroupKey] = useState(currentMatch?.group.key || groupItems[0]?.key || "");
  const [step, setStep] = useState<"group" | "option">(currentMatch ? "option" : "group");
  const prevOpenRef = useRef(false);

  const normalizedOptions = useMemo(() => uniqOptions(options ?? []), [options]);
  const valueToLabel = useMemo(() => {
    const map = new Map<string, string>();
    for (const option of normalizedOptions) map.set(option.value, option.label);
    return map;
  }, [normalizedOptions]);
  const hasExplicitEmptyOption = valueToLabel.has("");

  const visibleOptions = useMemo(() => {
    if (commonValues?.length) {
      const commonSet = new Set(commonValues);
      return normalizedOptions.filter((option) => commonSet.has(option.value));
    }
    return normalizedOptions.slice(0, visibleCount);
  }, [commonValues, normalizedOptions, visibleCount]);

  const moreOptions = useMemo(() => {
    const visibleSet = new Set(visibleOptions.map((option) => option.value));
    return normalizedOptions.filter((option) => !visibleSet.has(option.value));
  }, [normalizedOptions, visibleOptions]);

  const isUnset = current === "" && !hasExplicitEmptyOption;
  const currentLabel = isUnset
    ? ""
    : formatValueLabel?.(current, currentMatch?.option, currentMatch?.group)
      ?? valueToLabel.get(current)
      ?? currentMatch?.option.label
      ?? current;
  const gridOptions = placeholderInGrid && !hasExplicitEmptyOption
    ? [{ label: placeholder, value: "" }, ...visibleOptions]
    : visibleOptions;
  const visibleGridColumnCount = gridColumnCount ?? gridColumns ?? Math.min(3, Math.max(1, gridOptions.length));

  function resetPopup() {
    setShowMore(false);
    setQuery("");
  }

  return (
    <PickerShell
      valueLabel={currentLabel}
      placeholder={placeholder}
      disabled={disabled}
      className={className}
      buttonClassName={buttonClassName}
      popoverClassName={
        popoverClassName ||
        "absolute left-0 top-[calc(100%+0.35rem)] z-50 w-max min-w-0 max-w-[min(36rem,calc(100vw-2rem))] rounded-lg border border-slate-200 bg-white p-2.5 shadow-xl"
      }
      onOpenChange={(open) => {
        if (open && !prevOpenRef.current) {
          const match = grouped ? findCurrentMatch(groupItems, current) : null;
          setActiveGroupKey(match?.group.key || groupItems[0]?.key || "");
          setStep(match ? "option" : "group");
        }
        if (!open) resetPopup();
        prevOpenRef.current = open;
      }}
    >
      {({ close }) => {
        function choose(next: string | null) {
          onChange(next);
          resetPopup();
          close();
        }

        return (
          <OptionPickerContent
            grouped={grouped}
            current={current}
            isUnset={isUnset}
            placeholder={placeholder}
            description={description}
            emptyText={emptyText}
            groupLabel={groupLabel}
            optionLabel={optionLabel}
            changeGroupLabel={changeGroupLabel}
            groupItems={groupItems}
            activeGroupKey={activeGroupKey}
            setActiveGroupKey={setActiveGroupKey}
            step={step}
            setStep={setStep}
            gridColumns={gridColumns}
            gridColumnCount={gridColumnCount}
            gridOptions={gridOptions}
            visibleGridColumnCount={visibleGridColumnCount}
            hasExplicitEmptyOption={hasExplicitEmptyOption}
            placeholderInGrid={placeholderInGrid}
            moreOptions={moreOptions}
            showMore={showMore}
            setShowMore={setShowMore}
            query={query}
            setQuery={setQuery}
            searchPlaceholder={searchPlaceholder}
            choose={choose}
            renderOption={renderOption}
          />
        );
      }}
    </PickerShell>
  );
}
