"use client";

import { useEffect, useState } from "react";
import { workspacePath } from "@workspace/core/routing";
import { PageSurface, type FormSurfaceItemSpec } from "@workspace/core/ui";
import {
  createMobileWecomLoginPanelItem,
  createWecomHandoffResultPanelItem,
  createWecomLoginPanelItem,
} from "./auth/WecomLoginPanel";
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "/workspace";
const LOGIN_TIMEOUT_MS = 20000;
type LoginMethod = "account" | "wecom-desktop" | "wecom-mobile" | "wecom-result";
function getSafeNextPath() {
  const next = new URLSearchParams(window.location.search).get("next");
  if (next && next.startsWith(`${BASE_PATH}/`) && !next.startsWith("//")) return next;
  return `${BASE_PATH}/portal`;
}

function isMobileBrowser() {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
    || (navigator.maxTouchPoints > 1 && window.innerWidth < 1024);
}

function clearLoginResultParams(searchParams: URLSearchParams) {
  for (const key of [
    "kicked",
    "wecom_error",
    "wecom_handoff",
    "wecom_handoff_error",
    "handoff_return",
    "handoff_code",
    "wecom_return",
  ]) {
    searchParams.delete(key);
  }
  const query = searchParams.toString();
  window.history.replaceState({}, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
}
export default function LoginClient() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [loginMethod, setLoginMethod] = useState<LoginMethod>("account");
  const [wecomLoading, setWecomLoading] = useState(false);
  const [handoffReturnToken, setHandoffReturnToken] = useState("");
  const [handoffVerificationCode, setHandoffVerificationCode] = useState("");
  const [error, setError] = useState("");
  const [kickedAlert, setKickedAlert] = useState(false);
  useEffect(() => {
    const kickedCookie = document.cookie.split("; ").find(row => row.startsWith("kicked="));
    const searchParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.slice(1));
    const kickedParam = searchParams.get("kicked");
    const wecomError = searchParams.get("wecom_error");
    const wecomHandoff = hashParams.get("wecom_handoff");
    const wecomHandoffError = searchParams.get("wecom_handoff_error");
    const callbackReturnToken = hashParams.get("handoff_return");
    const callbackVerificationCode = hashParams.get("handoff_code");
    const browserReturnToken = hashParams.get("wecom_return");
    if (wecomError) setError(wecomError);
    if (wecomHandoff === "complete" && callbackReturnToken && callbackVerificationCode) {
      setLoginMethod("wecom-result");
      setHandoffReturnToken(callbackReturnToken);
      setHandoffVerificationCode(callbackVerificationCode);
    } else if (wecomHandoffError) {
      setLoginMethod("wecom-result");
      setError(wecomHandoffError);
    } else if (browserReturnToken) {
      setLoginMethod("wecom-mobile");
      setHandoffReturnToken(browserReturnToken);
    }
    if (kickedCookie || kickedParam) {
      setKickedAlert(true);
      document.cookie = "kicked=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    }
    if (
      kickedParam
      || wecomError
      || wecomHandoff
      || wecomHandoffError
      || callbackReturnToken
      || callbackVerificationCode
      || browserReturnToken
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
  const items: FormSurfaceItemSpec[] = loginMethod === "wecom-desktop"
    ? [
      ...(error ? [{ kind: "note" as const, key: "wecom-error", content: error }] : []),
      createWecomLoginPanelItem({
        key: "wecom-panel",
        onError: setError,
        onLoadingChange: setWecomLoading,
      }),
    ]
    : loginMethod === "wecom-mobile"
      ? [
        ...(error ? [{ kind: "note" as const, key: "wecom-error", content: error }] : []),
        createMobileWecomLoginPanelItem({
          key: "wecom-mobile-panel",
          onError: setError,
          onLoadingChange: setWecomLoading,
          initialReturnToken: handoffReturnToken || undefined,
        }),
      ]
      : loginMethod === "wecom-result"
        ? [
          ...(error ? [{ kind: "note" as const, key: "wecom-result-error", content: error }] : []),
          ...(handoffReturnToken && handoffVerificationCode
            ? [createWecomHandoffResultPanelItem({
              key: "wecom-result",
              returnToken: handoffReturnToken,
              verificationCode: handoffVerificationCode,
              onError: setError,
            })]
            : [{
              kind: "note" as const,
              key: "wecom-result",
              content: "请返回刚才的手机浏览器重新发起企业微信登录。",
            }]),
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
        title: process.env.NEXT_PUBLIC_APP_NAME || "工作台",
        logo: {
          src: workspacePath("/company/logo.png"),
          alt: process.env.NEXT_PUBLIC_COMPANY_NAME || "公司",
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
          actions: loginMethod === "wecom-result"
            ? undefined
            : loginMethod === "wecom-desktop" || loginMethod === "wecom-mobile"
            ? [{
              key: "account",
              action: "open",
              label: wecomLoading ? "正在连接企业微信..." : "返回账号登录",
              disabled: wecomLoading,
              onClick: () => {
                setError("");
                setHandoffReturnToken("");
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
                onClick: () => {
                  setError("");
                  setLoginMethod(isMobileBrowser() ? "wecom-mobile" : "wecom-desktop");
                },
              },
            ],
        },
      }}
    />
  );
}
