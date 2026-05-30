"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import NavLink from "@/app/components/NavLink";
import UserMenu from "@/app/components/UserMenu";
import { SessionUser } from "@/lib/types";
import UsernameModal from "./UsernameModal";
import PasswordModal from "./PasswordModal";

export default function SettingsClient({ user: initialUser, hideShell }: { user: SessionUser; hideShell?: boolean }) {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser>(initialUser);

  const [showUsernameModal, setShowUsernameModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);

  const handleUsernameSuccess = useCallback(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => { if (d.user) setUser(d.user); })
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      {!hideShell && (
      <nav className="bg-white shadow-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <Image src="/company/logo.png" alt={process.env.NEXT_PUBLIC_COMPANY_NAME || "公司"} width={100} height={30} className="h-auto w-auto max-w-[100px] object-contain" />
          </div>
          <div className="flex items-center gap-5">
            <button onClick={() => router.push("/portal")} className="text-sm text-gray-500 hover:text-emerald-600">返回入口</button>
            <NavLink href="/reports">工作汇报</NavLink>
            <NavLink href="/works">工作清单</NavLink>
            <NavLink href="/history">历史记录</NavLink>
            <UserMenu user={user} />
          </div>
        </div>
      </nav>
      )}

      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="mb-8 text-3xl font-bold text-gray-800">设置</h1>

        <div className="space-y-6">
          <div className="rounded-xl bg-white px-8 py-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-800">修改账号</h2>
                <p className="mt-1 text-sm text-gray-500">
                  当前用户名：<span className="text-gray-700">{user.username || "(未设置)"}</span>
                </p>
              </div>
              <button
                onClick={() => setShowUsernameModal(true)}
                className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
              >
                修改
              </button>
            </div>
          </div>

          <div className="rounded-xl bg-white px-8 py-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-800">修改密码</h2>
                <p className="mt-1 text-sm text-gray-500">定期更换密码可提高账号安全性</p>
              </div>
              <button
                onClick={() => setShowPasswordModal(true)}
                className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
              >
                修改
              </button>
            </div>
          </div>

          <div className="rounded-xl bg-white px-8 py-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-800">API 接入</h2>
                <p className="mt-1 text-sm text-gray-500">
                  机器人或外部系统可通过 API 接入，与网页版权限一致。
                </p>
              </div>
              <Link href="/api-guide" className="shrink-0 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-700">
                查看 API 接入指南
              </Link>
            </div>
          </div>

          {user.canAccessAdmin && (
            <div className="rounded-xl bg-white px-8 py-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-gray-800">管理员</h2>
                  <p className="mt-1 text-sm text-gray-500">系统管理与权限配置</p>
                </div>
                <Link href="/admin" className="shrink-0 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-700">
                  进入管理后台
                </Link>
              </div>
            </div>
          )}
        </div>
      </main>

      <UsernameModal open={showUsernameModal} onClose={() => setShowUsernameModal(false)} user={user} onSuccess={handleUsernameSuccess} />
      <PasswordModal open={showPasswordModal} onClose={() => setShowPasswordModal(false)} />
    </div>
  );
}
