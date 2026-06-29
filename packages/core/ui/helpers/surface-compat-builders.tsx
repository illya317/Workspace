import type { SelectorPanelProps, SelectorPanelTreeProps } from "../internal/selection/SelectorPanel";
import type { BodySurfaceSectionSpec } from "../BodySurface";
import type { ReactNode } from "react";

export type SelectorPanelSectionHelperOptions = Record<string, never>;

function isTreeSelectorProps<T>(props: SelectorPanelProps<T>): props is SelectorPanelTreeProps<T> {
  return props.mode === "tree";
}

function normalizeSelectorMeta(meta: unknown): ReactNode[] | ReactNode | undefined {
  if (!Array.isArray(meta)) return meta as ReactNode | undefined;
  return meta.map((item, index) => {
    if (typeof item === "object" && item && "value" in item) {
      const metaItem = item as { label?: ReactNode; value: ReactNode };
      return (
        <span key={index}>
          {metaItem.label ? <span>{metaItem.label} </span> : null}
          {metaItem.value}
        </span>
      );
    }
    return item as ReactNode;
  });
}

export function createSelectorPanelSection<T>(
  key: string,
  props: SelectorPanelProps<T>,
  _options: SelectorPanelSectionHelperOptions = {},
): BodySurfaceSectionSpec {
  if (props.mode === "grid") {
    throw new Error(`createSelectorPanelSection(${key}) no longer supports grid mode; use a dedicated selector surface spec.`);
  }
  const base = {
    title: props.title,
    items: props.items,
    selectedId: props.selectedId,
    onSelect: props.onSelect,
    getKey: props.getKey,
    filter: props.filter,
    loading: props.loading,
    loadingText: props.loadingText,
    emptyText: props.emptyText,
  };
  return {
    key,
    body: {
      kind: "selector",
      selector: isTreeSelectorProps(props)
        ? {
            ...base,
            kind: "tree",
            getChildren: props.getChildren,
            renderItem: (item: T, ctx: { active: boolean; level: number; expanded?: boolean; hasChildren?: boolean }) => {
              const card = props.renderItem(item, { ...ctx, expanded: Boolean(ctx.expanded), hasChildren: Boolean(ctx.hasChildren) });
              return { ...card, meta: normalizeSelectorMeta(card.meta) };
            },
            expandedIds: props.expandedIds,
            defaultExpandedIds: props.defaultExpandedIds,
            onToggle: props.onToggle,
            collapsible: props.collapsible,
          }
        : {
            ...base,
            kind: "list",
            renderItem: (item: T, ctx: { active: boolean; level: number }) => {
              const card = props.renderItem(item, ctx);
              return { ...card, meta: normalizeSelectorMeta(card.meta) };
            },
            groupBy: props.groupBy,
            size: props.size,
          },
    },
  };
}
