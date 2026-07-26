"use client";

import { useEffect, useState } from "react";
import { workspacePath } from "@workspace/core/routing";
import { PageSurface, type FormSurfaceItemSpec } from "@workspace/core/ui";
import { createWecomLoginPanelItem } from "./auth/WecomLoginPanel";
import { resolveWecomLoginEntry } from "./auth/wecom-login-entry";
import { useTenantConfig } from "./tenant-config";
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "/workspace";
const LOGIN_TIMEOUT_MS = 20000;
type LoginMethod = "account" | "wecom-desktop" | "wecom-mobile-help";
function getSafeNextPath() {
  const next = new URLSearchParams(window.location.search).get("next");
  if (next && next.startsWith(`${BASE_PATH}/`) && !next.startsWith("//")) return next;
  return `${BASE_PATH}/portal`;
}

function clearLoginResultParams(searchParams: URLSearchParams) {
  for (const key of [
    "kicked",
    "wecom_error",
  ]) {
    searchParams.delete(key);
  }
  const query = searchParams.toString();
  window.history.replaceState({}, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
}
export default function LoginClient() {
  const tenantConfig = useTenantConfig();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [loginMethod, setLoginMethod] = useState<LoginMethod>("account");
  const [wecomLoading, setWecomLoading] = useState(false);
  const [error, setError] = useState("");
  const [kickedAlert, setKickedAlert] = useState(false);
  useEffect(() => {
    const kickedCookie = document.cookie.split("; ").find(row => row.startsWith("kicked="));
    const searchParams = new URLSearchParams(window.location.search);
    const kickedParam = searchParams.get("kicked");
    const wecomError = searchParams.get("wecom_error");
    if (wecomError) setError(wecomError);
    if (kickedCookie || kickedParam) {
      setKickedAlert(true);
      document.cookie = "kicked=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    }
    if (
      kickedParam
      || wecomError
    ) {
      clearLoginResultParams(searchParams);
    }
  }, []);
  async function handleSubmit() {
    setLoading(true);
    setError("");
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), LOGIN_TIMEOUT_MS);
    try {
      const res = await fetch(`${BASE_PATH}/api/auth/dev-login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        credentials: "include",
        signal: controller.signal,
        body: JSON.stringify({
          username,
          password
        })
      });
      if (res.ok) {
        window.location.assign(getSafeNextPath());
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError(data.error || "登录失败");
    } catch (err) {
      setError(err instanceof DOMException && err.name === "AbortError" ? "登录超时，请稍后重试" : "登录请求失败，请稍后重试");
    } finally {
      window.clearTimeout(timeoutId);
      setLoading(false);
    }
  }
  function handleWecomLogin() {
    setError("");
    const entry = resolveWecomLoginEntry({
      userAgent: navigator.userAgent,
      maxTouchPoints: navigator.maxTouchPoints,
      viewportWidth: window.innerWidth,
    });
    if (entry === "in-app") {
      const url = new URL(`${BASE_PATH}/api/auth/wecom/start`, window.location.origin);
      const next = getSafeNextPath();
      if (next !== `${BASE_PATH}/portal`) url.searchParams.set("next", next);
      window.location.assign(url.toString());
      return;
    }
    setLoginMethod(entry === "mobile-help" ? "wecom-mobile-help" : "wecom-desktop");
  }
  const items: FormSurfaceItemSpec[] = loginMethod === "wecom-desktop"
    ? [
      ...(error ? [{ kind: "note" as const, key: "wecom-error", content: error }] : []),
      createWecomLoginPanelItem({
        key: "wecom-panel",
        onError: setError,
        onLoadingChange: setWecomLoading,
      }),
    ]
    : loginMethod === "wecom-mobile-help"
      ? [
        {
          kind: "note" as const,
          key: "wecom-mobile-help",
          content: "企业微信身份登录需要从企业微信工作台打开本应用。外部手机浏览器无法直接唤起企业微信；如需在当前浏览器继续，请返回使用账号登录。",
        },
      ]
      : [
        ...(kickedAlert ? [{ kind: "note" as const, key: "kicked", content: "您已在其他设备登录，当前会话已失效。如需继续，请重新登录。" }] : []),
        {
          key: "username",
          label: "账号",
          spec: { valueType: "string", control: "text" },
          value: username,
          placeholder: "请输入账号",
          onChange: (value) => setUsername(String(value ?? "")),
        },
        {
          key: "password",
          label: "密码",
          spec: { valueType: "string", control: "text" },
          value: password,
          type: "password",
          placeholder: "请输入密码",
          error: error || undefined,
          onChange: (value) => setPassword(String(value ?? "")),
        },
      ];
  return (
    <PageSurface
      kind="login"
      brand={{
        title: tenantConfig.identity.appName,
        logo: {
          src: workspacePath("/company/logo.png"),
          alt: tenantConfig.identity.companyName,
          width: 240,
          height: 80,
        },
      }}
      body={{
        kind: "form",
        form: {
          kind: "login",
          content: { items },
          submit: loginMethod === "account" ? { onSubmit: () => void handleSubmit() } : undefined,
          actions: loginMethod === "wecom-desktop" || loginMethod === "wecom-mobile-help"
            ? [{
              key: "account",
              action: "open",
              label: wecomLoading ? "正在连接企业微信..." : "返回账号登录",
              disabled: wecomLoading,
              onClick: () => {
                setError("");
                setLoginMethod("account");
              },
            }]
            : [
              { key: "login", action: "submit", label: loading ? "登录中..." : "登录", disabled: loading },
              {
                key: "wecom",
                action: "open",
                label: "使用企业微信登录",
                disabled: loading,
                onClick: handleWecomLogin,
              },
            ],
        },
      }}
    />
  );
}
