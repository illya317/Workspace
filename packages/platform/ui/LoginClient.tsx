"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { workspacePath } from "@workspace/core/routing";
import { createBlockSurfaceSection, createPageBody, PageSurface } from "@workspace/core/ui";
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
  const loginContent = (
    <div className="mx-auto w-full max-w-[480px] rounded-lg border border-slate-200 bg-white px-8 py-8 shadow-sm">
      <div className="mx-auto w-full max-w-[360px]">
        <div className="mb-6 text-center">
          <Image
            src={workspacePath("/company/logo.png")}
            alt={process.env.NEXT_PUBLIC_COMPANY_NAME || "公司"}
            width={240}
            height={80}
            priority
            className="mx-auto h-auto w-auto max-w-[240px] object-contain"
          />
          <h1 className="mt-4 text-2xl font-bold text-slate-900">{process.env.NEXT_PUBLIC_APP_NAME || "工作台"}</h1>
        </div>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void handleSubmit();
          }}
        >
          {kickedAlert ? (
            <div className="rounded-md border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              您已在其他设备登录，当前会话已失效。如需继续，请重新登录。
            </div>
          ) : null}
          {error ? (
            <div className="rounded-md border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
          ) : null}
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="请输入账号"
            autoComplete="username"
            className="h-12 w-full rounded-md border border-slate-200 bg-white px-4 text-base text-slate-900 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
          />
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="请输入密码"
            type="password"
            autoComplete="current-password"
            className="h-12 w-full rounded-md border border-slate-200 bg-white px-4 text-base text-slate-900 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
          />
          <button
            type="submit"
            disabled={loading}
            className="h-12 w-full rounded-md bg-emerald-600 px-5 text-base font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {loading ? "登录中..." : "登录"}
          </button>
        </form>

        <div className="my-5 flex items-center gap-4 text-slate-400">
          <span className="h-px flex-1 bg-slate-200" />
          <span className="text-base">或</span>
          <span className="h-px flex-1 bg-slate-200" />
        </div>

        <button
          type="button"
          onClick={handleWecomLogin}
          className="h-12 w-full rounded-md bg-emerald-600 px-5 text-base font-semibold text-white shadow-sm transition hover:bg-emerald-700"
        >
          企业微信登录
        </button>
      </div>
    </div>
  );

  return (
    <PageSurface
      kind="login"
      body={createPageBody([
        createBlockSurfaceSection("login-content", { kind: "content", content: loginContent }),
        {
          kind: "form",
          key: "login-contract",
          surface: { kind: "login", fields: [], onSubmit: handleSubmit },
        },
      ])}
    />
  );
}
