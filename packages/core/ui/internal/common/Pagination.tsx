"use client";

import { Pagination as AntdPagination } from "antd";

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

  return (
    <div className={`flex min-h-12 w-full items-center justify-end bg-white px-3 py-2 sm:px-4 ${className ?? ""}`}>
      <AntdPagination
        current={page}
        onChange={onPageChange}
        pageSize={1}
        responsive
        showLessItems={compact}
        showQuickJumper={!compact}
        showSizeChanger={false}
        showTotal={() => `第 ${page} / ${totalPages} 页${typeof total === "number" ? `，共 ${total} 条` : ""}`}
        size={compact ? "small" : undefined}
        total={totalPages}
      />
    </div>
  );
}
