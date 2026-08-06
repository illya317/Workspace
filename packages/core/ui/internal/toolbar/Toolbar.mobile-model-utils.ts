import type { ToolbarGroupedItems } from "./Toolbar.layout";
import {
  getOrderedActions,
  getToolbarItemActions,
  type ToolbarRenderableAction,
} from "./toolbar-action-model";
import type { ToolbarItem } from "./Toolbar.types";

export type MobileToolbarCommand =
  | { type: "lead"; item: ToolbarItem }
  | { type: "item"; item: ToolbarItem }
  | { type: "action"; action: ToolbarRenderableAction };

export interface MobileToolbarModel {
  commands: MobileToolbarCommand[];
  overflowLeadItems: ToolbarItem[];
  overflowActions: ToolbarRenderableAction[];
  hasFilters: boolean;
  hasMore: boolean;
}

const MAX_MOBILE_COMMANDS = 3;

export function resolveMobileToolbarModel(grouped: ToolbarGroupedItems): MobileToolbarModel {
  const orderedActions = getOrderedActions(grouped.actions.flatMap(getToolbarItemActions));
  const prioritizedLeadItems = prioritizeLeadItems(grouped.lead);
  const directActionItems = grouped.actions.filter((item) => item.kind === "file");
  const commandCandidates: MobileToolbarCommand[] = [];

  if (prioritizedLeadItems[0]) commandCandidates.push({ type: "lead", item: prioritizedLeadItems[0] });
  if (directActionItems[0]) commandCandidates.push({ type: "item", item: directActionItems[0] });
  if (orderedActions[0]) commandCandidates.push({ type: "action", action: orderedActions[0] });
  for (const item of directActionItems.slice(1)) commandCandidates.push({ type: "item", item });
  for (const item of prioritizedLeadItems.slice(1)) commandCandidates.push({ type: "lead", item });

  const commands = commandCandidates.slice(0, MAX_MOBILE_COMMANDS);
  const visibleLeadItems = new Set(
    commands.filter((command) => command.type === "lead").map((command) => command.item),
  );
  const visibleActions = new Set(
    commands.filter((command) => command.type === "action").map((command) => command.action),
  );
  const overflowLeadItems = prioritizedLeadItems.filter((item) => !visibleLeadItems.has(item));
  const overflowActions = orderedActions.filter((action) => !visibleActions.has(action));
  const hasFilters = grouped.filter.length > 0;
  const hasMore = overflowLeadItems.length > 0 || overflowActions.length > 0 || grouped.trailing.length > 0;

  return { commands, overflowLeadItems, overflowActions, hasFilters, hasMore };
}

function prioritizeLeadItems(items: ToolbarItem[]) {
  const createItem = items.find((item) => item.kind === "create");
  if (!createItem) return items;
  return [createItem, ...items.filter((item) => item !== createItem)];
}
