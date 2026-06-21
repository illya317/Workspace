import type { ReactNode } from "react";
import { joinClassNames } from "./card-utils";

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
    className,
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

export default SelectorCard;
