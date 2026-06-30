import type { ReactNode } from "react";
import { joinClassNames } from "../common/card-utils";

export interface SelectorCardMetaItem {
  label?: ReactNode;
  value: ReactNode;
}

export type SelectorCardSize = "sm" | "md";
export type SelectorCardTone = "success" | "warning" | "muted" | "default";

export interface SelectorCardProps {
  title: ReactNode;
  subtitle?: ReactNode;
  code?: ReactNode;
  codeTone?: SelectorCardTone;
  meta?: Array<ReactNode | SelectorCardMetaItem>;
  metaLine?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  active?: boolean;
  archived?: boolean;
  onClick?: () => void;
  className?: string;
  size?: SelectorCardSize;
}

export function SelectorCard({
  title,
  subtitle,
  code,
  codeTone = "default",
  meta = [],
  metaLine,
  leading,
  trailing,
  active = false,
  archived = false,
  onClick,
  className = "",
  size = "md",
}: SelectorCardProps) {
  const codeClassName = {
    success: "bg-emerald-50 text-emerald-700",
    warning: "bg-amber-50 text-amber-700",
    muted: "bg-slate-100 text-slate-500",
    default: "bg-slate-100 text-slate-700",
  }[codeTone];
  const content = (
    <>
      <div className="flex items-start gap-3">
        {leading && <div className="shrink-0">{leading}</div>}
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-baseline gap-2">
            <div className="min-w-0 truncate text-sm font-semibold text-slate-900">{title}</div>
            {code && <div className={joinClassNames("shrink-0 rounded px-1.5 py-0.5 text-xs font-medium", codeClassName)}>{code}</div>}
          </div>
          {subtitle && <div className="mt-1 truncate text-xs text-slate-400">{subtitle}</div>}
          {metaLine && <div className="mt-0.5 truncate text-xs text-slate-500">{metaLine}</div>}
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
    "w-full rounded-lg border text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200",
    size === "sm" ? "px-2.5 py-2" : "px-3 py-3",
    active
      ? "border-slate-200 bg-emerald-50 shadow-sm"
      : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50",
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
