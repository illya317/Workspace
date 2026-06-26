import type { HTMLAttributes, ReactNode } from "react";
import { joinClassNames } from "./card-utils";
import { Toolbar, type ToolbarItem } from "./Toolbar";

export interface PanelCardProps extends Pick<HTMLAttributes<HTMLElement>, "style" | "onMouseEnter" | "onMouseLeave"> {
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
  style,
  onMouseEnter,
  onMouseLeave,
}: PanelCardProps) {
  const hasHeader = title || subtitle || actions;

  return (
    <section
      className={joinClassNames("rounded-lg border border-slate-200 bg-white shadow-sm", className)}
      style={style}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
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
    <div
      className={joinClassNames(
        "rounded-md border border-dashed border-slate-200 px-3 text-center text-sm text-slate-400",
        compact ? "py-6" : "py-10",
        className,
      )}
    >
      {children}
    </div>
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

export interface AnalysisBlockProps {
  title: ReactNode;
  subtitle?: ReactNode;
  toolbarItems?: ToolbarItem[];
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}

export function AnalysisBlock({
  title,
  subtitle,
  toolbarItems,
  children,
  className = "",
  bodyClassName = "",
}: AnalysisBlockProps) {
  return (
    <PanelCard
      title={title}
      subtitle={subtitle}
      actions={toolbarItems?.length ? <Toolbar items={toolbarItems} variant="inline" size="sm" /> : undefined}
      className={className}
      bodyClassName={joinClassNames("p-5", bodyClassName)}
    >
      {children}
    </PanelCard>
  );
}
