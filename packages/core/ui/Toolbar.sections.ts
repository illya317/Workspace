import type { ToolbarItem, ToolbarSection, ToolbarZoneKey } from "./Toolbar.types";

function inferSection(item: ToolbarItem): ToolbarSection {
  switch (item.kind) {
    case "search":
      return "search";
    case "select":
    case "option-group":
    case "field-filter":
    case "period":
      return "filter";
    case "text":
    case "menu":
      return "meta";
    case "column-toggle":
    case "page-size":
      return "view";
    case "create":
    case "panel-toggle":
      return "primary";
    case "action-group":
      return "edit";
    case "edit-group":
      return "edit";
    case "icon-button":
    default:
      return "action";
  }
}

const STRONG_SEMANTIC_SECTIONS: Partial<Record<ToolbarItem["kind"], ToolbarSection>> = {
  create: "primary",
  "panel-toggle": "primary",
  search: "search",
  "column-toggle": "view",
  "page-size": "view",
  period: "filter",
  text: "meta",
  menu: "meta",
};

export function resolveSection(item: ToolbarItem): ToolbarSection {
  const strongSection = STRONG_SEMANTIC_SECTIONS[item.kind];
  if (strongSection) return strongSection;
  return item.section ?? inferSection(item);
}

export function inferZone(item: ToolbarItem): ToolbarZoneKey {
  if (item.section === "primary") return "lead";
  switch (item.kind) {
    case "create":
    case "panel-toggle":
      return "lead";
    case "search":
      return "search";
    case "icon-button":
      return "actions";
    case "select":
    case "option-group":
    case "field-filter":
    case "period":
      return "filter";
    case "action-group":
    case "edit-group":
      return "actions";
    case "text":
    case "menu":
    case "column-toggle":
    case "page-size":
      return "trailing";
    default:
      return "actions";
  }
}
