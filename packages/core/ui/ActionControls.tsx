import type { ButtonHTMLAttributes, ReactNode } from "react";
import { ActionGlyph } from "./ActionGlyphs";
import type { ActionGlyphKind } from "./ActionGlyphs";
import { joinClassNames } from "./card-utils";

export type ActionButtonSize = "sm" | "md";

export interface ToolbarAction {
  label: ReactNode;
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

export interface ActionToolbarProps {
  primaryActions?: ToolbarAction[];
  secondaryActions?: ToolbarAction[];
  leftSlot?: ReactNode;
  rightSlot?: ReactNode;
  className?: string;
}

export function getToolbarActionClassName(
  variant: ToolbarAction["variant"] = "secondary",
  size: ActionButtonSize = "md",
) {
  const sizeClass =
    size === "sm"
      ? "h-8 px-2.5 py-1.5 text-xs"
      : "h-10 px-4 py-2 text-xs";
  if (variant === "primary") {
    return `inline-flex ${sizeClass} items-center justify-center rounded-lg bg-emerald-600 font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300`;
  }
  if (variant === "danger") {
    return `inline-flex ${sizeClass} items-center justify-center rounded-lg border border-red-200 bg-white font-semibold text-red-600 shadow-sm transition hover:bg-red-50 disabled:cursor-not-allowed disabled:text-slate-300`;
  }
  return `inline-flex ${sizeClass} items-center justify-center rounded-lg border border-slate-300 bg-white font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300`;
}

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

function ToolbarActionButton({ action }: { action: ToolbarAction }) {
  return (
    <ActionButton
      type={action.type}
      onClick={action.onClick}
      disabled={action.disabled}
      variant={action.variant}
      size={action.size}
    >
      {action.label}
    </ActionButton>
  );
}

export function ActionToolbar({
  primaryActions = [],
  secondaryActions = [],
  leftSlot,
  rightSlot,
  className = "",
}: ActionToolbarProps) {
  const hasActions = primaryActions.length > 0 || secondaryActions.length > 0 || rightSlot;

  return (
    <div
      className={joinClassNames(
        "flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0 text-base font-semibold text-slate-900">{leftSlot}</div>
      {hasActions && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {secondaryActions.map((action, index) => (
            <ToolbarActionButton key={`secondary-${index}`} action={action} />
          ))}
          {primaryActions.map((action, index) => (
            <ToolbarActionButton key={`primary-${index}`} action={{ ...action, variant: action.variant ?? "primary" }} />
          ))}
          {rightSlot}
        </div>
      )}
    </div>
  );
}
