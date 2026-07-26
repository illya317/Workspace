"use client";

import { createContext, useContext, type ReactNode } from "react";
import { ActionGlyph } from "./internal/action/ActionGlyphs";

export type MobileExperienceStrategy = "native" | "landscape" | "unavailable";

export interface MobileExperienceBoundaryProps {
  strategy: MobileExperienceStrategy;
  title?: string;
  reason?: string;
  onBack?: () => void;
  children: ReactNode;
}

type LockableOrientation = ScreenOrientation & {
  lock?: (orientation: "landscape") => Promise<void>;
};

const MobileExperienceContext = createContext<MobileExperienceStrategy>("native");

export default function MobileExperienceBoundary({
  strategy,
  title = "当前页面",
  reason,
  onBack,
  children,
}: MobileExperienceBoundaryProps) {
  const parentStrategy = useContext(MobileExperienceContext);
  if (strategy === "native") return children;
  if (strategy === "landscape" && parentStrategy === "landscape") return children;

  if (strategy === "unavailable") {
    return (
      <MobileExperienceContext.Provider value="unavailable">
        <MobileUnavailableState title={title} reason={reason} onBack={onBack} />
        <div className="mobile-experience-unavailable-content max-sm:hidden" data-mobile-experience-content="unavailable">
          {children}
        </div>
      </MobileExperienceContext.Provider>
    );
  }

  return (
    <MobileExperienceContext.Provider value="landscape">
      <MobileLandscapePrompt title={title} reason={reason} onBack={onBack} />
      <div
        className="mobile-experience-landscape-content max-sm:hidden landscape:max-sm:block"
        data-mobile-experience-content="landscape"
      >
        <div className="mobile-experience-landscape-toolbar hidden">
          <span className="min-w-0 flex-1 truncate text-sm font-bold text-slate-900" title={`${title} · 横屏工作台`}>{title} · 横屏工作台</span>
          {onBack ? (
            <button
              type="button"
              aria-label="退出横屏工作台"
              title="退出横屏工作台"
              onClick={onBack}
              className="grid size-10 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-600"
            >
              <ActionGlyph kind="x" className="size-5" />
            </button>
          ) : null}
        </div>
        <div className="mobile-experience-landscape-scroll">
          {children}
        </div>
      </div>
    </MobileExperienceContext.Provider>
  );
}

function MobileLandscapePrompt({ title, reason, onBack }: Omit<MobileExperienceBoundaryProps, "strategy" | "children">) {
  async function enterLandscape() {
    try {
      await document.documentElement.requestFullscreen?.();
      const orientation = screen.orientation as LockableOrientation | undefined;
      await orientation?.lock?.("landscape");
    } catch {
      // Safari/iOS may reject orientation locking; the user can still rotate the device manually.
    }
  }

  return (
    <div className="px-4 py-6 sm:hidden landscape:max-sm:hidden" data-mobile-experience="landscape">
      <div className="mx-auto max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-start gap-3 p-5">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-slate-900 text-white">
            <ActionGlyph kind="view" className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-bold text-slate-900">横屏使用{title}</h1>
            <p className="mt-1 text-sm leading-6 text-slate-500">{reason ?? "该工作台需要同时查看多列或画布，请横置手机后继续。"}</p>
          </div>
        </div>
        <div className="grid gap-2 border-t border-slate-100 p-4">
          <button
            type="button"
            onClick={() => void enterLandscape()}
            className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white active:bg-emerald-700"
          >
            <ActionGlyph kind="view" className="size-4" />
            进入横屏工作台
          </button>
          {onBack ? <BackButton onBack={onBack} /> : null}
        </div>
      </div>
    </div>
  );
}

function MobileUnavailableState({ title, reason, onBack }: Omit<MobileExperienceBoundaryProps, "strategy" | "children">) {
  return (
    <div
      className="mobile-experience-unavailable-state px-4 py-6 sm:hidden"
      data-mobile-experience="unavailable"
    >
      <div className="mx-auto max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-start gap-3 p-5">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600">
            <ActionGlyph kind="view" className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-bold text-slate-900">手机端暂不提供{title}</h1>
            <p className="mt-1 text-sm leading-6 text-slate-500">{reason ?? "这项工作需要桌面端的完整操作空间，请在电脑上继续。"}</p>
          </div>
        </div>
        {onBack ? <div className="border-t border-slate-100 p-4"><BackButton onBack={onBack} /></div> : null}
      </div>
    </div>
  );
}

function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <button
      type="button"
      onClick={onBack}
      className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-100 px-4 text-sm font-bold text-slate-700 active:bg-slate-200"
    >
      <ActionGlyph kind="back" className="size-4" />
      返回
    </button>
  );
}
