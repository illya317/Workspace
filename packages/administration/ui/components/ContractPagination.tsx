"use client";

import { Pagination } from "@workspace/core/ui";

interface ContractPaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export default function ContractPagination({ page, totalPages, onPageChange }: ContractPaginationProps) {
  return (
    <Pagination
      page={page}
      totalPages={totalPages}
      onPageChange={onPageChange}
      compact
      className="mt-4 flex items-center justify-center gap-3"
    />
  );
}
