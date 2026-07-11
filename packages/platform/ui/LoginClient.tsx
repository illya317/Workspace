"use client";

import { useEffect, useState } from "react";
import { workspacePath } from "@workspace/core/routing";
import { PageSurface, type FormSurfaceItemSpec } from "@workspace/core/ui";
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "/workspace";
const LOGIN_TIMEOUT_MS = 20000;
function getSafeNextPath() {
  const next = new URLSearchParams(window.location.search).get("next");
  if (next && next.startsWith(`${BASE_PATH}/`) && !next.startsWith("//")) return next;
  return `${BASE_PATH}/portal`;
}
export default function LoginClient() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
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
    if (kickedParam || wecomError) {
      window.history.replaceState({}, "", window.location.pathname);
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
    const url = new URL(`${BASE_PATH}/api/auth/wecom/start`, window.location.origin);
    const next = getSafeNextPath();
    if (next !== `${BASE_PATH}/portal`) url.searchParams.set("next", next);
    window.location.assign(url.toString());
  }
  const items: FormSurfaceItemSpec[] = [
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
          submit: { onSubmit: () => void handleSubmit() },
          actions: [
            { key: "login", action: "submit", label: loading ? "登录中..." : "登录", disabled: loading },
            { key: "wecom", action: "open", label: "企业微信登录", disabled: loading, onClick: handleWecomLogin },
          ],
        },
      }}
    />
  );
}
