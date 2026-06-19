"use client";

import { useCompanyOptions } from "../hooks/useCompanyOptions";

interface CompanyNameCellProps {
  code: string | null | undefined;
  fallback?: string;
}

export default function CompanyNameCell({
  code,
  fallback = "-",
}: CompanyNameCellProps) {
  const options = useCompanyOptions();
  if (!code) return <span className="text-gray-600">{fallback}</span>;
  const found = options.find((option) => option.value === code);
  return <span className="text-gray-600">{found?.label || code}</span>;
}
