"use client";

import { useEffect, useState, type FormEvent } from "react";
import Image from "next/image";
import { workspacePath } from "@workspace/core/routing";
import { ActionButton, EmptyStateCard, FormField, FormShell, PanelCard, TextField } from "@workspace/core/ui";

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
    const kickedCookie = document.cookie.split("; ").find((row) => row.startsWith("kicked="));
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

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch(`${BASE_PATH}/api/auth/dev-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ username, password }),
    });

    if (res.ok) {
      window.location.href = getSafeNextPath();
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
    window.location.href = url.toString();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50">
      <PanelCard bodyClassName="p-8" className="w-full max-w-md">
        <div className="mb-4 flex justify-center">
          <Image src={workspacePath("/company/logo.png")} alt={process.env.NEXT_PUBLIC_COMPANY_NAME || "公司"} width={240} height={80} className="h-auto w-auto max-w-[240px] object-contain" />
        </div>
        <div className="mb-6 text-center text-2xl font-bold text-gray-800">
          {process.env.NEXT_PUBLIC_APP_NAME || "工作台"}
        </div>
        {kickedAlert && (
          <PanelCard bodyClassName="p-3 text-sm text-amber-800" className="mb-4 border-amber-200 bg-amber-50">
            您已在其他设备登录，当前会话已失效。如需继续，请重新登录。
          </PanelCard>
        )}
        <FormShell onSubmit={handleSubmit} className="mt-6">
            <FormField label="账号">
              <TextField value={username} onChange={setUsername} required placeholder="请输入账号" />
            </FormField>

            <FormField label="密码">
              <TextField type="password" value={password} onChange={setPassword} required placeholder="请输入密码" />
            </FormField>

            {error && <EmptyStateCard compact className="border-red-100 bg-red-50 text-red-600">{error}</EmptyStateCard>}

            <ActionButton type="submit" disabled={loading} variant="primary" className="w-full justify-center">
              {loading ? "登录中..." : "登录"}
            </ActionButton>
        </FormShell>
        <div className="my-5 flex items-center gap-3 text-xs text-gray-400">
          <span className="h-px flex-1 bg-gray-200" />
          <span>或</span>
          <span className="h-px flex-1 bg-gray-200" />
        </div>
        <ActionButton onClick={handleWecomLogin} className="w-full justify-center border-emerald-200 text-emerald-700 hover:bg-emerald-50">
          企业微信登录
        </ActionButton>
      </PanelCard>
    </main>
  );
}
