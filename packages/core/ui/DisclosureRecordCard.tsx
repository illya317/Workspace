import type { MouseEventHandler, ReactNode } from "react";

export interface DisclosureRecordAction {
  label: string;
  loadingLabel?: string;
  loading?: boolean;
  onClick: MouseEventHandler<HTMLButtonElement>;
}

export interface DisclosureRecordCardProps {
  expanded: boolean;
  onToggle: () => void;
  header: ReactNode;
  summary?: ReactNode;
  children?: ReactNode;
  detailTitle?: ReactNode;
  detailAction?: DisclosureRecordAction;
}

export default function DisclosureRecordCard({
  expanded,
  onToggle,
  header,
  summary,
  children,
  detailTitle,
  detailAction,
}: DisclosureRecordCardProps) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 transition-colors hover:border-slate-300">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-4 px-4 py-2.5 text-left"
      >
        <div className="min-w-0 flex-1">{header}</div>
        {summary && <div className="shrink-0">{summary}</div>}
        <span className="shrink-0 text-xs text-gray-300">{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && (
        <div className="border-t border-slate-200 bg-gray-50 px-4 py-3">
          {(detailTitle || detailAction) && (
            <div className="mb-2 flex items-center justify-between gap-3">
              {detailTitle && <span className="text-xs text-gray-500">{detailTitle}</span>}
              {detailAction && (
                <button
                  type="button"
                  onClick={detailAction.onClick}
                  disabled={detailAction.loading}
                  className="rounded border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs text-amber-700 hover:bg-amber-100 disabled:opacity-50"
                >
                  {detailAction.loading
                    ? detailAction.loadingLabel ?? detailAction.label
                    : detailAction.label}
                </button>
              )}
            </div>
          )}
          {children}
        </div>
      )}
    </div>
  );
}
