"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import PickerShell from "./PickerShell";
import { PickerOptionButton } from "./PickerParts";

export interface PickerOptionItem {
  value: string;
  label: string;
  description?: string;
}

export interface PickerGroupItem {
  key: string;
  label: string;
  options: PickerOptionItem[];
}

export interface PickerProps {
  value: unknown;
  onChange: (value: string | null) => void;
  options?: PickerOptionItem[];
  groups?: PickerGroupItem[];
  placeholder?: string;
  description?: ReactNode;
  emptyText?: string;
  groupLabel?: string;
  optionLabel?: string;
  changeGroupLabel?: string;
  gridColumns?: number;
  formatValueLabel?: (value: string, option?: PickerOptionItem, group?: PickerGroupItem) => string;
  disabled?: boolean;
  className?: string;
  buttonClassName?: string;
  popoverClassName?: string;
}

function normalizeValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "";
  return String(value);
}

function findCurrentMatch(groups: PickerGroupItem[], current: string) {
  for (const group of groups) {
    const option = group.options.find((item) => item.value === current);
    if (option) return { group, option };
  }
  return null;
}

export default function Picker({
  value,
  onChange,
  options,
  groups,
  placeholder = "未设置",
  description,
  emptyText = "暂无选项",
  groupLabel = "分类",
  optionLabel = "选项",
  changeGroupLabel = "更换分类",
  gridColumns,
  formatValueLabel,
  disabled,
  className,
  buttonClassName,
  popoverClassName,
}: PickerProps) {
  const current = normalizeValue(value);
  const directOptions = options ?? [];
  const groupItems = groups ?? [];
  const grouped = groupItems.length > 0;
  const currentMatch = grouped ? findCurrentMatch(groupItems, current) : null;

  const valueLabel = current
    ? formatValueLabel?.(current, currentMatch?.option, currentMatch?.group)
        ?? directOptions.find((o) => o.value === current)?.label
        ?? groupItems.flatMap((g) => g.options).find((o) => o.value === current)?.label
        ?? current
    : "";

  return (
    <PickerShell
      valueLabel={valueLabel}
      placeholder={placeholder}
      disabled={disabled}
      className={className}
      buttonClassName={buttonClassName}
      popoverClassName={popoverClassName}
    >
      {({ close, open }) => (
        <PickerBody
          current={current}
          open={open}
          onChange={(next) => {
            onChange(next);
            close();
          }}
          options={options}
          groups={groups}
          placeholder={placeholder}
          description={description}
          emptyText={emptyText}
          groupLabel={groupLabel}
          optionLabel={optionLabel}
          changeGroupLabel={changeGroupLabel}
          gridColumns={gridColumns}
        />
      )}
    </PickerShell>
  );
}

interface PickerBodyProps {
  current: string;
  open: boolean;
  onChange: (value: string | null) => void;
  options?: PickerOptionItem[];
  groups?: PickerGroupItem[];
  placeholder: string;
  description?: ReactNode;
  emptyText: string;
  groupLabel: string;
  optionLabel: string;
  changeGroupLabel: string;
  gridColumns?: number;
}

function PickerBody({
  current,
  open,
  onChange,
  options,
  groups,
  placeholder,
  description,
  emptyText,
  groupLabel,
  optionLabel,
  changeGroupLabel,
  gridColumns,
}: PickerBodyProps) {
  const directOptions = options ?? [];
  const groupItems = useMemo(() => groups ?? [], [groups]);
  const grouped = groupItems.length > 0;

  const currentMatch = grouped ? findCurrentMatch(groupItems, current) : null;
  const [activeGroupKey, setActiveGroupKey] = useState(currentMatch?.group.key || groupItems[0]?.key || "");
  const [step, setStep] = useState<"group" | "option">(currentMatch ? "option" : "group");

  // Reset step/active group when the popover opens so the latest value is reflected.
  const prevOpenRef = useRef(open);
  useEffect(() => {
    if (open && !prevOpenRef.current) {
      const match = grouped ? findCurrentMatch(groupItems, current) : null;
      setActiveGroupKey(match?.group.key || groupItems[0]?.key || "");
      setStep(match ? "option" : "group");
    }
    prevOpenRef.current = open;
  }, [open, current, grouped, groupItems]);

  const activeGroup = groupItems.find((group) => group.key === activeGroupKey) ?? groupItems[0];

  function choose(nextValue: string | null) {
    onChange(nextValue);
    setStep("group");
  }

  const visibleColumns = gridColumns ?? 3;

  return (
    <>
      <div className="mb-2 flex items-center justify-between gap-2">
        <PickerOptionButton
          variant="placeholder"
          selected={!current}
          size="compact"
          onClick={() => choose(null)}
        >
          {placeholder}
        </PickerOptionButton>
        {grouped && step === "option" && groupItems.length > 1 && (
          <PickerOptionButton size="compact" onClick={() => setStep("group")}>
            {changeGroupLabel}
          </PickerOptionButton>
        )}
      </div>

      {description && <p className="mb-2 text-xs text-slate-500">{description}</p>}

      {!grouped ? (
        directOptions.length === 0 ? (
          <Empty placeholder={emptyText} />
        ) : (
          <OptionGrid
            options={directOptions}
            current={current}
            onSelect={(value) => choose(value)}
            columns={visibleColumns}
          />
        )
      ) : step === "group" ? (
        groupItems.length === 0 ? (
          <Empty placeholder={emptyText} />
        ) : (
          <div>
            <div className="mb-1.5 text-xs font-medium text-slate-500">{groupLabel}</div>
            <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${visibleColumns}, minmax(0, 1fr))` }}>
              {groupItems.map((group) => {
                const selected = group.key === activeGroup?.key;
                return (
                  <PickerOptionButton
                    key={group.key}
                    selected={selected}
                    size="compact"
                    onClick={() => {
                      setActiveGroupKey(group.key);
                      setStep("option");
                    }}
                  >
                    {group.label}
                  </PickerOptionButton>
                );
              })}
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
            <OptionGrid
              options={activeGroup.options}
              current={current}
              onSelect={(value) => choose(value)}
              columns={visibleColumns}
            />
          )}
        </div>
      ) : (
        <Empty placeholder={emptyText} />
      )}
    </>
  );
}

function OptionGrid({
  options,
  current,
  onSelect,
  columns,
}: {
  options: PickerOptionItem[];
  current: string;
  onSelect: (value: string) => void;
  columns: number;
}) {
  return (
    <div className="grid max-h-72 gap-2 overflow-auto pr-1" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
      {options.map((option) => {
        const selected = option.value === current;
        return (
          <PickerOptionButton
            key={option.value}
            selected={selected}
            size="compact"
            onClick={() => onSelect(option.value)}
          >
            {option.description && <span className="block text-[11px] text-slate-500">{option.description}</span>}
            <span className="block font-medium">{option.label}</span>
          </PickerOptionButton>
        );
      })}
    </div>
  );
}

function Empty({ placeholder }: { placeholder: string }) {
  return (
    <div className="grid min-h-32 place-items-center rounded-md border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-400">
      {placeholder}
    </div>
  );
}
