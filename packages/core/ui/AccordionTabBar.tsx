"use client";

import { joinClassNames } from "./card-utils";

export interface AccordionTabChild {
  key: string;
  label: string;
}

export interface AccordionTabItem {
  key: string;
  label: string;
  children?: AccordionTabChild[];
}

export interface AccordionTabBarProps {
  tabs: AccordionTabItem[];
  activeTab: string;
  activeChild?: string;
  onTabChange: (key: string) => void;
  onChildChange?: (key: string) => void;
  className?: string;
}

export default function AccordionTabBar({
  tabs,
  activeTab,
  activeChild,
  onTabChange,
  onChildChange,
  className = "",
}: AccordionTabBarProps) {
  return (
    <nav
      aria-label="页面标签"
      className={joinClassNames("flex w-full flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-2 shadow-sm", className)}
    >
      {tabs.map((tab) => {
        const active = tab.key === activeTab;
        const children = tab.children ?? [];
        return (
          <div key={tab.key} className="flex min-h-12 items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                onTabChange(tab.key);
              }}
              className={joinClassNames(
                "h-11 rounded-lg px-6 text-sm font-semibold transition",
                active
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
              )}
            >
              {tab.label}
            </button>
            {active && children.length > 0 && (
              <div className="flex h-11 items-center gap-1.5 rounded-lg border border-emerald-100 bg-emerald-50/60 px-1.5">
                {children.map((child) => {
                  const childActive = child.key === activeChild;
                  return (
                    <button
                      key={child.key}
                      type="button"
                      onClick={() => onChildChange?.(child.key)}
                      className={joinClassNames(
                        "h-8 rounded-md px-4 text-sm font-semibold transition",
                        childActive
                          ? "bg-white text-emerald-700 shadow-sm"
                          : "text-slate-500 hover:bg-white/80 hover:text-slate-900",
                      )}
                    >
                      {child.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}
