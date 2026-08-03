"use client";

import type { ReactNode } from "react";
import { Empty, Skeleton, Spin, Tag } from "antd";
import type {
  SelectorSurfaceCardSpec,
  SelectorSurfaceCommandSpec,
  SelectorSurfaceInlineEditSpec,
  SelectorSurfaceStatusSpec,
  SelectorSurfaceStructuredTreeItemSpec,
} from "../../SelectorSurface.types";
import type { BadgeTone } from "../common/Badge";
import { joinClassNames } from "../common/card-utils";
import { textOverflowTitle } from "../common/text-overflow";
import InputSurface from "../../InputSurface";
import { AntdCommandList } from "../common/antd-command";

/** status/code tone → antd Tag 颜色，对齐 legacy statusClassName。 */
const STATUS_TAG_COLOR: Record<NonNullable<SelectorSurfaceStatusSpec["tone"]>, string> = {
  success: "green",
  warning: "gold",
  danger: "red",
  muted: "default",
  default: "default",
};

export function selectorStatusTagColor(tone: SelectorSurfaceStatusSpec["tone"]) {
  return STATUS_TAG_COLOR[tone ?? "default"];
}

/** BadgeTone → antd Tag 颜色（层级徽标 levelTone 覆盖场景），对齐 legacy badgeToneClassName。 */
const BADGE_TONE_TAG_COLOR: Record<BadgeTone, string> = {
  gray: "default",
  green: "green",
  blue: "blue",
  red: "red",
  yellow: "gold",
  orange: "orange",
  emerald: "green",
  sky: "blue",
  slate: "default",
  amber: "gold",
};

/** 与 legacy Badge classFromLevel 对齐的层级默认色。 */
function levelTagColor(level: number) {
  if (level === 1) return "blue";
  if (level === 2) return "green";
  if (level === 3) return "gold";
  return "default";
}

/** 树节点层级徽标，对齐 legacy Badge 的 label/level 语义。 */
export function AntdSelectorLevelBadge({ card, fallbackLevel }: {
  card: SelectorSurfaceCardSpec;
  fallbackLevel: number;
}) {
  if (card.showLevelBadge === false) return null;
  const level = card.level ?? fallbackLevel;
  const color = card.levelTone ? BADGE_TONE_TAG_COLOR[card.levelTone] : levelTagColor(level);
  return <Tag className="!mr-0 shrink-0 font-semibold" color={color}>{card.levelLabel ?? `L${level}`}</Tag>;
}

