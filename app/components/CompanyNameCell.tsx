"use client";

import { useCompanyOptions } from "@/app/hooks/useCompanyOptions";

interface CompanyNameCellProps {
  code: string | null | undefined;
  fallback?: string;
}

/**
 * 从 Company 表动态查询显示公司名。
 * 多个实例共享同一全局缓存请求。
 */
export default function CompanyNameCell({ code, fallback = "-" }: CompanyNameCellProps) {
  const options = useCompanyOptions();
  if (!code) return <span className="text-gray-600">{fallback}</span>;
  const found = options.find((o) => o.value === code);
  return <span className="text-gray-600">{found?.label || code}</span>;
}
