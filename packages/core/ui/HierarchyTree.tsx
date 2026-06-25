import type { ReactNode } from "react";
import Badge from "./Badge";

type HierarchyTone = "blue" | "emerald" | "amber" | "slate";

function joinClassNames(...classNames: Array<string | false | null | undefined>) {
  return classNames.filter(Boolean).join(" ");
}

function toneFromLevel(level: number): HierarchyTone {
  if (level === 1) return "blue";
  if (level === 2) return "emerald";
  if (level === 3) return "amber";
  return "slate";
}

function badgeToneClassName(tone: HierarchyTone) {
  if (tone === "blue") return "bg-blue-100 text-blue-700";
  if (tone === "emerald") return "bg-emerald-100 text-emerald-700";
  if (tone === "amber") return "bg-amber-100 text-amber-700";
  return "bg-slate-100 text-slate-700";
}

function cardToneClassName(tone: HierarchyTone, active: boolean) {
  if (active) return "border-emerald-400 bg-emerald-50";
  if (tone === "blue") return "border-blue-100 bg-white";
  if (tone === "emerald") return "border-emerald-100 bg-white";
  if (tone === "amber") return "border-amber-100 bg-white";
  return "border-slate-200 bg-white";
}

export interface TreeNodeBranchProps {
  children: ReactNode;
  className?: string;
}

export function TreeNodeBranch({ children, className = "" }: TreeNodeBranchProps) {
  return (
    <div className={joinClassNames("relative pl-4", className)}>
      <span className="absolute left-0 top-6 h-px w-3 bg-slate-200" />
      <span className="absolute left-0 top-0 h-full border-l border-slate-200" />
      {children}
    </div>
  );
}

export interface TreeNodeCardProps {
  title: ReactNode;
  code?: ReactNode;
  level?: number;
  active?: boolean;
  tone?: HierarchyTone;
  meta?: ReactNode;
  children?: ReactNode;
  className?: string;
  titleClassName?: string;
  showToggle?: boolean;
  onClick?: () => void;
  toggle?: {
    enabled: boolean;
    expanded: boolean;
    label?: string;
    onClick: () => void;
  };
}

export function TreeNodeCard({
  title,
  code,
  level,
  active = false,
  tone,
  meta,
  children,
  className = "",
  titleClassName = "",
  showToggle = true,
  onClick,
  toggle,
}: TreeNodeCardProps) {
  const resolvedTone = tone || toneFromLevel(level || 0);
  const toggleEnabled = Boolean(toggle?.enabled);
  const toggleMark = toggleEnabled ? (toggle?.expanded ? "⌄" : "›") : "·";
  const reserveToggleSlot = Boolean(level) || showToggle;

  return (
    <div
      className={joinClassNames(
        "mb-2 rounded-md border shadow-sm transition",
        cardToneClassName(resolvedTone, active),
        active ? "" : "hover:border-emerald-200 hover:bg-emerald-50/40",
        className
      )}
    >
      <button
        type="button"
        onClick={onClick}
        className="flex w-full min-w-0 items-center gap-2 px-2.5 py-2 text-left transition hover:bg-slate-50"
      >
        {reserveToggleSlot && (
          <span
            aria-label={toggle?.label}
            onClick={(event) => {
              if (!toggleEnabled || !toggle) return;
              event.stopPropagation();
              toggle.onClick();
            }}
            className={joinClassNames(
              "grid size-5 shrink-0 place-items-center rounded bg-slate-50 text-xs font-semibold text-slate-500 shadow-sm",
              showToggle && toggleEnabled ? "hover:bg-slate-100" : "pointer-events-none invisible"
            )}
          >
            {toggleMark}
          </span>
        )}
        {level ? <Badge level={level} className="mr-1 shrink-0 px-2 py-0.5 font-semibold" /> : null}
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-baseline gap-2">
            <span className={joinClassNames("min-w-0 flex-1 truncate whitespace-nowrap text-sm font-semibold text-slate-900", titleClassName)}>
              {title}
            </span>
            {code && <span className="shrink-0 font-mono text-xs text-slate-400">{code}</span>}
          </span>
          {meta && <span className="mt-0.5 block truncate whitespace-nowrap text-xs text-slate-500">{meta}</span>}
        </span>
      </button>
      {children && <div className="px-2 pb-2">{children}</div>}
    </div>
  );
}

export function hierarchyBadgeClassName(level: number) {
  return badgeToneClassName(toneFromLevel(level));
}
