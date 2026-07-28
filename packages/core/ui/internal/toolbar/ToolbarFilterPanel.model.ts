import type { ToolbarFilterPanelFieldSpec } from "./Toolbar.types";

export const TOOLBAR_FILTER_PANEL_SURFACE_CLASS_NAME = "w-fit max-w-[min(28rem,calc(100vw-1rem))] overflow-hidden p-0";

export interface ActiveToolbarFilterPanelField {
  key: string;
  label: string;
  valueLabel: string;
  onClear: () => void;
}

export function getActiveToolbarFilterPanelFields(
  fields: ToolbarFilterPanelFieldSpec[],
): ActiveToolbarFilterPanelField[] {
  return fields.flatMap((field) => {
    if (!field.value) return [];
    const option = field.options.find((candidate) => candidate.value === field.value);
    return [{
      key: field.key,
      label: field.label,
      valueLabel: option?.label ?? field.value,
      onClear: () => field.onChange(""),
    }];
  });
}
