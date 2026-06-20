import type { ButtonHTMLAttributes, ReactNode } from "react";
import { joinClassNames } from "./card-utils";

export interface ToolbarAction {
  label: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger";
  type?: "button" | "submit";
}

export interface ActionButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "className" | "disabled" | "onClick" | "type"> {
  children: ReactNode;
  onClick?: ButtonHTMLAttributes<HTMLButtonElement>["onClick"];
  disabled?: boolean;
  variant?: ToolbarAction["variant"];
  type?: "button" | "submit";
  className?: string;
}

export type IconActionButtonProps = ActionButtonProps & {
  label: string;
};

export interface ActionToolbarProps {
  primaryActions?: ToolbarAction[];
  secondaryActions?: ToolbarAction[];
  leftSlot?: ReactNode;
  rightSlot?: ReactNode;
  className?: string;
}

export function getToolbarActionClassName(variant: ToolbarAction["variant"] = "secondary") {
  if (variant === "primary") {
    return "inline-flex h-10 items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300";
  }
  if (variant === "danger") {
    return "inline-flex h-10 items-center justify-center rounded-lg border border-red-200 bg-white px-4 py-2 text-xs font-semibold text-red-600 shadow-sm transition hover:bg-red-50 disabled:cursor-not-allowed disabled:text-slate-300";
  }
  return "inline-flex h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300";
}

export function ActionButton({
  children,
  onClick,
  disabled,
  variant = "secondary",
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
      className={joinClassNames(getToolbarActionClassName(variant), className)}
    >
      {children}
    </button>
  );
}

export function IconActionButton({
  children,
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
      {children}
    </ActionButton>
  );
}

function ToolbarActionButton({ action }: { action: ToolbarAction }) {
  return (
    <ActionButton
      type={action.type}
      onClick={action.onClick}
      disabled={action.disabled}
      variant={action.variant}
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
