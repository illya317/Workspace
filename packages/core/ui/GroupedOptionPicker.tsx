"use client";

import { useState } from "react";
import PickerShell from "./PickerShell";

export interface GroupedPickerOption {
  value: string;
  label: string;
  description?: string;
}

export interface GroupedPickerGroup {
  key: string;
  label: string;
  options: GroupedPickerOption[];
}

export interface GroupedOptionPickerProps {
  value: unknown;
  groups: GroupedPickerGroup[];
  disabled?: boolean;
  onChange: (value: string | null) => void;
  placeholder?: string;
  groupLabel?: string;
  optionLabel?: string;
  changeGroupLabel?: string;
  className?: string;
  buttonClassName?: string;
  popoverClassName?: string;
  groupColumnsClassName?: string;
  optionColumnsClassName?: string;
  formatValueLabel?: (value: string, option?: GroupedPickerOption, group?: GroupedPickerGroup) => string;
}

function normalizeValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "";
  return String(value);
}

function findCurrentMatch(groups: GroupedPickerGroup[], current: string) {
  for (const group of groups) {
    const option = group.options.find((item) => item.value === current);
    if (option) return { group, option };
  }
  return null;
}

export default function GroupedOptionPicker({
  value,
  groups,
  disabled,
  onChange,
  placeholder = "未设置",
  groupLabel = "分类",
  optionLabel = "选项",
  changeGroupLabel = "更换分类",
  className,
  buttonClassName,
  popoverClassName,
  groupColumnsClassName = "grid-cols-2 md:grid-cols-3",
  optionColumnsClassName = "grid-cols-1 sm:grid-cols-2",
  formatValueLabel,
}: GroupedOptionPickerProps) {
  const current = normalizeValue(value);
  const currentMatch = findCurrentMatch(groups, current);
  const [activeGroupKey, setActiveGroupKey] = useState(currentMatch?.group.key || groups[0]?.key || "");
  const [step, setStep] = useState<"group" | "option">(currentMatch ? "option" : "group");

  const activeGroup = groups.find((group) => group.key === activeGroupKey) ?? groups[0];
  const valueLabel = current
    ? formatValueLabel?.(current, currentMatch?.option, currentMatch?.group) ?? currentMatch?.option.label ?? current
    : "";

  function choose(nextValue: string | null, close: () => void) {
    onChange(nextValue);
    close();
    setStep("group");
  }

  return (
    <PickerShell
      valueLabel={valueLabel}
      placeholder={placeholder}
      disabled={disabled}
      className={className}
      buttonClassName={buttonClassName}
      popoverClassName={popoverClassName}
      onOpenChange={(open) => {
        if (!open) return;
        setActiveGroupKey(currentMatch?.group.key || groups[0]?.key || "");
        setStep(currentMatch ? "option" : "group");
      }}
    >
      {({ close }) => (
        <>
          <div className="mb-3 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => choose(null, close)}
              className={`rounded-md border px-3 py-1.5 text-xs font-medium transition ${
                current
                  ? "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  : "border-slate-300 bg-slate-100 text-slate-900"
              }`}
            >
              {placeholder}
            </button>
            {step === "option" && groups.length > 1 && (
              <button
                type="button"
                onClick={() => setStep("group")}
                className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
              >
                {changeGroupLabel}
              </button>
            )}
          </div>

          {step === "group" ? (
            <div>
              <div className="mb-2 text-xs font-medium text-slate-500">{groupLabel}</div>
              <div className={`grid gap-2 ${groupColumnsClassName}`}>
                {groups.map((group) => {
                  const selected = group.key === activeGroup?.key;
                  return (
                    <button
                      key={group.key}
                      type="button"
                      onClick={() => {
                        setActiveGroupKey(group.key);
                        setStep("option");
                      }}
                      className={`rounded-md border px-3 py-2 text-sm font-medium transition ${
                        selected
                          ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      {group.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : activeGroup ? (
            <div>
              <div className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-500">
                <span>{optionLabel}</span>
                <span className="text-slate-400">/</span>
                <span className="text-slate-600">{activeGroup.label}</span>
              </div>
              <div className={`grid max-h-72 gap-2 overflow-auto pr-1 ${optionColumnsClassName}`}>
                {activeGroup.options.map((option) => {
                  const selected = option.value === current;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => choose(option.value, close)}
                      className={`rounded-md border px-3 py-2 text-left text-sm transition ${
                        selected
                          ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      {option.description && <span className="block text-xs text-slate-500">{option.description}</span>}
                      <span className="block font-medium">{option.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="grid min-h-32 place-items-center rounded-md border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-400">
              暂无选项
            </div>
          )}
        </>
      )}
    </PickerShell>
  );
}
