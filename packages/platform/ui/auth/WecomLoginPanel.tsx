"use client";

import { useEffect, useRef } from "react";
import type { WWLoginInstance } from "@wecom/jssdk";
import type { FormSurfaceItemSpec } from "@workspace/core/ui";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "/workspace";

type WecomPanelStartResponse = { authorizeUrl?: string; error?: string };

type WecomLoginPanelOptions = {
  key: string;
  onError: (message: string) => void;
  onLoadingChange: (loading: boolean) => void;
};

function getSafeNextPath() {
  const next = new URLSearchParams(window.location.search).get("next");
  if (next && next.startsWith(`${BASE_PATH}/`) && !next.startsWith("//")) return next;
  return `${BASE_PATH}/portal`;
}

function requireLoginUrlParam(url: URL, key: string) {
  const value = url.searchParams.get(key)?.trim();
  if (!value) throw new Error(`企业微信登录参数缺少 ${key}`);
  return value;
}

function WecomLoginPanel({
  onError,
  onLoadingChange,
}: Omit<WecomLoginPanelOptions, "key">) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!panelRef.current) return;

    let cancelled = false;
    let loginPanel: WWLoginInstance | undefined;
    onLoadingChange(true);
    onError("");

    void (async () => {
      try {
        const startUrl = new URL(`${BASE_PATH}/api/auth/wecom/start`, window.location.origin);
        startUrl.searchParams.set("display", "panel");
        const next = getSafeNextPath();
        if (next !== `${BASE_PATH}/portal`) startUrl.searchParams.set("next", next);

        const response = await fetch(startUrl, { credentials: "include", cache: "no-store" });
        const data = await response.json().catch(() => ({})) as WecomPanelStartResponse;
        if (!response.ok || !data.authorizeUrl) {
          throw new Error(data.error || "企业微信登录初始化失败");
        }

        const loginUrl = new URL(data.authorizeUrl);
        const {
          createWWLoginPanel,
          WWLoginLangType,
          WWLoginPanelSizeType,
          WWLoginRedirectType,
          WWLoginType,
        } = await import("@wecom/jssdk");
        if (cancelled || !panelRef.current) return;

        loginPanel = createWWLoginPanel({
          el: panelRef.current,
          params: {
            login_type: WWLoginType.corpApp,
            appid: requireLoginUrlParam(loginUrl, "appid"),
            agentid: requireLoginUrlParam(loginUrl, "agentid"),
            redirect_uri: requireLoginUrlParam(loginUrl, "redirect_uri"),
            state: requireLoginUrlParam(loginUrl, "state"),
            redirect_type: WWLoginRedirectType.top,
            panel_size: WWLoginPanelSizeType.small,
            lang: WWLoginLangType.zh,
          },
          onLoginFail: (result) => {
            if (!cancelled) onError(result.errMsg || "企业微信登录失败，请重试");
          },
        });
      } catch (error) {
        if (!cancelled) onError(error instanceof Error ? error.message : "企业微信登录初始化失败");
      } finally {
        if (!cancelled) onLoadingChange(false);
      }
    })();

    return () => {
      cancelled = true;
      loginPanel?.unmount();
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
