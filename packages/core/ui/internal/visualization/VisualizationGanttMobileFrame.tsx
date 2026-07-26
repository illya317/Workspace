"use client";

import { useEffect, useRef, useState } from "react";
import { ActionGlyph } from "../action/ActionGlyphs";
import { VisualizationGanttCanvas } from "./VisualizationGantt";
import type { VisualizationGanttSpec } from "./VisualizationGanttTypes";

type LockableOrientation = ScreenOrientation & {
  lock?: (orientation: "landscape") => Promise<void>;
  unlock?: () => void;
};

export default function VisualizationGanttMobileFrame({ spec }: { spec: VisualizationGanttSpec }) {
  const [focusMode, setFocusMode] = useState(false);
  const focusRootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!focusMode) return;
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.fullscreenElement) setFocusMode(false);
    };
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) setFocusMode(false);
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
    };
  }, [focusMode]);

  async function enterFocusMode() {
    setFocusMode(true);
    const root = focusRootRef.current;
    try {
      await root?.requestFullscreen?.();
      await lockLandscapeOrientation();
    } catch {
      // iOS/Safari 等环境不支持锁屏时，保留固定横屏专注视图并提示用户旋转设备。
    }
  }

  async function leaveFocusMode() {
    unlockOrientation();
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
    } finally {
      setFocusMode(false);
    }
  }

  return (
    <div
      ref={focusRootRef}
      className={focusMode
        ? "fixed inset-0 z-[90] flex h-[100dvh] w-screen flex-col overflow-hidden bg-slate-100"
        : "min-w-0"}
    >
      {!focusMode ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-950 p-4 text-white shadow-sm sm:hidden">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/10">
              <ActionGlyph kind="view" className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">横屏查看甘特图</p>
              <p className="mt-1 text-xs leading-5 text-slate-300">时间轴会进入全屏专注模式；不支持自动横屏的设备，请横置手机。</p>
            </div>
          </div>
          <button
            type="button"
            onClick={enterFocusMode}
            className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 text-sm font-bold text-white transition active:scale-[0.99] active:bg-emerald-600"
          >
            <ActionGlyph kind="view" className="size-4" />
            进入横屏模式
          </button>
        </div>
      ) : null}

      <div className={focusMode ? "flex min-h-0 flex-1 flex-col" : "hidden sm:block"}>
        {focusMode ? (
          <div className="flex min-h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 pt-[env(safe-area-inset-top)] shadow-sm">
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-900">甘特图 · 横屏专注</p>
              <p className="text-xs text-slate-500">可左右滑动时间轴；横置手机空间更完整</p>
            </div>
            <button
              type="button"
              onClick={leaveFocusMode}
              className="grid size-11 shrink-0 place-items-center rounded-full bg-slate-100 text-xl text-slate-600"
              aria-label="退出横屏模式"
            >
              ×
            </button>
          </div>
        ) : null}
        <div className={focusMode ? "min-h-0 flex-1 overflow-auto overscroll-contain bg-white" : undefined}>
          <VisualizationGanttCanvas spec={spec} />
        </div>
      </div>
    </div>
  );
}

async function lockLandscapeOrientation() {
  const orientation = screen.orientation as LockableOrientation | undefined;
  await orientation?.lock?.("landscape");
}

function unlockOrientation() {
  const orientation = screen.orientation as LockableOrientation | undefined;
  orientation?.unlock?.();
}
