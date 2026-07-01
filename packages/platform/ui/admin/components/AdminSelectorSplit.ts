"use client";

import { createMessageSection, createPageBody, type BodySurfaceProps, type BodySurfaceSectionSpec } from "@workspace/core/ui";
import type { ResourceTreeNode } from "./ResourceTree";

interface AdminSelectorSplitOptions<TNode extends ResourceTreeNode> {
  title: string;
  items: TNode[];
  selectedId: string | null;
  sections: BodySurfaceSectionSpec[];
  onSelect: (node: TNode) => void;
  splitRatio?: [number, number];
  emptyContent?: string;
}

export function createAdminSelectorSplitBody<TNode extends ResourceTreeNode>({
  title,
  items,
  selectedId,
  sections,
  onSelect,
  splitRatio = [3, 7],
  emptyContent = "请选择左侧项目",
}: AdminSelectorSplitOptions<TNode>): BodySurfaceProps {
  return {
    kind: "section",
    layout: "split",
    left: {
      kind: "selector",
      selector: {
        kind: "tree",
        title,
        items,
        selectedId,
        onSelect,
        getKey: (item) => item.key,
        getChildren: (item) => item.children as TNode[] | undefined,
        renderItem: (item, ctx) => ({
          title: item.name,
          code: item.statusLabel,
          level: ctx.level,
        }),
      },
    },
    right: createPageBody(sections.length ? sections : [createMessageSection("admin-selector-empty", { content: emptyContent, tone: "muted" })]),
    sideOpen: true,
    drawerOpen: false,
    onSideOpenChange: () => undefined,
    onDrawerOpenChange: () => undefined,
    sideLabel: title,
    showSideControls: false,
    splitRatio,
  };
}
