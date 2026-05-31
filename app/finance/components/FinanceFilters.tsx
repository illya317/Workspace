"use client";

const COMPANIES: Record<string, string> = {
  "01": "丰华生物", "02": "丰华天力通", "03": "丰华悦通",
  "04": "丰华制药", "05": "加拿大", "06": "上海悦通",
};

const YEARS = [2024, 2025, 2026];

interface FinanceFiltersProps {
  companyFilter: string;
  yearFilter: string;
  monthFilter?: string;
  levelFilter?: string;
  keyword?: string;
  pageSize?: number;
  total?: number;
  onCompanyChange: (value: string) => void;
  onYearChange: (value: string) => void;
  onMonthChange?: (value: string) => void;
  onLevelChange?: (value: string) => void;
  onKeywordChange?: (value: string) => void;
  onPageSizeChange?: (value: number) => void;
  extra?: React.ReactNode;
  showMonth?: boolean;
  showLevel?: boolean;
  showSearch?: boolean;
  showPageSize?: boolean;
}

export default function FinanceFilters({
  companyFilter, yearFilter, monthFilter = "", levelFilter = "",
  keyword = "", pageSize = 50, total,
  onCompanyChange, onYearChange, onMonthChange,
  onLevelChange, onKeywordChange, onPageSizeChange,
  extra,
  showMonth = true, showLevel = false, showSearch = true, showPageSize = true,
}: FinanceFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-white p-2 shadow-sm">
      <div className="flex items-center gap-1">
        <label className="text-[11px] text-gray-400">公司</label>
        <select value={companyFilter} onChange={(e) => onCompanyChange(e.target.value)}
          className="rounded border border-gray-200 px-1.5 py-1 text-xs focus:border-emerald-400 focus:outline-none">
          <option value="">全部</option>
          {Object.entries(COMPANIES).map(([c, n]) => <option key={c} value={c}>{n}</option>)}
        </select>
      </div>

      <div className="flex items-center gap-1">
        <label className="text-[11px] text-gray-400">年度</label>
        <select value={yearFilter} onChange={(e) => onYearChange(e.target.value)}
          className="rounded border border-gray-200 px-1.5 py-1 text-xs focus:border-emerald-400 focus:outline-none">
          <option value="">全部</option>
          {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {showMonth && onMonthChange && (
        <div className="flex items-center gap-1">
          <label className="text-[11px] text-gray-400">月份</label>
          <select value={monthFilter} onChange={(e) => onMonthChange(e.target.value)}
            className="rounded border border-gray-200 px-1.5 py-1 text-xs focus:border-emerald-400 focus:outline-none">
            <option value="">全部</option>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>{m}月</option>)}
          </select>
        </div>
      )}

      {showLevel && onLevelChange && (
        <div className="flex items-center gap-1">
          <label className="text-[11px] text-gray-400">层级</label>
          <select value={levelFilter} onChange={(e) => onLevelChange(e.target.value)}
            className="rounded border border-gray-200 px-1.5 py-1 text-xs focus:border-emerald-400 focus:outline-none">
            <option value="">全部</option>
            {[1, 2, 3, 4, 5].map((l) => <option key={l} value={l}>{l}级</option>)}
          </select>
        </div>
      )}

      {showSearch && onKeywordChange && (
        <input value={keyword} onChange={(e) => onKeywordChange(e.target.value)}
          placeholder="搜索..." className="rounded border border-gray-200 px-2 py-1 text-xs w-36 focus:border-emerald-400 focus:outline-none" />
      )}

      {showPageSize && onPageSizeChange && (
        <div className="flex items-center gap-1">
          <select value={pageSize} onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="rounded border border-gray-200 px-1.5 py-1 text-xs focus:border-emerald-400 focus:outline-none">
            {[20, 50, 100, 200].map((s) => <option key={s} value={s}>{s}条/页</option>)}
          </select>
        </div>
      )}

      <div className="flex-1" />

      {total !== undefined && <span className="text-[11px] text-gray-400">共 {total} 条</span>}

      {extra}
    </div>
  );
}
