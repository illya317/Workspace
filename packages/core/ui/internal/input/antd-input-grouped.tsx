"use client";

import { useState } from "react";
import SearchableOptionInput from "./SearchableOptionInput";
import { toInputSurfaceSearchableOption } from "./InputSurfaceTypes";
import type { SelectionOptionGroup } from "../selection/SelectionOptionTypes";
import { resolveGroupedChoiceGroupSelection } from "./grouped-choice-selection";

function notifyDismissed(open: boolean, onDismiss?: () => void) {
  if (!open) onDismiss?.();
}

/** Two-stage grouped choice is a dedicated protocol leaf inside the total Ant dispatcher. */
export function AntdGroupedChoice({
  className, disabled, displayGroup, emptyText, groupLabel, groups, inputClassName, onChange,
  optionLabel, placeholder, value, visibleCount, autoFocus, onDismiss,
}: {
  className?: string;
  disabled: boolean;
  displayGroup?: boolean;
  emptyText: string;
  groupLabel: string;
  groups: SelectionOptionGroup[];
  inputClassName?: string;
  onChange: (value: string | null) => void;
  optionLabel: string;
  placeholder?: string;
  value: string;
  visibleCount?: number;
  autoFocus?: boolean;
  onDismiss?: () => void;
}) {
  const currentMatch = findCurrentGroupedOption(groups, value);
  const [stage, setStage] = useState<"group" | "option">("group");
  const [activeGroupKey, setActiveGroupKey] = useState(currentMatch?.group.key ?? groups[0]?.key ?? "");
  const activeGroup = groups.find((group) => group.key === activeGroupKey) ?? groups[0];
  const groupOptions = groups.map((group) => ({ value: group.key, label: group.label }));
  const displayValue = currentMatch
    ? displayGroup ? `${currentMatch.group.label}：${currentMatch.option.label}` : currentMatch.option.label
    : value;

  if (stage === "group") {
    return (
      <SearchableOptionInput
        autoFocus={autoFocus}
        className={className}
        clearOnFocus
        closeOnSelect={false}
        disabled={disabled}
        displayValue={displayValue}
        emptyText={emptyText}
        maxResults={Math.max(2, groupOptions.length)}
        inputClassName={inputClassName}
        onChange={(next) => {
          const selection = resolveGroupedChoiceGroupSelection(next);
          if (selection.kind === "clear") { onChange(null); setStage("group"); return; }
          setActiveGroupKey(selection.groupKey);
          setStage("option");
        }}
        onOpenChange={(open) => notifyDismissed(open, onDismiss)}
        options={groupOptions}
        placeholder={placeholder ?? groupLabel}
        value={displayValue}
      />
    );
  }

  return (
    <SearchableOptionInput
      autoFocus
      className={className}
      clearOnFocus
      disabled={disabled}
      emptyText={emptyText}
      inputClassName={inputClassName}
      onChange={(next) => { onChange(next); setStage("group"); }}
      onOpenChange={(open) => { if (!open) { setStage("group"); notifyDismissed(false, onDismiss); } }}
      options={(activeGroup?.options ?? []).map(toInputSurfaceSearchableOption)}
      placeholder={optionLabel}
      value=""
      visibleCount={visibleCount}
    />
  );
}

function findCurrentGroupedOption(groups: SelectionOptionGroup[], value: string) {
  for (const group of groups) {
    const option = group.options.find((item) => item.value === value);
    if (option) return { group, option };
  }
  return null;
}
