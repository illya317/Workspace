import type { SurfaceFilterFieldSpec, SurfaceSelectOptionSpec, SurfaceToolbarItem, SurfaceToolbarItems } from "@workspace/core/ui";
import type { AdvancedFilterConfig, FilterConfig } from "@workspace/hr/types";

export function mapAdvancedFilterField(filter: AdvancedFilterConfig): SurfaceFilterFieldSpec {
  const base: SurfaceFilterFieldSpec = { value: filter.key, label: filter.label, placeholder: filter.placeholder };
  if (filter.kind === "fk") {
    return {
      ...base,
      valueKind: "fk",
      fkKey: filter.fkKey ?? filter.entity,
      fkReturnField: filter.returnField,
      referenceEndpoint: "/api/modules/hr/roster/reference-options",
      lifecycleScope: "all",
    };
  }
  return base;
}

export function buildAdvancedFilterValueOptions(
  advancedFilters: AdvancedFilterConfig[],
): Record<string, SurfaceSelectOptionSpec[]> {
  const next: Record<string, SurfaceSelectOptionSpec[]> = {};
  for (const filter of advancedFilters) {
    if (filter.kind === "boolean") {
      next[filter.key] = [
        { label: "全部", value: "" },
        { label: "是", value: "true" },
        { label: "否", value: "false" },
      ];
    } else if (filter.kind === "select" && filter.options) {
      next[filter.key] = [{ label: "全部", value: "" }, ...filter.options];
    }
  }
  return next;
}

export function buildInlineFilterItems(
  filterConfigs: FilterConfig[],
  filterValues: Record<string, string>,
  onChange: (key: string, value: string) => void,
): SurfaceToolbarItems {
  return filterConfigs.map((filter): SurfaceToolbarItem => {
    const value = filterValues[filter.key] ?? "";
    if (filter.type === "boolean") {
      const isActive = filter.key === "isActive";
      return {
        kind: "option-group",
        key: filter.key,
        value,
        options: isActive
          ? [
              { label: "全部", value: "" },
              { label: "在职", value: "true" },
              { label: "离职", value: "false" },
            ]
          : [
              { label: "全部", value: "" },
              { label: "是", value: "true" },
              { label: "否", value: "false" },
            ],
        onChange: (next) => onChange(filter.key, next),
        ariaLabel: filter.label,
      };
    }
    if (filter.type === "select" && filter.options) {
      return {
        kind: "select",
        key: filter.key,
        value,
        options: filter.options,
        onChange: (next) => onChange(filter.key, next),
        label: filter.label,
        placeholder: "全部",
      };
    }
    return {
      kind: "field-filter",
      key: filter.key,
      fields: [{ value: filter.key, label: filter.label, valueKind: "text", placeholder: filter.label }],
      valueOptions: {},
      fieldKey: filter.key,
      onFieldKeyChange: () => {},
      value,
      onValueChange: (next) => onChange(filter.key, next),
    };
  });
}
