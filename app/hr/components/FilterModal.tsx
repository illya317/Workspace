"use client";

import { useState } from "react";
import { DetailModal, SearchInput, getFieldInputClassName, getToolbarActionClassName } from "@workspace/core/ui";
import FilterSearchInput from "./FilterSearchInput";
import CalendarDateInput from "./CalendarDateInput";
import OptionPicker from "./OptionPicker";
import type { AdvancedFilterConfig } from "../types";

interface FilterCondition {
  field: string;
  value: string;
}

interface Props {
  open: boolean;
  filters: AdvancedFilterConfig[];
  onClose: () => void;
  onApply: (conditions: Record<string, string>) => void;
  onReset: () => void;
}

export default function FilterModal({ open, filters, onClose, onApply, onReset }: Props) {
  const [conditions, setConditions] = useState<FilterCondition[]>([{ field: "", value: "" }]);

  if (!open) return null;

  function updateCondition(index: number, patch: Partial<FilterCondition>) {
    setConditions((prev) =>
      prev.map((c, i) => (i === index ? { ...c, ...patch } : c))
    );
  }

  function addCondition() {
    setConditions((prev) => [...prev, { field: "", value: "" }]);
  }

  function removeCondition(index: number) {
    setConditions((prev) => prev.filter((_, i) => i !== index));
  }

  function handleApply() {
    const result: Record<string, string> = {};
    for (const c of conditions) {
      const filter = filters.find((item) => item.key === c.field);
      if (filter && c.value !== "" && c.value !== undefined && c.value !== null) {
        result[filter.queryParam] = c.value;
      }
    }
    onApply(result);
    onClose();
  }

  function handleReset() {
    setConditions([{ field: "", value: "" }]);
    onReset();
    onClose();
  }

  return (
    <DetailModal open title="高级筛选" onClose={onClose} maxWidth="max-w-md">
        <div className="space-y-3 pr-1">
          {conditions.map((c, i) => {
            const filter = filters.find((item) => item.key === c.field);
            return (
              <div key={i} className="flex items-center gap-2">
                <OptionPicker
                  value={c.field}
                  onChange={(value) => updateCondition(i, { field: value ?? "", value: "" })}
                  options={filters.map((filterItem) => ({ label: filterItem.label, value: filterItem.key }))}
                  placeholder="选择字段"
                  buttonClassName={getFieldInputClassName("text-left text-gray-700")}
                  className="flex-1"
                />

                {filter?.kind === "boolean" ? (
                  <OptionPicker
                    value={c.value}
                    onChange={(value) => updateCondition(i, { value: value ?? "" })}
                    options={[
                      { label: "是", value: "true" },
                      { label: "否", value: "false" },
                    ]}
                    placeholder="请选择"
                    buttonClassName={getFieldInputClassName("text-left text-gray-700")}
                    className="flex-1"
                  />
                ) : filter?.kind === "select" ? (
                  <OptionPicker
                    value={c.value}
                    onChange={(value) => updateCondition(i, { value: value ?? "" })}
                    options={filter.options ?? []}
                    placeholder="请选择"
                    buttonClassName={getFieldInputClassName("text-left text-gray-700")}
                    className="flex-1"
                  />
                ) : filter?.kind === "date" ? (
                  <CalendarDateInput
                    value={c.value}
                    onChange={(value) => updateCondition(i, { value: value ?? "" })}
                    className={getFieldInputClassName("flex-1 text-gray-700")}
                  />
                ) : filter?.kind === "fk" && filter.entity ? (
                  <FilterSearchInput
                    value={c.value}
                    onChange={(v) => updateCondition(i, { value: v })}
                    entity={filter.entity}
                    fkKey={filter.fkKey}
                    returnField={filter.returnField}
                    placeholder={filter.placeholder ?? "输入搜索..."}
                    size="compact"
                    className="flex-1"
                  />
                ) : (
                  <SearchInput
                    value={c.value}
                    onChange={(value) => updateCondition(i, { value })}
                    placeholder={filter?.placeholder ?? "输入搜索..."}
                    size="compact"
                    className="flex-1"
                  />
                )}

                <button
                  onClick={() => removeCondition(i)}
                  className="shrink-0 text-gray-400 hover:text-red-500"
                  title="移除"
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>

        <button
          onClick={addCondition}
          className="mt-3 text-sm text-emerald-600 hover:text-emerald-700"
        >
          + 添加条件
        </button>

        <div className="mt-5 flex justify-end gap-3">
          <button
            onClick={handleReset}
            className={getToolbarActionClassName("secondary")}
          >
            重置
          </button>
          <button
            onClick={handleApply}
            className={getToolbarActionClassName("primary")}
          >
            应用
          </button>
        </div>
    </DetailModal>
  );
}
