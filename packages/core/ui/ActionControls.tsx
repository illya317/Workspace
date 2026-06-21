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

export type RefreshActionButtonProps = Omit<IconActionButtonProps, "children" | "label"> & {
  label?: string;
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

export function RefreshActionButton({
  label = "刷新",
  className = "",
  ...buttonProps
}: RefreshActionButtonProps) {
  return (
    <IconActionButton
      {...buttonProps}
      label={label}
      className={joinClassNames(
        "!border-0 !bg-transparent !shadow-none !text-slate-700 hover:!bg-slate-100 focus:!ring-2 focus:!ring-emerald-100",
        className,
      )}
    >
      <svg aria-hidden="true" className="h-7 w-7" fill="currentColor" viewBox="0 0 50 50">
        <path d="M25 38c-7.2 0-13-5.8-13-13 0-3.2 1.2-6.2 3.3-8.6l1.5 1.3C15 19.7 14 22.3 14 25c0 6.1 4.9 11 11 11 1.6 0 3.1-.3 4.6-1l.8 1.8c-1.7.8-3.5 1.2-5.4 1.2z" />
        <path d="M34.7 33.7l-1.5-1.3c1.8-2 2.8-4.6 2.8-7.3 0-6.1-4.9-11-11-11-1.6 0-3.1.3-4.6 1l-.8-1.8c1.7-.8 3.5-1.2 5.4-1.2 7.2 0 13 5.8 13 13 0 3.1-1.2 6.2-3.3 8.6z" />
        <path d="M18 24h-2v-6h-6v-2h8z" />
        <path d="M40 34h-8v-8h2v6h6z" />
      </svg>
    </IconActionButton>
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
