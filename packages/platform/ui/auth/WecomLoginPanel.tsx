"use client";

import { useEffect, useRef } from "react";
import type { FormSurfaceItemSpec } from "@workspace/core/ui";
import { mountWecomLoginPanel } from "./wecom-login-panel-adapter";

type WecomLoginPanelOptions = {
  key: string;
  onError: (message: string) => void;
  onLoadingChange: (loading: boolean) => void;
};

function WecomLoginPanel({
  onError,
  onLoadingChange,
}: Omit<WecomLoginPanelOptions, "key">) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!panelRef.current) return;

    const controller = new AbortController();
    let unmountPanel: (() => void) | undefined;
    onLoadingChange(true);
    onError("");

    void (async () => {
      try {
        const loginPanel = await mountWecomLoginPanel({
          element: panelRef.current!,
          signal: controller.signal,
          onError,
        });
        if (loginPanel) unmountPanel = () => loginPanel.unmount();
      } catch (error) {
        if (!controller.signal.aborted) onError(error instanceof Error ? error.message : "企业微信登录初始化失败");
      } finally {
        if (!controller.signal.aborted) onLoadingChange(false);
      }
    })();

    return () => {
      controller.abort();
      unmountPanel?.();
    };
  }, [onError, onLoadingChange]);

  return (
    <div className="flex justify-center">
      <div ref={panelRef} aria-label="企业微信登录" />
    </div>
  );
}

/** @ui-specialized-surface Platform WeCom login panel owns the official third-party iframe lifecycle. */
export function createWecomLoginPanelItem({
  key,
  onError,
  onLoadingChange,
}: WecomLoginPanelOptions): FormSurfaceItemSpec {
  return {
    kind: "note",
    key,
    content: (
      <WecomLoginPanel
        onError={onError}
        onLoadingChange={onLoadingChange}
      />
    ),
  };
}
