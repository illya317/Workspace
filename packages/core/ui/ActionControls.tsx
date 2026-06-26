import type { ButtonHTMLAttributes } from "react";
import { ActionGlyph } from "./ActionGlyphs";
import type { ActionGlyphKind } from "./ActionGlyphs";
import { joinClassNames } from "./card-utils";
import { CONTROL_SIZES } from "./interactionTokens";
import { getToolbarActionClassName, type ActionButtonSize } from "./toolbar-styles";

export interface ToolbarAction {
  label: string;
  kind: ActionGlyphKind;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger";
  type?: "button" | "submit";
  size?: ActionButtonSize;
}

export interface ActionButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "className" | "disabled" | "onClick" | "size" | "type"> {
  label: string;
  kind: ActionGlyphKind;
  onClick?: ButtonHTMLAttributes<HTMLButtonElement>["onClick"];
  disabled?: boolean;
  variant?: ToolbarAction["variant"];
  type?: "button" | "submit";
  size?: ActionButtonSize;
  className?: string;
  iconClassName?: string;
}

export type RefreshActionButtonProps = Omit<ActionButtonProps, "label" | "kind"> & {
  label?: string;
};

export function ActionButton({
  kind,
  label,
  onClick,
  disabled,
  variant = "secondary",
  size = "md",
  type = "button",
  className = "",
  iconClassName,
  ...buttonProps
}: ActionButtonProps) {
  const tokens = CONTROL_SIZES[size];
  const defaultIconClassName = tokens.iconSize;
  // Icon buttons are square: use fixed width matching height
  const iconButtonWidth = size === "sm" ? "w-8" : size === "lg" ? "w-10" : size === "xl" ? "w-11" : "w-9";
  return (
    <button
      {...buttonProps}
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={buttonProps["aria-label"] ?? label}
      title={buttonProps.title ?? label}
      className={joinClassNames(getToolbarActionClassName(variant, size), `${iconButtonWidth} !px-0 ${tokens.text} ${tokens.leading}`, className)}
    >
      <ActionGlyph kind={kind} className={iconClassName ?? defaultIconClassName} />
    </button>
  );
}

export function RefreshActionButton({
  label = "刷新",
  className = "",
  ...buttonProps
}: RefreshActionButtonProps) {
  return (
    <ActionButton
      {...buttonProps}
      kind="refresh"
      label={label}
      className={joinClassNames(
        "!border-0 !bg-transparent !shadow-none !text-slate-700 hover:!bg-slate-100 focus:!ring-2 focus:!ring-emerald-100",
        className,
      )}
    />
  );
}
