"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/auth/dev-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-md rounded-lg bg-white p-8 shadow-md">
        <div className="mb-4 flex justify-center">
          <Image src="/company/logo.png" alt={process.env.NEXT_PUBLIC_COMPANY_NAME || "公司"} width={240} height={80} className="h-auto w-auto max-w-[240px] object-contain" />
        </div>
        <h1 className="mb-6 text-center text-2xl font-bold text-gray-800">
          {process.env.NEXT_PUBLIC_APP_NAME || "工作台"}
        </h1>
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
      </div>
    </div>
  );
}
