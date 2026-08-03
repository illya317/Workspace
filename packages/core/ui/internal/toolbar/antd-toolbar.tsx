"use client";

import type { ComponentType } from "react";
import { Button, Divider, Space } from "antd";
import { ACTION_GLYPH_ORDER_BY_KIND, ActionGlyph } from "../action/ActionGlyphs";
import type { ActionGlyphKind } from "../action/ActionGlyphs";
import type { ControlSize } from "../common/interactionTokens";
import { CONTROL_SIZES, ICON_BUTTON_SIZE_CLASSES, TEXT_STYLES } from "../common/interactionTokens";
import { joinClassNames } from "../common/card-utils";
import {
  AntdToolbarAutocomplete,
  AntdToolbarColumnToggle,
  AntdToolbarFieldFilter,
  AntdToolbarGroupedSelect,
  AntdToolbarOptionGroup,
  AntdToolbarPageSize,
  AntdToolbarPeriod,
  AntdToolbarSearch,
  AntdToolbarSelect,
} from "./antd-toolbar-controls";
import { AntdToolbarFilterPanel, AntdToolbarMenu } from "./antd-toolbar-overlays";
import { antdControlSize } from "./antd-toolbar-shared";
import {
  getOrderedActions,
  getToolbarItemActions,
  resolveToolbarActionIcon,
  resolveToolbarActionVariant,
  type ToolbarRenderableAction,
} from "./toolbar-action-model";
import type { ToolbarItem } from "./Toolbar.types";

export type ToolbarItemRendererProps = {
  item: ToolbarItem;
  size?: ControlSize;
};
export type ToolbarItemRendererComponent = ComponentType<ToolbarItemRendererProps>;

function assertNever(value: never): never {
  throw new Error(`Unhandled Toolbar item: ${String(value)}`);
}

type LegacyActionVariant = "primary" | "secondary" | "danger";

/**
 * antd 版 legacy ActionButton(icon-only 方形按钮)。
 * variant 映射:primary → type="primary";danger → danger 描边;secondary → default。
 * type="submit" → htmlType="submit",表单提交语义不丢。
 */
export function AntdToolbarActionButton({
  kind,
  label,
  variant = "secondary",
  type = "button",
  disabled,
  onClick,
  size = "md",
  className,
  ariaExpanded,
}: {
  kind: ActionGlyphKind;
  label: string;
  variant?: LegacyActionVariant;
  type?: "button" | "submit";
  disabled?: boolean;
  onClick?: () => void;
  size?: ControlSize;
  className?: string;
  ariaExpanded?: boolean;
}) {
  return (
    <Button
      aria-expanded={ariaExpanded}
      aria-label={label}
      className={joinClassNames(ICON_BUTTON_SIZE_CLASSES[size], "max-sm:!h-11 max-sm:!w-11", className)}
      danger={variant === "danger"}
      disabled={disabled}
      htmlType={type === "submit" && !onClick ? "submit" : "button"}
      icon={<ActionGlyph kind={kind} className={CONTROL_SIZES[size].iconSize} />}
      onClick={onClick}
      size={antdControlSize(size)}
      title={label}
      type={variant === "primary" ? "primary" : "default"}
    />
  );
}

function actionSubgroup(action: ToolbarRenderableAction) {
  return ACTION_GLYPH_ORDER_BY_KIND[resolveToolbarActionIcon(action)]?.subgroup ?? "unknown";
}

/**
 * antd 版 legacy renderOrderedActions:沿用 getOrderedActions 排序,
 * 非 joined 时相邻 subgroup 变化插入 ToolbarDivider;joined → Space.Compact 连体。
 */