/** 状态徽标；onClick 语义与 legacy renderStatus 一致（独立 button，点击不触发选中）。 */
export function AntdSelectorStatus({ status }: { status?: SelectorSurfaceStatusSpec }) {
  if (!status) return null;
  const tag = <Tag className="!mr-0" color={selectorStatusTagColor(status.tone)}>{status.label}</Tag>;
  if (!status.onClick) return tag;
  return (
    <button
      type="button"
      className={joinClassNames("shrink-0", status.disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer")}
      disabled={status.disabled}
      onClick={(event) => {
        event.stopPropagation();
        status.onClick?.();
      }}
      onKeyDown={(event) => event.stopPropagation()}
    >
      {tag}
    </button>
  );
}

/** Selector actions use the shared Ant command renderer and never bubble into row selection. */
export function AntdSelectorActionGroup({ actions }: { actions: SelectorSurfaceCommandSpec[] }) {
  return (
    <span
      className="shrink-0 [&>div]:flex-nowrap"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <AntdCommandList commands={actions} />
    </span>
  );
}

/** Inline edit remains inside the Ant selector and preserves save/cancel keyboard semantics. */
export function AntdSelectorInlineEdit({ edit }: { edit: SelectorSurfaceInlineEditSpec }) {
  const saveDisabled = Boolean(edit.disabled || edit.saving || !edit.value.trim() || edit.dirty === false);
  return (
    <span
      className="flex min-w-0 flex-1 items-center gap-2"
      data-selector-inline-edit="true"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <span className="w-full min-w-0 max-w-sm flex-1">
        <InputSurface
          ariaLabel={edit.ariaLabel ?? "编辑名称"}
          autoFocus
          density="compact"
          maxLength={edit.maxLength}
          onChange={(value) => edit.onChange(String(value ?? ""))}
          onKeyDown={(event) => {
            if (event.key === "Escape") { event.preventDefault(); edit.onCancel(); }
            if (event.key === "Enter" && !saveDisabled) { event.preventDefault(); edit.onSave(); }
          }}
          placeholder={edit.placeholder}
          size="sm"
          spec={{ valueType: "string", control: "text", state: edit.disabled || edit.saving ? "disabled" : "required" }}
          value={edit.value}
        />
      </span>
      <AntdCommandList commands={[
        { key: "save", label: edit.saving ? "保存中..." : "保存", icon: "save", size: "sm", disabled: saveDisabled, onClick: edit.onSave },
        { key: "cancel", label: "取消", icon: "cancel", size: "sm", disabled: edit.saving, onClick: edit.onCancel },
      ]} />
    </span>
  );
}

/** 列表卡尾部：actions > trailing > status，与 legacy renderCardTrailing 互斥优先级一致。 */
export function AntdSelectorListTrailing({ card }: { card: SelectorSurfaceCardSpec }) {
  if (card.actions?.length) return <AntdSelectorActionGroup actions={card.actions} />;
  if (card.trailing !== undefined && card.trailing !== null) {
    return <span className="shrink-0 text-xs text-slate-500">{card.trailing}</span>;
  }
  return <AntdSelectorStatus status={card.status} />;
}

/** 树节点尾部：actions 独占；否则 trailing 与 status 可同时出现（与 legacy TreeSelector 一致）。 */
export function AntdSelectorTreeTrailing({ card }: { card: SelectorSurfaceCardSpec }) {
  if (card.actions?.length) return <AntdSelectorActionGroup actions={card.actions} />;
  return (
    <>
      {card.trailing !== undefined && card.trailing !== null ? (
        <span className="shrink-0 text-xs text-slate-500">{card.trailing}</span>
      ) : null}
      <AntdSelectorStatus status={card.status} />
    </>
  );
}

/** meta chips，对齐 legacy renderTreeMeta 的视觉。 */
export function AntdSelectorMeta({ meta }: { meta: ReactNode[] | ReactNode }) {
  if (Array.isArray(meta)) {
    const items = meta.filter(Boolean);
    if (items.length === 0) return null;
    return (
      <span className="mt-1.5 flex min-w-0 flex-wrap gap-1.5">
        {items.map((item, index) => (
          <span key={index} className="rounded-md bg-slate-100/80 px-1.5 py-0.5 text-xs font-medium text-slate-500">
            {item}
          </span>
        ))}
      </span>
    );
  }
  return <span className="mt-1 block truncate text-xs text-slate-500" title={textOverflowTitle(meta)}>{meta}</span>;
}

/** legacy treeMeta：metaLine 优先；数组 meta 过滤空值。 */
export function resolveTreeCardMeta(card: SelectorSurfaceCardSpec) {
  if (card.metaLine) return card.metaLine;
  if (Array.isArray(card.meta)) return card.meta.filter(Boolean);
  return card.meta;
}

export function AntdSelectorLoading({ text }: { text?: string }) {
  return (
    <Spin description={text ?? "加载中..."}>
      <Skeleton active className="p-3" paragraph={{ rows: 3 }} title={false} />
    </Spin>
  );
}

export function AntdSelectorEmpty({ text }: { text?: string }) {
  return <Empty description={text ?? "暂无数据"} image={Empty.PRESENTED_IMAGE_SIMPLE} />;
}

/** 面板框架，对齐 legacy PanelCard：有 title/commands 时渲染头部，内容区限高滚动。 */
export function AntdSelectorFrame({ title, actions, children }: {
  title?: string;
  actions: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm" data-ui-renderer="antd">
      {title || actions ? (
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-3 sm:p-4">
          <div className="min-w-0">
            {title ? <div className="truncate text-base font-semibold text-slate-900" title={textOverflowTitle(title)}>{title}</div> : null}
          </div>
          {actions ? <div className="shrink-0">{actions}</div> : null}
        </div>
      ) : null}
      <div className="max-h-[760px] overflow-auto p-3">{children}</div>
    </section>
  );
}

/** 与 facade collectExpandedIds 相同的 defaultExpandedLevel 展开集合计算。 */
export function collectTreeExpandedIds<T>(
  items: SelectorSurfaceStructuredTreeItemSpec<T>[],
  defaultExpandedLevel: number,
) {
  const expanded = new Set<string | number>();
  function visit(nodes: SelectorSurfaceStructuredTreeItemSpec<T>[], level: number) {
    for (const node of nodes) {
      if (node.children?.length && level <= defaultExpandedLevel) {
        expanded.add(node.key);
        visit(node.children, level + 1);
      }
    }
  }
  visit(items, 1);
  return expanded;
}
