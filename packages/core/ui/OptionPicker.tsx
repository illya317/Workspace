"use client";

import { useMemo, useState } from "react";
import { matchText } from "../search";
import PickerShell from "./PickerShell";
import { PickerOptionButton } from "./PickerParts";
import SearchInput from "./SearchInput";

export interface PickerOption {
  label: string;
  value: string;
}

export interface OptionPickerProps {
  value: unknown;
  options: PickerOption[];
  disabled?: boolean;
  onChange: (value: string | null) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  commonValues?: string[];
  visibleCount?: number;
  gridColumnCount?: number;
  placeholderInGrid?: boolean;
  className?: string;
  buttonClassName?: string;
  popoverClassName?: string;
}

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

const optionButtonClassName = "whitespace-nowrap";

export default function OptionPicker({
  value,
  options,
  disabled,
  onChange,
  placeholder = "未设置",
  searchPlaceholder = "搜索选项",
  commonValues,
  visibleCount = 6,
  gridColumnCount,
  placeholderInGrid = false,
  className,
  buttonClassName,
  popoverClassName,
}: OptionPickerProps) {
  const current = normalizeValue(value);
  const [showMore, setShowMore] = useState(false);
  const [query, setQuery] = useState("");

  const normalizedOptions = useMemo(() => uniqOptions(options), [options]);
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

  const filteredMore = useMemo(() => {
    const keyword = query.trim();
    if (!keyword) return moreOptions;
    return moreOptions.filter((option) => matchText(option.label, keyword) || matchText(option.value, keyword));
  }, [moreOptions, query]);

  const isUnset = current === "" && !hasExplicitEmptyOption;
  const currentLabel = isUnset ? "" : (valueToLabel.get(current) ?? current);
  const gridOptions = placeholderInGrid && !hasExplicitEmptyOption
    ? [{ label: placeholder, value: "" }, ...visibleOptions]
    : visibleOptions;
  const visibleGridColumnCount = gridColumnCount ?? Math.min(3, Math.max(1, gridOptions.length));

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
        if (!open) resetPopup();
      }}
    >
      {({ close }) => {
        function choose(next: string | null) {
          onChange(next);
          resetPopup();
          close();
        }

        return (
          <>
            {(!placeholderInGrid || hasExplicitEmptyOption || moreOptions.length > 0) && (
              <div className="mb-2 flex items-center justify-between gap-2">
                {(!placeholderInGrid || hasExplicitEmptyOption) && (
                  <PickerOptionButton
                    variant="placeholder"
                    selected={isUnset}
                    size="compact"
                    onClick={() => choose(null)}
                  >
                    {placeholder}
                  </PickerOptionButton>
                )}
                {moreOptions.length > 0 && (
                  <PickerOptionButton
                    selected={showMore}
                    size="compact"
                    onClick={() => setShowMore((next) => !next)}
                  >
                    更多
                  </PickerOptionButton>
                )}
              </div>
            )}

            <div
              className="grid gap-2"
              style={{ gridTemplateColumns: `repeat(${visibleGridColumnCount}, max-content)` }}
            >
              {gridOptions.map((option) => {
                const isPlaceholderOption = option.value === "";
                const selected = isPlaceholderOption ? isUnset : !isUnset && option.value === current;
                return (
                  <PickerOptionButton
                    key={option.value}
                    variant={isPlaceholderOption ? "placeholder" : "default"}
                    selected={selected}
                    size="compact"
                    className={optionButtonClassName}
                    onClick={() => choose(isPlaceholderOption ? null : option.value)}
                  >
                    {option.label}
                  </PickerOptionButton>
                );
              })}
            </div>

            {showMore && moreOptions.length > 0 && (
              <div className="mt-2 border-t border-slate-100 pt-2">
                <SearchInput
                  autoFocus
                  value={query}
                  onChange={setQuery}
                  placeholder={searchPlaceholder}
                  className="mb-2"
                />
                <div className="max-h-64 overflow-auto pr-1">
                  <div
                    className="grid gap-2"
                    style={{ gridTemplateColumns: `repeat(${gridColumnCount ?? Math.min(3, Math.max(1, filteredMore.length))}, max-content)` }}
                  >
                    {filteredMore.map((option) => {
                      const selected = !isUnset && option.value === current;
                      return (
                        <PickerOptionButton
                          key={option.value}
                          selected={selected}
                          size="compact"
                          className={optionButtonClassName}
                          onClick={() => choose(option.value)}
                        >
                          {option.label}
                        </PickerOptionButton>
                      );
                    })}
                  </div>
                  {filteredMore.length === 0 && (
                    <div className="rounded-md border border-dashed border-slate-200 px-3 py-6 text-center text-sm text-slate-400">
                      没有匹配项
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        );
      }}
    </PickerShell>
  );
}
