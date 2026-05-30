"use client";

const COMPANIES: Record<string, string> = {
  "01": "丰华生物",
  "02": "丰华天力通",
  "03": "丰华悦通",
  "04": "丰华制药",
  "05": "加拿大",
  "06": "上海悦通",
};

const YEARS = [2024, 2025, 2026];

interface FinanceFiltersProps {
  companyFilter: string;
  yearFilter: string;
  monthFilter?: string;
  pageSize?: number;
  onCompanyChange: (value: string) => void;
  onYearChange: (value: string) => void;
  onMonthChange?: (value: string) => void;
  onPageSizeChange?: (value: number) => void;
  extra?: React.ReactNode;
  showMonth?: boolean;
  showPageSize?: boolean;
}

export default function FinanceFilters({
  companyFilter,
  yearFilter,
  monthFilter = "",
  pageSize = 50,
  onCompanyChange,
  onYearChange,
  onMonthChange,
  onPageSizeChange,
  extra,
  showMonth = true,
  showPageSize = true,
}: FinanceFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg bg-white p-3 shadow-sm">
      <div className="flex items-center gap-2">
        <label className="text-xs text-gray-500">公司</label>
        <select
          value={companyFilter}
          onChange={(e) => onCompanyChange(e.target.value)}
          className="rounded border border-gray-300 px-2 py-1 text-xs focus:border-emerald-400 focus:outline-none"
        >
          <option value="">全部公司</option>
          {Object.entries(COMPANIES).map(([code, name]) => (
            <option key={code} value={code}>{name}</option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2">
        <label className="text-xs text-gray-500">年度</label>
        <select
          value={yearFilter}
          onChange={(e) => onYearChange(e.target.value)}
          className="rounded border border-gray-300 px-2 py-1 text-xs focus:border-emerald-400 focus:outline-none"
        >
          <option value="">全部年度</option>
          {YEARS.map((y) => (
            <option key={y} value={y}>{y}年</option>
          ))}
        </select>
      </div>

      {showMonth && onMonthChange && (
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">月份</label>
          <select
            value={monthFilter}
            onChange={(e) => onMonthChange(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1 text-xs focus:border-emerald-400 focus:outline-none"
          >
            <option value="">全部月份</option>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>{m}月</option>
            ))}
          </select>
        </div>
      )}

      {showPageSize && onPageSizeChange && (
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">每页</label>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="rounded border border-gray-300 px-2 py-1 text-xs focus:border-emerald-400 focus:outline-none"
          >
            {[20, 50, 100, 200].map((s) => (
              <option key={s} value={s}>{s}条</option>
            ))}
          </select>
        </div>
      )}

      {extra}
    </div>
  );
}
