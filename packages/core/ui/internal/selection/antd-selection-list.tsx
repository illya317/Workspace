"use client";

import type { KeyboardEvent, ReactNode } from "react";
import { Tag } from "antd";
import type {
  SelectorSurfaceStructuredListItemSpec,
  SelectorSurfaceStructuredListSpec,
} from "../../SelectorSurface.types";
import { joinClassNames } from "../common/card-utils";
import { textOverflowTitle } from "../common/text-overflow";
import { resolveSelectorCardPresentation } from "./selector-split-presentation";
import {
  AntdSelectorEmpty,
  AntdSelectorFrame,
  AntdSelectorInlineEdit,
  AntdSelectorListTrailing,
  AntdSelectorLoading,
  AntdSelectorMeta,
  selectorStatusTagColor,
} from "./antd-selection-shared";

/** 与 legacy handleSelectableKeyDown 一致：仅在自身聚焦时响应 Enter/Space。 */
function handleItemKeyDown(event: KeyboardEvent<HTMLElement>, onSelect: () => void) {
  if (event.target !== event.currentTarget) return;
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  onSelect();
}

function accentClassName(tone: "blue" | "emerald" | "amber" | "slate") {
  if (tone === "blue") return "bg-sky-500";
  if (tone === "amber") return "bg-amber-400";
  if (tone === "slate") return "bg-slate-400";
  return "bg-emerald-500";
}

function AntdListItem<T>({ item, presentation, selector, size }: {
  item: SelectorSurfaceStructuredListItemSpec<T>;
  presentation: "default" | "compact";
  selector: SelectorSurfaceStructuredListSpec<T>;
  size: "sm" | "md";
}) {
  const card = resolveSelectorCardPresentation(item.card, presentation);
  const active = card.active ?? selector.selectedId === item.key;
  const meta = Array.isArray(card.meta) ? card.meta : card.meta !== undefined ? [card.meta] : undefined;
  // antd 6.5.3 废弃 List 组件：与 data 移动端列表一致，用纯 div 还原等价排版。
  return (
    <div
      role={card.inlineEdit ? undefined : "button"}
      tabIndex={card.inlineEdit ? -1 : 0}
      aria-current={active || undefined}
      className={joinClassNames(
        "block w-full rounded-lg border border-slate-200 bg-white text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200 max-sm:rounded-none max-sm:border-x-0 max-sm:border-b-0 max-sm:shadow-none max-sm:first:border-t-0",
        card.inlineEdit ? "cursor-default" : "cursor-pointer",
        size === "sm" ? "px-2.5 py-2" : "px-3 py-3",
        active ? "bg-emerald-50 shadow-sm" : "hover:border-slate-300 hover:bg-slate-50",
        card.archived ? "opacity-75" : "",
      )}
      data-selector-key={String(item.key)}
      data-selected={active ? "true" : undefined}
      onClick={card.inlineEdit ? undefined : () => selector.onSelect(item.value)}
      onKeyDown={card.inlineEdit ? undefined : (event) => handleItemKeyDown(event, () => selector.onSelect(item.value))}
    >
      <div className="flex items-start gap-3">
        {card.tone ? <span aria-hidden="true" className={joinClassNames("mt-0.5 h-10 w-1.5 shrink-0 rounded-full", accentClassName(card.tone))} /> : null}
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            {card.inlineEdit ? <AntdSelectorInlineEdit edit={card.inlineEdit} /> : <span className="min-w-0 truncate text-sm font-semibold text-slate-900" title={textOverflowTitle(card.title)}>{card.title}</span>}
            {card.code ? <Tag className="!mr-0 shrink-0" color={selectorStatusTagColor(card.codeTone)}>{card.code}</Tag> : null}
          </div>
          {card.subtitle ? <div className="mt-1 truncate text-xs text-slate-400" title={textOverflowTitle(card.subtitle)}>{card.subtitle}</div> : null}
          {card.metaLine ? <div className="mt-0.5 truncate text-xs text-slate-500" title={textOverflowTitle(card.metaLine)}>{card.metaLine}</div> : null}
        </div>
        {card.inlineEdit ? null : <AntdSelectorListTrailing card={card} />}
      </div>
      {meta?.length ? <AntdSelectorMeta meta={meta} /> : null}
    </div>
  );
}

export function AntdSelectorList<T>({ selector, actions, presentation }: {
  selector: SelectorSurfaceStructuredListSpec<T>;
  actions: ReactNode;
  presentation: "default" | "compact";
}) {
  function renderItems(items: SelectorSurfaceStructuredListItemSpec<T>[]) {
    return (
      <div className="space-y-2 max-sm:space-y-0 max-sm:divide-y max-sm:divide-slate-100">
        {items.map((item) => (
          <AntdListItem
            key={String(item.key)}
            item={item}
            presentation={presentation}
            selector={selector}
            size={presentation === "compact" ? "sm" : selector.size ?? item.card.size ?? "md"}
          />
        ))}
      </div>
    );
  }

  function renderContent() {
    if (selector.loading) return <AntdSelectorLoading text={selector.loadingText} />;
    if (selector.items.length === 0) return <AntdSelectorEmpty text={selector.emptyText} />;
    // 分组语义与 legacy 一致：保持首次出现顺序，空组名不渲染组头。
    const groups = new Map<string, SelectorSurfaceStructuredListItemSpec<T>[]>();
    const order: string[] = [];
    for (const item of selector.items) {
      const group = item.group ?? "";
      if (!groups.has(group)) {
        groups.set(group, []);
        order.push(group);
      }
      groups.get(group)!.push(item);
    }
    if (order.length === 1 && order[0] === "") return renderItems(selector.items);
    return (
      <div className="space-y-3">
        {order.map((group) => (
          <div className="space-y-2" key={group || "__default__"}>
            {group ? <div className="px-1 text-xs font-semibold leading-5 text-slate-500">{group}</div> : null}
            {renderItems(groups.get(group)!)}
          </div>
        ))}
      </div>
    );
  }

  return (
    <AntdSelectorFrame actions={actions} title={selector.title}>
      {renderContent()}
    </AntdSelectorFrame>
  );
}
