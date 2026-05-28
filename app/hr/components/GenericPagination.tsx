"use client";

interface GenericPaginationProps {
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

export default function GenericPagination({
  total,
  page,
  pageSize,
  onPageChange,
}: GenericPaginationProps) {
  if (total <= 0) return null;

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="mt-4 flex items-center justify-between">
      <p className="text-xs text-gray-500">
        共 {total} 条，第 {page} / {totalPages} 页
      </p>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="rounded border border-gray-300 px-3 py-1 text-xs disabled:opacity-40 hover:bg-gray-50"
        >
          上一页
        </button>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page * pageSize >= total}
          className="rounded border border-gray-300 px-3 py-1 text-xs disabled:opacity-40 hover:bg-gray-50"
        >
          下一页
        </button>
      </div>
    </div>
  );
}
