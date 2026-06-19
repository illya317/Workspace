"use client";

import { Pagination as CorePagination } from "@workspace/core/ui";

interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
}

export default function Pagination({ page, totalPages, total, onPageChange }: PaginationProps) {
  return <CorePagination page={page} totalPages={totalPages} total={total} onPageChange={onPageChange} />;
}
