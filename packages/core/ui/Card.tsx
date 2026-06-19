import type { ButtonHTMLAttributes, ReactNode } from "react";
import PageContent from "./PageContent";

function joinClassNames(...classNames: Array<string | false | null | undefined>) {
  return classNames.filter(Boolean).join(" ");
}

export interface PanelCardProps {
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}

export function PanelCard({
  children,
  className = "",
  bodyClassName = "",
  title,
  subtitle,
  actions,
}: PanelCardProps) {
  const hasHeader = title || subtitle || actions;

  return (
    <section className={joinClassNames("rounded-lg border border-slate-200 bg-white shadow-sm", className)}>
      {hasHeader && (
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-4">
          <div className="min-w-0">
            {title && <h3 className="truncate text-base font-semibold text-slate-900">{title}</h3>}
            {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
          </div>
          {actions && <div className="shrink-0">{actions}</div>}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

export interface MetricCardProps {
  label: ReactNode;
  value: ReactNode;
  className?: string;
}

export function MetricCard({ label, value, className = "" }: MetricCardProps) {
  return (
    <div className={joinClassNames("rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm", className)}>
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-semibold text-slate-900">{value}</div>
    </div>
  );
}

export interface EmptyStateCardProps {
  children: ReactNode;
  className?: string;
  compact?: boolean;
}

export function EmptyStateCard({ children, className = "", compact = false }: EmptyStateCardProps) {
  return (
    <p
      className={joinClassNames(
        "rounded-md border border-dashed border-slate-200 px-3 text-center text-sm text-slate-400",
        compact ? "py-6" : "py-10",
        className
      )}
    >
      {children}
    </p>
  );
}

export type ModuleCardColor = "emerald" | "blue" | "indigo" | "purple" | "amber" | "cyan" | "orange" | string;

export interface ModuleCardAction {
  label: string;
  href?: string;
  onClick?: () => void;
  variant?: "primary" | "secondary";
}

export interface ModuleCardProps {
  title: string;
  description: string;
  icon?: ReactNode;
  color?: ModuleCardColor;
  href?: string;
  onClick?: () => void;
  badge?: string;
  actions?: ModuleCardAction[];
  className?: string;
}

export const moduleCardColorClasses: Record<string, { icon: string; ring: string }> = {
  emerald: { icon: "bg-emerald-100 text-emerald-600", ring: "hover:ring-emerald-400" },
  blue: { icon: "bg-blue-100 text-blue-600", ring: "hover:ring-blue-400" },
  indigo: { icon: "bg-indigo-100 text-indigo-600", ring: "hover:ring-indigo-400" },
  purple: { icon: "bg-purple-100 text-purple-600", ring: "hover:ring-purple-400" },
  amber: { icon: "bg-amber-100 text-amber-600", ring: "hover:ring-amber-400" },
  cyan: { icon: "bg-cyan-100 text-cyan-600", ring: "hover:ring-cyan-400" },
  orange: { icon: "bg-orange-100 text-orange-600", ring: "hover:ring-orange-400" },
};

export function getModuleCardClassName(color: ModuleCardColor = "emerald", className = "") {
  const colorClass = moduleCardColorClasses[color] || moduleCardColorClasses.emerald;
  return joinClassNames(
    "group flex min-h-52 flex-col items-center justify-center rounded-xl bg-white p-6 text-center shadow-sm transition-all hover:shadow-md hover:ring-2",
    colorClass.ring,
    className
  );
}

export interface ModuleCardBodyProps extends Omit<ModuleCardProps, "href" | "onClick" | "className"> {
  renderActionLink?: (action: ModuleCardAction, className: string) => ReactNode;
}

export function ModuleCardBody({
  title,
  description,
  icon,
  color = "emerald",
  badge,
  actions = [],
  renderActionLink,
}: ModuleCardBodyProps) {
  const colorClass = moduleCardColorClasses[color] || moduleCardColorClasses.emerald;

  return (
    <>
      <div className={joinClassNames("mb-4 flex h-14 w-14 items-center justify-center rounded-full", colorClass.icon)}>
        {icon}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <h3 className="text-base font-semibold text-gray-800">{title}</h3>
        {badge && (
          <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-xs text-amber-700">
            {badge}
          </span>
        )}
      </div>
      <p className="mt-2 text-xs leading-5 text-gray-500">{description}</p>
      {actions.length > 0 && (
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {actions.map((action) => {
            const actionClass =
              action.variant === "secondary"
                ? "rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm transition-colors hover:border-emerald-300 hover:text-emerald-700"
                : "rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white shadow-sm transition-colors hover:bg-emerald-700";

            if (action.href && renderActionLink) {
              return <span key={action.label}>{renderActionLink(action, actionClass)}</span>;
            }

            if (action.href) {
              return (
                <a key={action.label} href={action.href} className={actionClass}>
                  {action.label}
                </a>
              );
            }

            return (
              <button key={action.label} type="button" onClick={action.onClick} className={actionClass}>
                {action.label}
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}

export interface ModuleGridPageProps {
  title?: ReactNode;
  summary?: ReactNode;
  leading?: ReactNode;
  children: ReactNode;
  afterGrid?: ReactNode;
  fullScreen?: boolean;
  centered?: boolean;
  className?: string;
  contentClassName?: string;
  gridClassName?: string;
}

export function ModuleGridPage({
  title,
  summary,
  leading,
  children,
  afterGrid,
  fullScreen = false,
  centered = false,
  className = "",
  contentClassName = "",
  gridClassName = "",
}: ModuleGridPageProps) {
  const content = (
    <div className={joinClassNames("flex w-full flex-col items-center", className)}>
      {(leading || title || summary) && (
        <div className="mb-8 flex flex-col items-center">
          {leading}
          {title && <h1 className="mt-4 text-2xl font-bold text-gray-800">{title}</h1>}
          {summary && <p className="mt-1 text-center text-sm text-gray-500">{summary}</p>}
        </div>
      )}
      <div className={joinClassNames("grid w-full max-w-4xl grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3", gridClassName)}>
        {children}
      </div>
      {afterGrid && <div className="mt-8 w-full max-w-6xl">{afterGrid}</div>}
    </div>
  );

  if (fullScreen) {
    return (
      <div className={joinClassNames("flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4", contentClassName)}>
        {content}
      </div>
    );
  }

  return (
    <PageContent className={joinClassNames(centered && "flex min-h-[calc(100vh-56px)] items-center", "py-10", contentClassName)}>
      {content}
    </PageContent>
  );
}

export interface SectionCardProps {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}

export function SectionCard({
  title,
  subtitle,
  actions,
  children,
  className = "",
  bodyClassName = "",
}: SectionCardProps) {
  return (
    <PanelCard
      title={title}
      subtitle={subtitle}
      actions={actions}
      className={className}
      bodyClassName={joinClassNames("p-4", bodyClassName)}
    >
      {children}
    </PanelCard>
  );
}

export interface ToolbarAction {
  label: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger";
  type?: "button" | "submit";
}

export interface ActionButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "className" | "disabled" | "onClick" | "type"> {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: ToolbarAction["variant"];
  type?: "button" | "submit";
  className?: string;
}

export interface ActionToolbarProps {
  primaryActions?: ToolbarAction[];
  secondaryActions?: ToolbarAction[];
  leftSlot?: ReactNode;
  rightSlot?: ReactNode;
  className?: string;
}

export function getToolbarActionClassName(variant: ToolbarAction["variant"] = "secondary") {
  if (variant === "primary") {
    return "rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300";
  }
  if (variant === "danger") {
    return "rounded-md border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-600 shadow-sm transition hover:bg-red-50 disabled:cursor-not-allowed disabled:text-slate-300";
  }
  return "rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300";
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
        className
      )}
    >
      <div className="min-w-0">{leftSlot}</div>
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

export interface SelectorCardMetaItem {
  label?: ReactNode;
  value: ReactNode;
}

export interface SelectorCardProps {
  title: ReactNode;
  subtitle?: ReactNode;
  meta?: Array<ReactNode | SelectorCardMetaItem>;
  trailing?: ReactNode;
  active?: boolean;
  archived?: boolean;
  onClick?: () => void;
  className?: string;
}

export function SelectorCard({
  title,
  subtitle,
  meta = [],
  trailing,
  active = false,
  archived = false,
  onClick,
  className = "",
}: SelectorCardProps) {
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-slate-900">{title}</div>
          {subtitle && <div className="mt-1 truncate text-xs text-slate-400">{subtitle}</div>}
        </div>
        {trailing && <div className="shrink-0 text-xs text-slate-500">{trailing}</div>}
      </div>
      {meta.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {meta.map((item, index) => {
            const label = typeof item === "object" && item && "value" in item ? item.label : null;
            const value = typeof item === "object" && item && "value" in item ? item.value : item;
            return (
              <span
                key={index}
                className="rounded bg-white/80 px-1.5 py-0.5 text-xs font-medium text-slate-500"
              >
                {label ? <span className="mr-1">{label}</span> : null}
                {value}
              </span>
            );
          })}
        </div>
      )}
    </>
  );
  const cardClassName = joinClassNames(
    "w-full rounded-lg border px-3 py-3 text-left transition",
    active
      ? "border-emerald-400 bg-emerald-50 shadow-sm"
      : "border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white",
    archived && "opacity-75",
    className
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cardClassName}>
        {content}
      </button>
    );
  }

  return <div className={cardClassName}>{content}</div>;
}

export interface AnalysisBlockProps {
  title: ReactNode;
  subtitle?: ReactNode;
  toolbar?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}

export function AnalysisBlock({
  title,
  subtitle,
  toolbar,
  children,
  className = "",
  bodyClassName = "",
}: AnalysisBlockProps) {
  return (
    <PanelCard
      title={title}
      subtitle={subtitle}
      actions={toolbar}
      className={className}
      bodyClassName={joinClassNames("p-5", bodyClassName)}
    >
      {children}
    </PanelCard>
  );
}
