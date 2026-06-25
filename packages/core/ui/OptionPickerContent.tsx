"use client";

import { type ReactNode } from "react";
import { matchText } from "../search";
import { PickerOptionButton } from "./PickerParts";
import { Empty, OptionGrid } from "./OptionPickerParts";
import SearchInput from "./SearchInput";
import type { PickerGroupItem, PickerOption } from "./OptionPickerTypes";

type PickerStep = "group" | "option";

interface OptionPickerContentProps {
  grouped: boolean;
  current: string;
  isUnset: boolean;
  placeholder: string;
  description?: ReactNode;
  emptyText: string;
  groupLabel: string;
  optionLabel: string;
  changeGroupLabel: string;
  groupItems: PickerGroupItem[];
  activeGroupKey: string;
  setActiveGroupKey: (key: string) => void;
  step: PickerStep;
  setStep: (step: PickerStep) => void;
  gridColumns?: number;
  gridColumnCount?: number;
  gridOptions: PickerOption[];
  visibleGridColumnCount: number;
  hasExplicitEmptyOption: boolean;
  placeholderInGrid: boolean;
  moreOptions: PickerOption[];
  showMore: boolean;
  setShowMore: (updater: (next: boolean) => boolean) => void;
  query: string;
  setQuery: (query: string) => void;
  searchPlaceholder: string;
  choose: (value: string | null) => void;
}

const optionButtonClassName = "whitespace-nowrap";

export default function OptionPickerContent({
  grouped,
  current,
  isUnset,
  placeholder,
  description,
  emptyText,
  groupLabel,
  optionLabel,
  changeGroupLabel,
  groupItems,
  activeGroupKey,
  setActiveGroupKey,
  step,
  setStep,
  gridColumns,
  gridColumnCount,
  gridOptions,
  visibleGridColumnCount,
  hasExplicitEmptyOption,
  placeholderInGrid,
  moreOptions,
  showMore,
  setShowMore,
  query,
  setQuery,
  searchPlaceholder,
  choose,
}: OptionPickerContentProps) {
  if (grouped) {
    return (
      <GroupedOptions
        current={current}
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
        choose={choose}
      />
    );
  }

  return (
    <FlatOptions
      current={current}
      isUnset={isUnset}
      placeholder={placeholder}
      description={description}
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
      gridColumns={gridColumns}
      gridColumnCount={gridColumnCount}
      choose={choose}
    />
  );
}

function GroupedOptions({
  current,
  placeholder,
  description,
  emptyText,
  groupLabel,
  optionLabel,
  changeGroupLabel,
  groupItems,
  activeGroupKey,
  setActiveGroupKey,
  step,
  setStep,
  gridColumns,
  gridColumnCount,
  choose,
}: Omit<OptionPickerContentProps, "grouped" | "isUnset" | "gridOptions" | "visibleGridColumnCount" | "hasExplicitEmptyOption" | "placeholderInGrid" | "moreOptions" | "showMore" | "setShowMore" | "query" | "setQuery" | "searchPlaceholder">) {
  const activeGroup = groupItems.find((group) => group.key === activeGroupKey) ?? groupItems[0];
  const columnCount = gridColumns ?? gridColumnCount ?? 3;

  return (
    <>
      <div className="mb-2 flex items-center justify-between gap-2">
        <PickerOptionButton variant="placeholder" selected={!current} size="compact" onClick={() => choose(null)}>
          {placeholder}
        </PickerOptionButton>
        {step === "option" && groupItems.length > 1 && (
          <PickerOptionButton size="compact" onClick={() => setStep("group")}>
            {changeGroupLabel}
          </PickerOptionButton>
        )}
      </div>

      {description && <p className="mb-2 text-xs text-slate-500">{description}</p>}

      {step === "group" ? (
        groupItems.length === 0 ? (
          <Empty placeholder={emptyText} />
        ) : (
          <div>
            <div className="mb-1.5 text-xs font-medium text-slate-500">{groupLabel}</div>
            <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))` }}>
              {groupItems.map((group) => (
                <PickerOptionButton
                  key={group.key}
                  selected={group.key === activeGroup?.key}
                  size="compact"
                  onClick={() => {
                    setActiveGroupKey(group.key);
                    setStep("option");
                  }}
                >
                  {group.label}
                </PickerOptionButton>
              ))}
            </div>
          </div>
        )
      ) : activeGroup ? (
        <div>
          <div className="mb-1.5 flex items-center gap-2 text-xs font-medium text-slate-500">
            <span>{optionLabel}</span>
            <span className="text-slate-400">/</span>
            <span className="text-slate-600">{activeGroup.label}</span>
          </div>
          {activeGroup.options.length === 0 ? (
            <Empty placeholder={emptyText} />
          ) : (
            <OptionGrid options={activeGroup.options} current={current} onSelect={choose} columns={columnCount} />
          )}
        </div>
      ) : (
        <Empty placeholder={emptyText} />
      )}
    </>
  );
}

function FlatOptions({
  current,
  isUnset,
  placeholder,
  description,
  gridOptions,
  visibleGridColumnCount,
  hasExplicitEmptyOption,
  placeholderInGrid,
  moreOptions,
  showMore,
  setShowMore,
  query,
  setQuery,
  searchPlaceholder,
  gridColumns,
  gridColumnCount,
  choose,
}: Omit<OptionPickerContentProps, "grouped" | "emptyText" | "groupLabel" | "optionLabel" | "changeGroupLabel" | "groupItems" | "activeGroupKey" | "setActiveGroupKey" | "step" | "setStep">) {
  const keyword = query.trim();
  const filteredMore = keyword
    ? moreOptions.filter((option) => matchText(option.label, keyword) || matchText(option.value, keyword))
    : moreOptions;

  return (
    <>
      {description && <p className="mb-2 text-xs text-slate-500">{description}</p>}
      {(!placeholderInGrid || hasExplicitEmptyOption || moreOptions.length > 0) && (
        <div className="mb-2 flex items-center justify-between gap-2">
          {(!placeholderInGrid || hasExplicitEmptyOption) && (
            <PickerOptionButton variant="placeholder" selected={isUnset} size="compact" onClick={() => choose(null)}>
              {placeholder}
            </PickerOptionButton>
          )}
          {moreOptions.length > 0 && (
            <PickerOptionButton selected={showMore} size="compact" onClick={() => setShowMore((next) => !next)}>
              更多
            </PickerOptionButton>
          )}
        </div>
      )}

      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${visibleGridColumnCount}, max-content)` }}>
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
          <SearchInput autoFocus value={query} onChange={setQuery} placeholder={searchPlaceholder} className="mb-2" />
          <div className="max-h-64 overflow-auto pr-1">
            <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${gridColumnCount ?? gridColumns ?? Math.min(3, Math.max(1, filteredMore.length))}, max-content)` }}>
              {filteredMore.map((option) => (
                <PickerOptionButton
                  key={option.value}
                  selected={!isUnset && option.value === current}
                  size="compact"
                  className={optionButtonClassName}
                  onClick={() => choose(option.value)}
                >
                  {option.label}
                </PickerOptionButton>
              ))}
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
}
