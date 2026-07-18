"use client";

import { useState, type ReactNode } from "react";
import { RotateCw } from "lucide-react";

type MobileRibbonTab = "text" | "paragraph" | "insert" | "table";

const MOBILE_RIBBON_TABS: Array<{ key: MobileRibbonTab; label: string }> = [
  { key: "text", label: "文字" },
  { key: "paragraph", label: "段落" },
  { key: "insert", label: "插入" },
  { key: "table", label: "表格" },
];

export function DocumentEditorToolbar({
  compactLandscape,
  desktopBottom,
  desktopTop,
  mobileRibbons,
  stickyHeaderOffset,
}: {
  compactLandscape: boolean;
  desktopBottom: ReactNode;
  desktopTop: ReactNode;
  mobileRibbons: Record<MobileRibbonTab, ReactNode>;
  stickyHeaderOffset: number;
}) {
  const [mobileRibbonTab, setMobileRibbonTab] = useState<MobileRibbonTab>("text");
  return (
    <div
      className="sticky z-20 border-b border-slate-200 bg-white/95 px-3 py-2 shadow-sm backdrop-blur"
      style={{ top: stickyHeaderOffset }}
    >
      {compactLandscape ? (
        <>
          <div className="flex items-center gap-1 border-b border-slate-100 pb-2" role="tablist" aria-label="编辑工具分组">
            {MOBILE_RIBBON_TABS.map((item) => (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={mobileRibbonTab === item.key}
                onClick={() => setMobileRibbonTab(item.key)}
                className={`min-h-8 flex-1 rounded-md px-3 text-xs font-medium transition ${mobileRibbonTab === item.key ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="overflow-x-auto pt-2" data-document-editor-mobile-ribbon={mobileRibbonTab}>
            <div className="flex w-max items-start gap-3">{mobileRibbons[mobileRibbonTab]}</div>
          </div>
        </>
      ) : (
        <>
          <div className="flex min-h-14 flex-wrap items-center gap-3 border-b border-slate-100 pb-2">{desktopTop}</div>
          <div className="flex min-h-14 flex-wrap items-center gap-3 pt-2">{desktopBottom}</div>
        </>
      )}
    </div>
  );
}

export function DocumentEditorMobilePortraitNotice() {
  return (
    <div
      className="grid min-h-72 place-items-center rounded-xl border border-slate-200 bg-white px-6 py-10 text-center shadow-sm"
      data-document-editor-mobile-state="portrait"
    >
      <div className="max-w-xs">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-slate-100 text-slate-600">
          <RotateCw aria-hidden="true" className="size-7" />
        </span>
        <h3 className="mt-4 text-base font-semibold text-slate-900">请横屏编辑</h3>
        <p className="mt-2 text-sm leading-6 text-slate-500">模板纸面和编辑工具仅在移动端横屏模式下开放。</p>
      </div>
    </div>
  );
}

export function ToolbarGroup({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1 border-r border-slate-200 pr-3 last:border-r-0 last:pr-0">
      <div className="flex items-center gap-1">{children}</div>
      <div className="text-[10px] leading-none text-slate-400">{label}</div>
    </div>
  );
}

export function StackedIcon({ main, badge }: { main: ReactNode; badge: ReactNode }) {
  return (
    <span className="relative inline-flex h-4 w-4 items-center justify-center">
      {main}
      <span className="absolute -bottom-1 -right-1 rounded bg-white text-slate-700">{badge}</span>
    </span>
  );
}

export function GlyphIcon({ children, tone }: { children: ReactNode; tone?: "orange" }) {
  return (
    <span className={`inline-flex h-4 min-w-4 items-center justify-center font-serif text-[15px] font-semibold leading-none ${tone === "orange" ? "text-orange-700" : ""}`}>
      {children}
    </span>
  );
}

export function ToolbarButton({
  active = false,
  children,
  disabled,
  label,
  onClick,
}: {
  active?: boolean;
  children: ReactNode;
  disabled?: boolean;
  label: string;
  onClick?: () => void;
}) {
  const buttonClassName = [
    "inline-flex h-8 w-8 items-center justify-center rounded border transition",
    active
      ? "border-cyan-300 bg-cyan-50 text-cyan-700"
      : "border-transparent bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950",
    "disabled:cursor-not-allowed disabled:border-transparent disabled:bg-slate-100 disabled:text-slate-400",
  ].join(" ");

  return (
    <button
      type="button"
      className={buttonClassName}
      title={label}
      aria-label={label}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={(event) => {
        event.preventDefault();
        onClick?.();
      }}
    >
      {children}
    </button>
  );
}
