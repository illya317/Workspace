import type { ReactNode } from "react";

import { EmptyStateCard, PanelCard } from "./Card";
import SearchInput from "./SearchInput";

function joinClassNames(...classNames: Array<string | false | null | undefined>) {
  return classNames.filter(Boolean).join(" ");
}

export interface EntitySelectorTab<T extends string> {
  id: T;
  label: ReactNode;
  count?: ReactNode;
}

export interface EntitySelectorItem {
  id: string | number;
  title: ReactNode;
  code?: ReactNode;
  badge?: ReactNode;
  meta?: ReactNode;
}

export interface EntitySelectorPanelProps<T extends string> {
  title: ReactNode;
  subtitle?: ReactNode;
  tabs: EntitySelectorTab<T>[];
  activeTab: T;
  onTabChange: (tab: T) => void;
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  items: EntitySelectorItem[];
  activeItemId?: string | number | null;
  onItemSelect: (item: EntitySelectorItem) => void;
  emptyText?: ReactNode;
  onClose?: () => void;
  className?: string;
  showHeader?: boolean;
  showSearch?: boolean;
}

export default function EntitySelectorPanel<T extends string>({
  title,
  subtitle,
  tabs,
  activeTab,
  onTabChange,
  searchValue,
  onSearchChange,
  searchPlaceholder = "搜索名称、编码",
  items,
  activeItemId,
  onItemSelect,
  emptyText = "暂无可选数据",
  onClose,
  className = "",
  showHeader = true,
  showSearch = true,
}: EntitySelectorPanelProps<T>) {
  return (
    <PanelCard className={className} bodyClassName="p-3">
      {(showHeader || onClose) && (
        <div className="flex items-start justify-between gap-3">
          {showHeader ? (
            <div>
              <h3 className="text-base font-semibold text-slate-900">{title}</h3>
              {subtitle && <p className="mt-1 text-xs text-slate-500">{subtitle}</p>}
            </div>
          ) : (
            <span />
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-200 px-2 py-1 text-sm text-slate-500 hover:bg-slate-50"
            >
              关闭
            </button>
          )}
        </div>
      )}

      <div className="mt-3 inline-flex rounded-lg border border-slate-200 bg-slate-100 p-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            className={joinClassNames(
              "rounded-md px-3 py-1.5 text-sm font-semibold transition",
              activeTab === tab.id ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500 hover:text-slate-800"
            )}
          >
            {tab.label}
            {tab.count !== undefined && <span className="ml-2 text-xs font-medium text-slate-400">{tab.count}</span>}
          </button>
        ))}
      </div>

      {showSearch && (
        <SearchInput
          value={searchValue}
          onChange={onSearchChange}
          placeholder={searchPlaceholder}
          className="mt-3"
        />
      )}

      <div className="mt-3 max-h-[620px] space-y-2 overflow-auto">
        {items.length === 0 ? (
          <EmptyStateCard compact>{emptyText}</EmptyStateCard>
        ) : (
          items.map((item) => {
            const active = activeItemId === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onItemSelect(item)}
                className={joinClassNames(
                  "flex w-full min-w-0 items-center gap-2 rounded-md border px-2.5 py-2 text-left shadow-sm transition",
                  active
                    ? "border-emerald-400 bg-emerald-50"
                    : "border-slate-200 bg-white hover:border-emerald-200 hover:bg-emerald-50/40"
                )}
              >
                {item.badge}
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span className="min-w-0 flex-1 truncate whitespace-nowrap text-sm font-semibold text-slate-900">
                      {item.title}
                    </span>
                    {item.code && <span className="shrink-0 font-mono text-xs text-slate-400">{item.code}</span>}
                  </span>
                  {item.meta && <span className="mt-0.5 block truncate whitespace-nowrap text-xs text-slate-500">{item.meta}</span>}
                </span>
              </button>
            );
          })
        )}
      </div>
    </PanelCard>
  );
}
