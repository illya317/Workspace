"use client";

import { useState, type CSSProperties, type Key, type ReactNode } from "react";
import { Tag, Tree, type TreeDataNode, type TreeProps } from "antd";
import type {
  SelectorSurfaceCardSpec,
  SelectorSurfaceStructuredTreeItemSpec,
  SelectorSurfaceTreeSpec,
} from "../../SelectorSurface.types";
import { textOverflowTitle } from "../common/text-overflow";
import { resolveSelectorCardPresentation } from "./selector-split-presentation";
import {
  AntdSelectorEmpty,
  AntdSelectorFrame,
  AntdSelectorInlineEdit,
  AntdSelectorLevelBadge,
  AntdSelectorLoading,
  AntdSelectorMeta,
  AntdSelectorTreeTrailing,
  collectTreeExpandedIds,
  resolveTreeCardMeta,
} from "./antd-selection-shared";

interface AntdSelectorTreeNode<T> extends TreeDataNode {
  value: T;
  children?: AntdSelectorTreeNode<T>[];
}

const FLAT_TREE_STYLE = { "--ant-tree-indent-size": "0px" } as CSSProperties;
const TREE_BRANCH_LINE_COLORS = ["#10b981", "#fbbf24", "#fda4af"] as const;
const TREE_CODE_TAG_COLORS: Record<NonNullable<SelectorSurfaceCardSpec["codeTone"]>, string> = {
  success: "green",
  warning: "gold",
  danger: "red",
  muted: "default",
  default: "default",
};

function treeNodeStyle(branchLineLevel?: number): CSSProperties {
  const color = branchLineLevel
    ? TREE_BRANCH_LINE_COLORS[Math.min(branchLineLevel - 1, TREE_BRANCH_LINE_COLORS.length - 1)]
    : "transparent";
  return {
    borderInlineStart: `3px solid ${color}`,
    marginBottom: 0,
    paddingBottom: 4,
  };
}

/** 初始展开集合：defaultExpandedIds 优先，其次 defaultExpandedLevel，与 legacy 一致。 */
function initialExpandedKeys<T>(selector: SelectorSurfaceTreeSpec<T>): Key[] {
  if (selector.defaultExpandedIds) return [...selector.defaultExpandedIds];
  if (typeof selector.defaultExpandedLevel === "number") {
    return [...collectTreeExpandedIds(selector.items, selector.defaultExpandedLevel)];
  }
  return [];
}

function nodeTitle<T>(
  item: SelectorSurfaceStructuredTreeItemSpec<T>,
  card: SelectorSurfaceCardSpec,
  level: number,
  selected: boolean,
) {
  const meta = resolveTreeCardMeta(card);
  return (
    <span
      className="flex min-w-0 flex-1 items-center gap-2.5"
      data-tree-node-key={String(item.key)}
      data-selected={selected ? "true" : undefined}
    >
      <AntdSelectorLevelBadge card={card} fallbackLevel={level} />
      <span className="min-w-0 flex-1">
        {card.inlineEdit ? <AntdSelectorInlineEdit edit={card.inlineEdit} /> : <span className="block truncate text-sm font-semibold text-slate-900" title={textOverflowTitle(card.title)}>{card.title}</span>}
        {!card.inlineEdit && meta ? <AntdSelectorMeta meta={meta} /> : null}
      </span>
      {card.code ? <Tag className="!mr-0 shrink-0" color={TREE_CODE_TAG_COLORS[card.codeTone ?? "default"]}>{card.code}</Tag> : null}
      {card.inlineEdit ? null : <AntdSelectorTreeTrailing card={card} />}
    </span>
  );
}

function toTreeData<T>(
  items: SelectorSurfaceStructuredTreeItemSpec<T>[],
  level: number,
  selector: SelectorSurfaceTreeSpec<T>,
  presentation: "default" | "compact",
  expandedKeys: ReadonlySet<Key>,
  inheritedBranchLineLevel?: number,
): AntdSelectorTreeNode<T>[] {
  return items.map((item) => {
    const card = resolveSelectorCardPresentation(item.card, presentation);
    const selected = selector.selectedId === item.key;
    const expandedBranch = Boolean(item.children?.length && expandedKeys.has(item.key));
    const branchLineLevel = expandedBranch ? level : inheritedBranchLineLevel;
    const childBranchLineLevel = expandedBranch ? level : inheritedBranchLineLevel;
    return {
      key: item.key,
      value: item.value,
      title: nodeTitle(item, card, level, selected),
      selectable: !card.inlineEdit,
      className: branchLineLevel ? "workspace-tree-branch-line" : undefined,
      style: treeNodeStyle(branchLineLevel),
      children: item.children?.length
        ? toTreeData(item.children, level + 1, selector, presentation, expandedKeys, childBranchLineLevel)
        : undefined,
    };
  });
}

export function AntdSelectorTree<T>({ selector, actions, presentation }: {
  selector: SelectorSurfaceTreeSpec<T>;
  actions: ReactNode;
  presentation: "default" | "compact";
}) {
  const [internalExpandedKeys, setInternalExpandedKeys] = useState<Key[]>(() => initialExpandedKeys(selector));
  // expandedIds 受控优先；onToggle 存在时内部状态不更新（与 legacy toggle 一致，由父级驱动）。
  const expandedKeys = selector.collapsible === false
    ? [...collectTreeExpandedIds(selector.items, Number.MAX_SAFE_INTEGER)]
    : selector.expandedIds ? [...selector.expandedIds] : internalExpandedKeys;

  const handleExpand: NonNullable<TreeProps["onExpand"]> = (keys, info) => {
    if (selector.collapsible === false) return;
    if (selector.onToggle) {
      selector.onToggle(info.node.key as string | number, info.expanded);
      return;
    }
    setInternalExpandedKeys(keys);
  };

  // legacy 行点击总是调用 onSelect(value)；antd 重复点击已选节点会触发反选，
  // 这里无论选中/反选都回传节点 value，保持 selected-key 契约与回调语义。
  const handleSelect: NonNullable<TreeProps["onSelect"]> = (_keys, info) => {
    const node = info.node as unknown as AntdSelectorTreeNode<T>;
    selector.onSelect(node.value);
  };

  function renderContent() {
    if (selector.loading) return <AntdSelectorLoading text={selector.loadingText} />;
    if (selector.items.length === 0) return <AntdSelectorEmpty text={selector.emptyText} />;
    const expandedKeySet = new Set(expandedKeys);
    return (
      <Tree
        blockNode
        className="[&_.ant-tree-node-content-wrapper]:flex [&_.ant-tree-node-content-wrapper]:min-w-0 [&_.ant-tree-node-selected]:!bg-emerald-50"
        data-tree-indent-mode="flat-guided"
        expandedKeys={expandedKeys}
        onExpand={handleExpand}
        onSelect={handleSelect}
        selectedKeys={selector.selectedId === null || selector.selectedId === undefined ? [] : [selector.selectedId]}
        style={FLAT_TREE_STYLE}
        switcherIcon={selector.collapsible === false ? <span aria-hidden="true" /> : undefined}
        treeData={toTreeData(selector.items, 1, selector, presentation, expandedKeySet)}
      />
    );
  }

  return (
    <AntdSelectorFrame actions={actions} title={selector.title}>
      {renderContent()}
    </AntdSelectorFrame>
  );
}
