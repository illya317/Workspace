"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "/workspace";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [kickedAlert, setKickedAlert] = useState(false);
  const router = useRouter();

  useEffect(() => {
    // 检查 kicked cookie 或 URL 参数
    const kickedCookie = document.cookie.split("; ").find((row) => row.startsWith("kicked="));
    const searchParams = new URLSearchParams(window.location.search);
    const kickedParam = searchParams.get("kicked");
    const wecomError = searchParams.get("wecom_error");
    if (wecomError) {
      setError(wecomError);
    }
    if (kickedCookie || kickedParam) {
      setKickedAlert(true);
      // 清除 cookie
      document.cookie = "kicked=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
      // 清除 URL 参数
      if (kickedParam || wecomError) {
        const newUrl = window.location.pathname;
        window.history.replaceState({}, "", newUrl);
      }
    } else if (wecomError) {
      const newUrl = window.location.pathname;
      window.history.replaceState({}, "", newUrl);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch(`${BASE_PATH}/api/auth/dev-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ username, password }),
    });

    if (res.ok) {
      router.push("/portal");
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "登录失败");
      setLoading(false);
    }
  };

  const handleWecomLogin = () => {
    window.location.href = `${BASE_PATH}/api/auth/wecom/start`;
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-md rounded-lg bg-white p-8 shadow-md">
        <div className="mb-4 flex justify-center">
          <Image src="/workspace/company/logo.png" alt={process.env.NEXT_PUBLIC_COMPANY_NAME || "公司"} width={240} height={80} className="h-auto w-auto max-w-[240px] object-contain" />
        </div>
        <h1 className="mb-6 text-center text-2xl font-bold text-gray-800">
          {process.env.NEXT_PUBLIC_APP_NAME || "工作台"}
        </h1>
        {kickedAlert && (
          <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            您已在其他设备登录，当前会话已失效。如需继续，请重新登录。
          </div>
        )}
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              账号
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 placeholder:text-gray-500 focus:border-emerald-400 focus:outline-none"
              placeholder="请输入账号"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              密码
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 placeholder:text-gray-500 focus:border-emerald-400 focus:outline-none"
              placeholder="请输入密码"
            />
          </div>

          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-gradient-to-r from-emerald-500 to-emerald-700 py-2 text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "登录中..." : "登录"}
          </button>
        </form>
        <div className="my-5 flex items-center gap-3 text-xs text-gray-400">
          <span className="h-px flex-1 bg-gray-200" />
          <span>或</span>
          <span className="h-px flex-1 bg-gray-200" />
        </div>
        <button
          type="button"
          onClick={handleWecomLogin}
          className="w-full rounded-md border border-emerald-200 bg-white py-2 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-50"
        >
          企业微信登录
        </button>
      </div>
    </div>
  );
}
