import type { FormSurfaceItemSpec } from "@workspace/core/ui";

export function readOnlyBusinessCodeEditorItems(
  items: FormSurfaceItemSpec[],
): FormSurfaceItemSpec[] {
  return items.map((item) => {
    if (item.kind === "repeatable") {
      return {
        ...item,
        addAction: undefined,
        items: item.items.map((row) => ({
          ...row,
          actions: undefined,
          items: readOnlyBusinessCodeEditorItems(row.items),
        })),
      };
    }
    if (item.kind === "section") {
      return { ...item, actions: undefined, items: readOnlyBusinessCodeEditorItems(item.items) };
    }
    if ("spec" in item) {
      const options = item.spec.options;
      const selected = options?.source === "static"
        ? options.items.find((option) => option.value === String(item.value ?? ""))
        : undefined;
      return {
        kind: "readonly",
        key: item.key,
        label: item.label,
        value: selected?.label ?? item.value ?? "—",
        hint: item.hint,
        error: item.error,
        span: item.span,
        rowSpan: item.rowSpan,
      };
    }
    return item;
  });
}