export function AntdToolbarActionList({
  actions,
  size = "md",
  joined = false,
}: {
  actions: ToolbarRenderableAction[];
  size?: ControlSize;
  joined?: boolean;
}) {
  const ordered = getOrderedActions(actions);
  const renderButton = (action: ToolbarRenderableAction, index: number) => (
    <AntdToolbarActionButton
      key={action.key ?? `action-${index}`}
      kind={resolveToolbarActionIcon(action)}
      label={action.label}
      type={action.type}
      variant={resolveToolbarActionVariant(action)}
      disabled={action.disabled}
      onClick={action.onClick}
      size={size}
    />
  );
  if (joined) return <Space.Compact>{ordered.map(renderButton)}</Space.Compact>;
  return (
    <>
      {ordered.map((action, index) => {
        const previous = ordered[index - 1];
        const needsDivider = Boolean(previous) && actionSubgroup(previous as ToolbarRenderableAction) !== actionSubgroup(action);
        return (
          <span key={action.key ?? `action-${index}`} className="contents">
            {needsDivider ? <Divider className="!mx-1 !h-6" orientation="vertical" /> : null}
            {renderButton(action, index)}
          </span>
        );
      })}
    </>
  );
}

function AntdToolbarCreate({
  item,
  size,
}: {
  item: Extract<ToolbarItem, { kind: "create" }>;
  size: ControlSize;
}) {
  // scrollOnCreate 的 reveal intent 在 Toolbar 上下文无挂载点(legacy CreateStartButton 同样未接线),
  // 仅保留点击与 active/disabled 语义。
  return (
    <AntdToolbarActionButton
      kind="add"
      label={item.label ?? "新建"}
      variant={item.active ? "secondary" : "primary"}
      disabled={item.disabled || item.active}
      onClick={item.onClick}
      size={size}
    />
  );
}

/**
 * Toolbar total Ant renderer. Dedicated compound controls remain leaf protocols,
 * but no item can delegate to the retired general-purpose renderer.
 */
export function AntdToolbarItemRenderer({ item, size = "md" }: ToolbarItemRendererProps) {
  switch (item.kind) {
    case "icon-button":
      return (
        <AntdToolbarActionButton
          kind={item.icon}
          label={item.label}
          type={item.type}
          variant={item.variant}
          disabled={item.disabled}
          onClick={item.onClick}
          size={size}
        />
      );
    case "panel-toggle":
      return (
        <AntdToolbarActionButton
          kind={item.icon}
          label={item.label}
          variant={item.variant}
          disabled={item.disabled}
          onClick={item.onClick}
          size={size}
        />
      );
    case "action-group":
      return <AntdToolbarActionList actions={item.actions} size={size} joined={item.joined} />;
    case "edit-group": {
      // 派生动作(编辑/保存/取消/最近改动/下载)复用 legacy 纯函数,排序与可见性一致。
      const actions = getToolbarItemActions(item);
      if (actions.length === 0) return null;
      return <AntdToolbarActionList actions={actions} size={size} />;
    }
    case "create":
      return <AntdToolbarCreate item={item} size={size} />;
    case "search":
      return <AntdToolbarSearch item={item} size={size} />;
    case "select":
      return <AntdToolbarSelect item={item} size={size} />;
    case "autocomplete":
      return <AntdToolbarAutocomplete item={item} size={size} />;
    case "option-group":
      return <AntdToolbarOptionGroup item={item} size={size} />;
    case "page-size":
      return <AntdToolbarPageSize item={item} size={size} />;
    case "column-toggle":
      return <AntdToolbarColumnToggle item={item} size={size} />;
    case "period":
      return <AntdToolbarPeriod item={item} size={size} />;
    case "menu":
      return <AntdToolbarMenu item={item} size={size} />;
    case "filter-panel":
      return <AntdToolbarFilterPanel item={item} size={size} />;
    case "label":
      // 纯文本标签无 antd 控件对应;markup 与 legacy 完全一致。
      return (
        <span className={`flex shrink-0 items-center whitespace-nowrap px-1 ${TEXT_STYLES.labelText}`}>
          {item.label}
        </span>
      );
    case "text":
      // 纯文本内容无 antd 控件对应;markup 与 legacy 完全一致。
      return (
        <span className={`flex items-center ${TEXT_STYLES.labelText}`}>
          {item.content}
        </span>
      );
    // Compound controls are still dispatched here; none can escape to an alternate renderer.
    case "grouped-select":
      return <AntdToolbarGroupedSelect item={item} size={size} />;
    case "field-filter":
      return <AntdToolbarFieldFilter item={item} size={size} />;
    default:
      return assertNever(item);
  }
}
