"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { workspacePath } from "@workspace/core/routing";
import { createBlockSurfaceBlock, createMessageBlock, createPanelBlock, PageSurface } from "@workspace/core/ui";
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "/workspace";
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
    const res = await fetch(`${BASE_PATH}/api/auth/dev-login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      credentials: "include",
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
    setLoading(false);
  }
  function handleWecomLogin() {
    const url = new URL(`${BASE_PATH}/api/auth/wecom/start`, window.location.origin);
    const next = getSafeNextPath();
    if (next !== `${BASE_PATH}/portal`) url.searchParams.set("next", next);
    window.location.assign(url.toString());
  }
  return <PageSurface
      kind="settings"
      header={{ hidden: true }}
      className="flex min-h-screen w-full items-center justify-center bg-gray-50"
      blocks={[createPanelBlock("login", {
        className: "w-full max-w-xl",
        bodyClassName: "space-y-4 p-10",
        blocks: [
          createBlockSurfaceBlock("logo", {
            kind: "message",
            className: "border-0 bg-transparent p-0 text-inherit",
            content: (
              <>
                <div className="flex justify-center">
                  <Image src={workspacePath("/company/logo.png")} alt={process.env.NEXT_PUBLIC_COMPANY_NAME || "公司"} width={240} height={80} className="h-auto w-auto max-w-[240px] object-contain" />
                </div>
                <div className="mt-4 text-center text-2xl font-bold text-gray-800">
                  {process.env.NEXT_PUBLIC_APP_NAME || "工作台"}
                </div>
              </>
            )
          }),
          ...(kickedAlert ? [createMessageBlock("kicked-alert", {
            tone: "warning" as const,
            content: "您已在其他设备登录，当前会话已失效。如需继续，请重新登录。",
          })] : []),
          {
            kind: "form",
            key: "login-form",
            surface: {
              kind: "login",
              className: "mt-2 w-full",
              bodyClassName: "gap-5",
              onSubmit: handleSubmit,
              fields: [
                {
                  key: "username",
                  label: "账号",
                  spec: { valueType: "string", control: "text", state: "required", validation: { required: true } },
                  value: username,
                  onChange: (value) => setUsername(String(value ?? "")),
                  placeholder: "请输入账号",
                },
                {
                  key: "password",
                  label: "密码",
                  spec: { valueType: "string", control: "text", state: "required", validation: { required: true } },
                  type: "password",
                  value: password,
                  onChange: (value) => setPassword(String(value ?? "")),
                  placeholder: "请输入密码",
                },
                ...(error ? [{
                  kind: "note" as const,
                  key: "error",
                  content: <div className="rounded-md border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>,
                }] : []),
              ],
              actions: [{ key: "login", type: "submit", label: loading ? "登录中..." : "登录", variant: "primary", disabled: loading, className: "w-full justify-center" }],
            },
          },
          createBlockSurfaceBlock("login-divider", {
            kind: "message",
            className: "border-0 bg-transparent p-0 text-inherit",
            content: (
              <div className="my-5 flex items-center gap-3 text-xs text-gray-400">
                <span className="h-px flex-1 bg-gray-200" />
                <span>或</span>
                <span className="h-px flex-1 bg-gray-200" />
              </div>
            )
          }),
          {
            kind: "form",
            key: "wecom-login",
            surface: {
              kind: "inline",
              actions: [{ key: "wecom", label: "企业微信登录", onClick: handleWecomLogin, className: "w-full justify-center border-emerald-200 text-emerald-700 hover:bg-emerald-50" }],
            },
          },
        ],
      })]}
    />;
}
