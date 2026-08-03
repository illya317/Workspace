"use client";

import { createMasterDetailBody, createMessageSection, createPageBody, type BodySurfaceProps, type BodySurfaceSectionSpec, type SelectorSurfaceStructuredTreeItemSpec } from "@workspace/core/ui";
import type { ResourceTreeNode } from "./ResourceTree";

interface AdminSelectorSplitOptions<TNode extends ResourceTreeNode> {
  title: string;
  items: TNode[];
  selectedId: string | null;
  sections: BodySurfaceSectionSpec[];
  onSelect: (node: TNode) => void;
  splitRatio?: [number, number];
  emptyContent?: string;
  expandedIds?: Iterable<string | number>;
  onToggle?: (id: string | number, expanded: boolean) => void;
}

export function createAdminSelectorSplitBody<TNode extends ResourceTreeNode>({
  title,
  items,
  selectedId,
  sections,
  onSelect,
  splitRatio = [3, 7],
  emptyContent = "请选择左侧项目",
  expandedIds,
  onToggle,
}: AdminSelectorSplitOptions<TNode>): BodySurfaceProps {
  function declareItems(nodes: TNode[]): SelectorSurfaceStructuredTreeItemSpec<TNode>[] {
    return nodes.map((item) => ({
      key: item.key,
      value: item,
      card: { title: item.name, code: item.statusLabel },
      children: item.children?.length ? declareItems(item.children as TNode[]) : undefined,
    }));
  }

  return createMasterDetailBody({
    master: { label: title, presentation: "compact", body: {
      kind: "selector",
      selector: {
        kind: "tree",
        title,
        items: declareItems(items),
        selectedId,
        onSelect,
        expandedIds,
        onToggle,
      },
    } },
    detail: createPageBody(sections.length ? sections : [createMessageSection("admin-selector-empty", { content: emptyContent, tone: "muted" })]),
    desktop: { ratio: splitRatio },
  });
}
