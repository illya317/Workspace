"use client";

import type { FormEvent, ReactNode } from "react";

export interface LoginSurfaceProps {
  logo?: ReactNode;
  title: ReactNode;
  username: string;
  password: string;
  loading?: boolean;
  kickedAlert?: ReactNode;
  error?: ReactNode;
  onUsernameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: () => void;
  onExternalLogin?: () => void;
  externalLoginLabel?: ReactNode;
}

export default function LoginSurface({
  logo,
  title,
  username,
  password,
  loading = false,
  kickedAlert,
  error,
  onUsernameChange,
  onPasswordChange,
  onSubmit,
  onExternalLogin,
  externalLoginLabel = "企业微信登录",
}: LoginSurfaceProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit();
  }

  return (
    <main className="grid min-h-screen place-items-center px-4 py-6">
      <div className="mx-auto w-full max-w-[480px] rounded-lg border border-slate-200 bg-white px-8 py-8 shadow-sm">
        <div className="mx-auto w-full max-w-[360px]">
          <div className="mb-6 text-center">
            {logo}
            <h1 className="mt-4 text-2xl font-bold text-slate-900">{title}</h1>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            {kickedAlert ? (
              <div className="rounded-md border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                {kickedAlert}
              </div>
            ) : null}
            {error ? (
              <div className="rounded-md border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
            ) : null}
            <input
              value={username}
              onChange={(event) => onUsernameChange(event.target.value)}
              placeholder="请输入账号"
              autoComplete="username"
              className="h-12 w-full rounded-md border border-slate-200 bg-white px-4 text-base text-slate-900 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            />
            <input
              value={password}
              onChange={(event) => onPasswordChange(event.target.value)}
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

          {onExternalLogin ? (
            <>
              <div className="my-5 flex items-center gap-4 text-slate-400">
                <span className="h-px flex-1 bg-slate-200" />
                <span className="text-base">或</span>
                <span className="h-px flex-1 bg-slate-200" />
              </div>

              <button
                type="button"
                onClick={onExternalLogin}
                className="h-12 w-full rounded-md bg-emerald-600 px-5 text-base font-semibold text-white shadow-sm transition hover:bg-emerald-700"
              >
                {externalLoginLabel}
              </button>
            </>
          ) : null}
        </div>
      </div>
    </main>
  );
}
