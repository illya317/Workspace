"use client";

import { joinClassNames } from "./card-utils";

export interface PaginationProps {
  page: number;
  totalPages: number;
  total?: number;
  onPageChange: (page: number) => void;
  className?: string;
  compact?: boolean;
}

export default function Pagination({
  page,
  totalPages,
  total,
  onPageChange,
  className,
  compact,
}: PaginationProps) {
  if (totalPages <= 1) return null;

  const buttonClass = "inline-flex h-8 items-center justify-center rounded-md px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent";

  return (
    <div className={joinClassNames("flex min-h-12 w-full flex-nowrap items-center justify-between gap-3 bg-white px-4 py-2", className)}>
      <span className="shrink-0 whitespace-nowrap text-xs font-medium text-slate-500">
        第 {page} / {totalPages} 页{typeof total === "number" ? `，共 ${total} 条` : ""}
      </span>
      <div className="flex shrink-0 items-center gap-1">
        {!compact && (
          <button type="button" onClick={() => onPageChange(1)} disabled={page <= 1} className={buttonClass}>
            首页
          </button>
        )}
        <button type="button" onClick={() => onPageChange(Math.max(1, page - 1))} disabled={page <= 1} className={buttonClass}>
          上一页
        </button>
        <button type="button" onClick={() => onPageChange(Math.min(totalPages, page + 1))} disabled={page >= totalPages} className={buttonClass}>
          下一页
        </button>
        {!compact && (
          <button type="button" onClick={() => onPageChange(totalPages)} disabled={page >= totalPages} className={buttonClass}>
            末页
          </button>
        )}
      </div>
    </div>
  );
}
