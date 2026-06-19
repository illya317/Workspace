"use client";

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

  const buttonClass = "rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-40";

  return (
    <div className={className ?? "flex items-center justify-between rounded-lg bg-white p-3 shadow-sm"}>
      <span className="text-xs text-gray-500">
        第 {page} / {totalPages} 页{typeof total === "number" ? `，共 ${total} 条` : ""}
      </span>
      <div className="flex items-center gap-1">
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
