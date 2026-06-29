"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { workspacePath } from "@workspace/core/routing";
import { LoginSurface } from "@workspace/core/ui";
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
  return (
    <LoginSurface
      logo={(
        <Image
          src={workspacePath("/company/logo.png")}
          alt={process.env.NEXT_PUBLIC_COMPANY_NAME || "公司"}
          width={240}
          height={80}
          priority
          className="mx-auto h-auto w-auto max-w-[240px] object-contain"
        />
      )}
      title={process.env.NEXT_PUBLIC_APP_NAME || "工作台"}
      username={username}
      password={password}
      loading={loading}
      kickedAlert={kickedAlert ? "您已在其他设备登录，当前会话已失效。如需继续，请重新登录。" : undefined}
      error={error || undefined}
      onUsernameChange={setUsername}
      onPasswordChange={setPassword}
      onSubmit={() => void handleSubmit()}
      onExternalLogin={handleWecomLogin}
    />
  );
}
