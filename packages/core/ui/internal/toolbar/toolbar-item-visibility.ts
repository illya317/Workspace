import type { ToolbarItem, ToolbarVisibility } from "./Toolbar.types";

export function filterToolbarItemsByViewport(
  items: ToolbarItem[],
  viewport?: Exclude<ToolbarVisibility, "always">,
) {
  if (!viewport) return items;
  return items.filter((item) => (
    !item.visibility || item.visibility === "always" || item.visibility === viewport
  ));
}
