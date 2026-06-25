import type { ButtonHTMLAttributes, ReactNode } from "react";
import { ActionGlyph } from "./ActionGlyphs";
import type { ActionGlyphKind } from "./ActionGlyphs";
import { joinClassNames } from "./card-utils";
import { getToolbarActionClassName, type ActionButtonSize } from "./toolbar-styles";

export interface ToolbarAction {
  label: string;
  kind?: ActionGlyphKind;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger";
  type?: "button" | "submit";
  size?: ActionButtonSize;
}

export interface ActionButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "className" | "disabled" | "onClick" | "size" | "type"> {
  children: ReactNode;
  onClick?: ButtonHTMLAttributes<HTMLButtonElement>["onClick"];
  disabled?: boolean;
  variant?: ToolbarAction["variant"];
  type?: "button" | "submit";
  size?: ActionButtonSize;
  className?: string;
}

export type IconActionButtonProps = Omit<ActionButtonProps, "children"> & {
  label: string;
  kind: ActionGlyphKind;
};

export type RefreshActionButtonProps = Omit<IconActionButtonProps, "label" | "kind"> & {
  label?: string;
};

export function ActionButton({
  children,
  onClick,
  disabled,
  variant = "secondary",
  size = "md",
  type = "button",
  className = "",
  ...buttonProps
}: ActionButtonProps) {
  return (
    <button
      {...buttonProps}
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={joinClassNames(getToolbarActionClassName(variant, size), className)}
    >
      {children}
    </button>
  );
}

export function IconActionButton({
  kind,
  label,
  className = "",
  ...buttonProps
}: IconActionButtonProps) {
  return (
    <ActionButton
      {...buttonProps}
      aria-label={label}
      title={label}
      className={joinClassNames("!w-10 !px-0 text-base leading-none", className)}
    >
      <ActionGlyph kind={kind} className="h-4 w-4" />
    </ActionButton>
  );
}

export function RefreshActionButton({
  label = "刷新",
  className = "",
  ...buttonProps
}: RefreshActionButtonProps) {
  return (
    <IconActionButton
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
