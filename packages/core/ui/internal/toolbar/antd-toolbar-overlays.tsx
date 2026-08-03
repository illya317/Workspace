"use client";

import { useState } from "react";
import { Avatar, Badge, Button, Dropdown, Popover } from "antd";
import type { MenuProps } from "antd";
import { ActionGlyph } from "../action/ActionGlyphs";
import type { ControlSize } from "../common/interactionTokens";
import RemovableTag from "../input/RemovableTag";
import { antdControlSize } from "./antd-toolbar-shared";
import { workspaceColors } from "../common/workspace-colors";
import { ToolbarFilterPanelFields } from "./ToolbarFilterPanel";
import { getActiveToolbarFilterPanelFields } from "./ToolbarFilterPanel.model";
import type { ToolbarFilterPanelItem, ToolbarMenuActionItem, ToolbarMenuItem } from "./Toolbar.types";

type AntdMenuItem = NonNullable<MenuProps["items"]>[number];

/**
 * ToolbarMenuActionItem → antd menu items。
 * separatorBefore → 前置 divider 项;tone/danger、disabled、href(纯链接渲染为 <a>)全部保留。
 */
export function buildAntdToolbarMenuItems(items: ToolbarMenuActionItem[]): AntdMenuItem[] {
  const result: AntdMenuItem[] = [];
  for (const item of items) {
    if (item.separatorBefore) result.push({ key: `separator-before-${item.key}`, type: "divider" });
    const hrefOnly = Boolean(item.href) && !item.disabled && !item.onSelect;
    result.push({
      key: item.key,
      danger: item.tone === "danger",
      disabled: item.disabled,
      label: hrefOnly ? <a href={item.href}>{item.label}</a> : item.label,
    });
  }
  return result;
}


export function AntdToolbarMenu({
  item,
  size,
}: {
  item: ToolbarMenuItem;
  size: ControlSize;
}) {
  const trigger = item.trigger;
  const onClick: MenuProps["onClick"] = ({ key }) => {
    const target = item.items.find((menuItem) => menuItem.key === key);
    if (!target || target.disabled) return;
    // href 纯链接由 <a> 自身导航处理,不触发 onSelect。
    if (target.href && !target.onSelect) return;
    void target.onSelect?.();
  };
  return (
    <Dropdown
      menu={{ items: buildAntdToolbarMenuItems(item.items), onClick }}
      placement={item.align === "left" ? "bottomLeft" : "bottomRight"}
      trigger={["click"]}
    >
      <Button
        aria-label={trigger.ariaLabel ?? trigger.label}
        disabled={item.disabled}
        size={antdControlSize(size)}
        type="text"
      >
        <span className="flex items-center gap-2">
          <Avatar size={28} src={trigger.avatarUrl ?? undefined}>
            {trigger.initials || trigger.label.slice(0, 1) || "?"}
          </Avatar>
          <span className="max-w-28 truncate" title={trigger.label}>{trigger.label}</span>
          <span aria-hidden="true" className="text-xs leading-none text-slate-400">v</span>
        </span>
      </Button>
    </Dropdown>
  );
}

// 与 legacy ToolbarFilterPanel 一致:优先 onReset,否则逐字段清空。
function resetAntdFilterPanel(item: ToolbarFilterPanelItem) {
  if (item.onReset) {
    item.onReset();
    return;
  }
  for (const field of item.fields) {
    if (field.value) field.onChange("");
  }
}

export function AntdToolbarFilterPanel({
  item,
  size,
}: {
  item: ToolbarFilterPanelItem;
  size: ControlSize;
}) {
  const [open, setOpen] = useState(false);
  const activeFields = getActiveToolbarFilterPanelFields(item.fields);
  const label = item.label ?? "筛选";
  const triggerLabel = activeFields.length > 0 ? `${label}，已选 ${activeFields.length} 项` : label;
  const content = (
    <div role="dialog" aria-label={`${label}条件`} className="w-fit max-w-[min(28rem,calc(100vw-1rem))]">
      <div className="flex min-h-12 items-center justify-between gap-3 border-b border-slate-100 px-4 py-2">
        <div className="text-sm font-bold text-slate-800">筛选条件</div>
        {activeFields.length > 0 ? (
          <button
            type="button"
            onClick={() => resetAntdFilterPanel(item)}
            className="rounded-md px-2 py-1 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
          >
            重置
          </button>
        ) : null}
      </div>
      {/* 字段 chips 沿用 legacy 实现,保证选项排布与禁用语义一致。 */}
      <ToolbarFilterPanelFields item={item} />
    </div>
  );
  return (
    <div className="inline-flex min-w-0 max-w-full items-center gap-2">
      <Popover
        content={content}
        onOpenChange={setOpen}
        open={open}
        placement="bottomLeft"
        trigger="click"
      >
        <Badge count={activeFields.length} color={workspaceColors.success.hover} size="small">
          <Button
            aria-expanded={open}
            aria-haspopup="dialog"
            aria-label={triggerLabel}
            className={activeFields.length > 0 ? "!border-emerald-200 !bg-emerald-50 !text-emerald-700" : undefined}
            icon={<ActionGlyph kind="filter" className="size-4" />}
            size={antdControlSize(size)}
            title={triggerLabel}
          />
        </Badge>
      </Popover>
      {activeFields.length > 0 ? (
        <div className="flex min-w-0 items-center gap-1.5 overflow-hidden">
          {activeFields.map((field) => (
            <RemovableTag
              key={field.key}
              label={`清除${field.label}筛选`}
              title={`${field.label}：${field.valueLabel}`}
              maxLength={12}
              confirmRemove={false}
              onRemove={field.onClear}
            >
              {`${field.label}：${field.valueLabel}`}
            </RemovableTag>
          ))}
        </div>
      ) : null}
    </div>
  );
}
