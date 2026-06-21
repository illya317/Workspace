"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FieldValueFilter, SearchInput, SelectField, ToolbarOptionGroup } from "@workspace/core/ui";
import type { AdvancedFilterConfig, FilterConfig } from "@workspace/hr/types";
import type { FieldValueFilterField, SelectFieldOption } from "@workspace/core/ui";

interface GenericToolbarFiltersProps {
  filters: FilterConfig[];
  advancedFilters?: AdvancedFilterConfig[];
  filterValues: Record<string, unknown>;
  onFilterChange: (key: string, value: string) => void;
}

export default function GenericToolbarFilters({
  filters,
  advancedFilters = [],
  filterValues,
  onFilterChange,
}: GenericToolbarFiltersProps) {
  const toolbarAdvancedFilters = useMemo(() => {
    const inlineKeys = new Set(filters.map((filter) => filter.key));
    return advancedFilters.filter((filter) => !inlineKeys.has(filter.key) && !inlineKeys.has(filter.queryParam));
  }, [advancedFilters, filters]);

  const [advancedFieldKey, setAdvancedFieldKey] = useState("");
  const advancedFieldKeyRef = useRef(advancedFieldKey);

  useEffect(() => {
    if (toolbarAdvancedFilters.length === 0) {
      advancedFieldKeyRef.current = "";
      setAdvancedFieldKey("");
      return;
    }
    setAdvancedFieldKey((current) => {
      const next = toolbarAdvancedFilters.some((filter) => filter.key === current) ? current : "";
      advancedFieldKeyRef.current = next;
      return next;
    });
  }, [toolbarAdvancedFilters]);

  const advancedFields = useMemo<FieldValueFilterField[]>(
    () =>
      toolbarAdvancedFilters.map((filter) => ({
        label: filter.label,
        value: filter.key,
        valueKind: filter.kind === "fk" ? "fk" : "text",
        fkKey: filter.fkKey ?? filter.entity,
        fkReturnField: filter.returnField,
        referenceEndpoint: filter.kind === "fk" ? "/api/modules/hr/reference-options" : undefined,
        lifecycleScope: filter.kind === "fk" ? "all" : undefined,
        placeholder: filter.placeholder,
      })),
    [toolbarAdvancedFilters],
  );

  const advancedValueOptions = useMemo<Record<string, SelectFieldOption[]>>(() => {
    const next: Record<string, SelectFieldOption[]> = {};
    for (const filter of toolbarAdvancedFilters) {
      if (filter.kind === "boolean") {
        next[filter.key] = [
          { label: "全部", value: "" },
          { label: "是", value: "true" },
          { label: "否", value: "false" },
        ];
      }
      if (filter.kind === "select") {
        next[filter.key] = [
          { label: "全部", value: "" },
          ...(filter.options ?? []),
        ];
      }
    }
    return next;
  }, [toolbarAdvancedFilters]);

  const selectedAdvancedFilter = toolbarAdvancedFilters.find((filter) => filter.key === advancedFieldKey);

  function handleAdvancedFieldChange(nextKey: string) {
    const currentKey = advancedFieldKeyRef.current;
    if (currentKey && nextKey !== currentKey) {
      const currentFilter = toolbarAdvancedFilters.find((filter) => filter.key === currentKey);
      if (currentFilter) onFilterChange(currentFilter.queryParam, "");
    }
    advancedFieldKeyRef.current = nextKey;
    setAdvancedFieldKey(nextKey);
  }

  function handleAdvancedValueChange(value: string) {
    const targetKey = advancedFieldKeyRef.current || advancedFieldKey;
    const targetFilter = toolbarAdvancedFilters.find((filter) => filter.key === targetKey);
    if (targetFilter) onFilterChange(targetFilter.queryParam, value);
  }

  return (
    <>
      {filters?.map((f) =>
        f.type === "boolean" && f.key === "isActive" ? (
          <ToolbarOptionGroup
            key={f.key}
            value={(filterValues[f.key] as string) ?? ""}
            onChange={(value) => onFilterChange(f.key, value)}
            ariaLabel={f.label}
            options={[
              { label: "全部", value: "" },
              { label: "在职", value: "true" },
              { label: "离职", value: "false" },
            ]}
          />
        ) : f.type === "boolean" ? (
          <SelectField
            key={f.key}
            value={(filterValues[f.key] as string) ?? ""}
            onChange={(value) => onFilterChange(f.key, value ?? "")}
            label={f.label}
            options={[
              { label: "是", value: "true" },
              { label: "否", value: "false" },
            ]}
            placeholder="全部"
            size="toolbar"
          />
        ) : f.type === "select" && f.options ? (
          <SelectField
            key={f.key}
            value={(filterValues[f.key] as string) ?? ""}
            onChange={(value) => onFilterChange(f.key, value ?? "")}
            label={f.label}
            options={f.options}
            placeholder="全部"
            size="toolbar"
          />
        ) : (
          <SearchInput
            key={f.key}
            value={(filterValues[f.key] as string) ?? ""}
            onChange={(value) => onFilterChange(f.key, value)}
            placeholder={f.label}
            size="toolbar"
          />
        )
      )}

      {advancedFields.length > 0 && (
        <FieldValueFilter
          fields={advancedFields}
          valueOptions={advancedValueOptions}
          referenceEndpoint="/api/modules/hr/reference-options"
          fieldKey={advancedFieldKey}
          onFieldKeyChange={handleAdvancedFieldChange}
          value={selectedAdvancedFilter ? ((filterValues[selectedAdvancedFilter.queryParam] as string) ?? "") : ""}
          onValueChange={handleAdvancedValueChange}
          placeholder="筛选"
        />
      )}
    </>
  );
}
