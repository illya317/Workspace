"use client";

import { useEffect, useRef, useState } from "react";
import type { WWLoginInstance } from "@wecom/jssdk";
import type { FormSurfaceItemSpec } from "@workspace/core/ui";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "/workspace";

type WecomPanelStartResponse = { authorizeUrl?: string; error?: string };
type WecomHandoffStartResponse = { launchUrl?: string; expiresAt?: string; error?: string };
type WecomHandoffConsumeResponse = {
  status?: "pending" | "awaiting_return" | "authenticated";
  nextPath?: string;
  error?: string;
};

type WecomLoginPanelOptions = {
  key: string;
  onError: (message: string) => void;
  onLoadingChange: (loading: boolean) => void;
};

type MobileWecomLoginPanelOptions = WecomLoginPanelOptions & {
  initialReturnToken?: string;
};

type WecomHandoffResultPanelOptions = {
  key: string;
  returnToken: string;
  verificationCode: string;
  onError: (message: string) => void;
};

const HANDOFF_POLL_INTERVAL_MS = 1500;
const HANDOFF_CLIENT_TTL_MS = 5 * 60 * 1000;

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

function MobileWecomLoginPanel({
  onError,
  onLoadingChange,
  initialReturnToken,
}: Omit<MobileWecomLoginPanelOptions, "key">) {
  const [launchUrl, setLaunchUrl] = useState("");
  const [expiresAt, setExpiresAt] = useState(0);
  const [opened, setOpened] = useState(false);
  const [startFailed, setStartFailed] = useState(false);
  const [awaitingReturn, setAwaitingReturn] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");
  const [verificationError, setVerificationError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const pollingRef = useRef(false);

  useEffect(() => {
    if (initialReturnToken) {
      setExpiresAt(Date.now() + HANDOFF_CLIENT_TTL_MS);
      onLoadingChange(false);
      return;
    }

    const controller = new AbortController();
    onLoadingChange(true);
    onError("");

    void (async () => {
      try {
        const response = await fetch(`${BASE_PATH}/api/auth/wecom/handoff/start`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          cache: "no-store",
          signal: controller.signal,
          body: JSON.stringify({ next: getSafeNextPath() }),
        });
        const data = await response.json().catch(() => ({})) as WecomHandoffStartResponse;
        if (!response.ok || !data.launchUrl || !data.expiresAt) {
          throw new Error(data.error || "企业微信登录初始化失败");
        }
        const expiration = new Date(data.expiresAt).getTime();
        if (!Number.isFinite(expiration)) throw new Error("企业微信登录有效期无效");
        setLaunchUrl(data.launchUrl);
        setExpiresAt(expiration);
      } catch (error) {
        if (controller.signal.aborted) return;
        setStartFailed(true);
        onError(error instanceof Error ? error.message : "企业微信登录初始化失败");
      } finally {
        if (!controller.signal.aborted) onLoadingChange(false);
      }
    })();

    return () => controller.abort();
  }, [initialReturnToken, onError, onLoadingChange]);

  useEffect(() => {
    if (!expiresAt || (!launchUrl && !initialReturnToken)) return;

    let cancelled = false;
    let terminal = false;

    async function consumeHandoff() {
      if (cancelled || terminal || pollingRef.current) return;
      if (Date.now() >= expiresAt) {
        terminal = true;
        onError("企业微信登录已超时，请重新发起");
        return;
      }

      pollingRef.current = true;
      try {
        const response = await fetch(`${BASE_PATH}/api/auth/wecom/handoff/consume`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          cache: "no-store",
          body: JSON.stringify(initialReturnToken ? { returnToken: initialReturnToken } : {}),
        });
        const data = await response.json().catch(() => ({})) as WecomHandoffConsumeResponse;
        if (cancelled) return;
        if (response.status === 202) {
          setAwaitingReturn(data.status === "awaiting_return");
          return;
        }
        if (!response.ok || data.status !== "authenticated" || !data.nextPath) {
          terminal = true;
          onError(data.error || "企业微信登录领取失败，请重试");
          return;
        }

        terminal = true;
        window.location.replace(data.nextPath);
      } catch {
        // A transient mobile network switch should not invalidate the handoff.
      } finally {
        pollingRef.current = false;
      }
    }

    const intervalId = window.setInterval(() => void consumeHandoff(), HANDOFF_POLL_INTERVAL_MS);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") void consumeHandoff();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    void consumeHandoff();

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [expiresAt, initialReturnToken, launchUrl, onError]);

  async function submitVerificationCode() {
    const code = verificationCode.trim();
    if (!/^\d{8}$/.test(code)) {
      setVerificationError("请输入企业微信页面显示的 8 位验证码");
      return;
    }

    setSubmitting(true);
    setVerificationError("");
    try {
      const response = await fetch(`${BASE_PATH}/api/auth/wecom/handoff/consume`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        cache: "no-store",
        body: JSON.stringify({ verificationCode: code }),
      });
      const data = await response.json().catch(() => ({})) as WecomHandoffConsumeResponse;
      if (response.ok && data.status === "authenticated" && data.nextPath) {
        window.location.replace(data.nextPath);
        return;
      }
      if (response.status === 401) {
        setVerificationError(data.error || "验证码不正确，请重试");
      } else {
        onError(data.error || "企业微信登录领取失败，请重试");
      }
    } catch {
      setVerificationError("网络连接失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  }

  if (initialReturnToken) {
    return <div role="status">正在把企业微信登录态带回此浏览器...</div>;
  }

  if (startFailed) {
    return <div role="status">企业微信登录未能启动，请返回后重试。</div>;
  }

  if (!launchUrl) {
    return <div role="status">正在准备企业微信登录...</div>;
  }

  return (
    <div className="space-y-3 text-center">
      <a
        href={launchUrl}
        className="inline-flex min-h-10 items-center justify-center rounded-md border px-4 py-2"
        onClick={() => setOpened(true)}
      >
        打开企业微信
      </a>
      <p role="status">
        {opened
          ? "验证完成后，请返回此浏览器，页面会自动登录。"
          : "将在企业微信中确认身份，不需要扫码。"}
      </p>
      <p>如果没有打开，请确认已安装企业微信后再次点击。</p>
      {awaitingReturn ? (
        <div className="space-y-2">
          <label htmlFor="wecom-verification-code">若未自动返回，请输入企业微信页面上的验证码</label>
          <input
            id="wecom-verification-code"
            value={verificationCode}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={8}
            onChange={(event) => {
              setVerificationCode(event.target.value.replace(/\D/g, "").slice(0, 8));
              setVerificationError("");
            }}
          />
          {verificationError ? <p role="alert">{verificationError}</p> : null}
          <button
            type="button"
            disabled={submitting}
            onClick={() => void submitVerificationCode()}
          >
            {submitting ? "正在验证..." : "完成登录"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function WecomHandoffResultPanel({
  returnToken,
  verificationCode,
  onError,
}: Omit<WecomHandoffResultPanelOptions, "key">) {
  const [opening, setOpening] = useState(false);

  async function returnToBrowser() {
    setOpening(true);
    onError("");
    try {
      const returnUrl = new URL(`${BASE_PATH}/login`, window.location.origin);
      returnUrl.hash = new URLSearchParams({ wecom_return: returnToken }).toString();
      const { openDefaultBrowser } = await import("@wecom/jssdk");
      await openDefaultBrowser({ url: returnUrl.toString() });
    } catch {
      onError("无法自动打开系统浏览器，请切回原浏览器并输入下方验证码");
    } finally {
      setOpening(false);
    }
  }

  return (
    <div className="space-y-3 text-center">
      <p>企业微信身份验证已完成。</p>
      <button type="button" disabled={opening} onClick={() => void returnToBrowser()}>
        {opening ? "正在返回..." : "返回浏览器完成登录"}
      </button>
      <p>若打开的不是原浏览器，请切回原浏览器并输入验证码：</p>
      <p aria-label="企业微信登录验证码">{verificationCode}</p>
    </div>
  );
}

/** @ui-specialized-surface Platform WeCom login panel owns the third-party iframe and mobile app handoff lifecycle. */
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

/** @ui-specialized-surface Platform WeCom mobile login owns app launch, browser return, and fallback verification. */
export function createMobileWecomLoginPanelItem({
  key,
  onError,
  onLoadingChange,
  initialReturnToken,
}: MobileWecomLoginPanelOptions): FormSurfaceItemSpec {
  return {
    kind: "note",
    key,
    content: (
      <MobileWecomLoginPanel
        onError={onError}
        onLoadingChange={onLoadingChange}
        initialReturnToken={initialReturnToken}
      />
    ),
  };
}

/** @ui-specialized-surface Platform WeCom callback owns the system-browser return and one-time verification fallback. */
export function createWecomHandoffResultPanelItem({
  key,
  returnToken,
  verificationCode,
  onError,
}: WecomHandoffResultPanelOptions): FormSurfaceItemSpec {
  return {
    kind: "note",
    key,
    content: (
      <WecomHandoffResultPanel
        returnToken={returnToken}
        verificationCode={verificationCode}
        onError={onError}
      />
    ),
  };
}
