"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import NavLink from "@/app/components/NavLink";
import UserMenu from "@/app/components/UserMenu";
import { SessionUser } from '@/lib/types';
// 搜索用原生 input，不引入 SearchBox（该组件需配合 useSearch hook）

interface PositionDesc {
  id: number;
  code: string;
  name: string;
  departmentName: string | null;
  reportTo: string | null;
  positionPurpose: string | null;
  version: string | null;
  effectiveDate: string | null;
}

export default function GmpPositionsPage() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [positions, setPositions] = useState<PositionDesc[]>([]);
  const [search, setSearch] = useState(() => {
    if (typeof window !== "undefined") {
      return new URLSearchParams(window.location.search).get("search") || "";
    }
    return "";
  });

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => {
        if (!r.ok) throw new Error("not auth");
        return r.json();
      })
      .then((data) => {
        setUser(data.user);
        setLoading(false);
      })
      .catch(() => router.push("/login"));
  }, [router]);

  useEffect(() => {
    if (!loading) {
      fetchPositions();
    }
  }, [loading, search]);

  async function fetchPositions() {
    const params = new URLSearchParams();
    params.set("group", "GMP");
    if (search) params.set("search", search);

    const res = await fetch(`/api/position-descriptions?${params.toString()}`);
    if (res.ok) {
      const data = await res.json();
      setPositions(data.positionDescriptions || []);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">加载中...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <Image
              src="/company/logo.png"
              alt={process.env.NEXT_PUBLIC_COMPANY_NAME || "公司"}
              width={100}
              height={30}
              className="h-auto w-auto max-w-[100px] object-contain"
            />
            <span className="text-sm text-gray-400">|</span>
            <span className="text-sm font-medium text-gray-600">文档中心</span>
          </div>
          <div className="flex items-center gap-5">
            <button
              onClick={() => router.push("/portal")}
              className="text-sm text-gray-500 hover:text-emerald-600"
            >
              返回入口
            </button>
            <NavLink href="/reports">工作汇报</NavLink>
            <NavLink href="/works">工作清单</NavLink>
            <NavLink href="/history">历史记录</NavLink>
            <UserMenu user={user} />
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-5xl px-4 py-8">
        {/* 面包屑 */}
        <div className="mb-4 flex items-center gap-2 text-sm text-gray-500">
          <button
            onClick={() => router.push("/docs")}
            className="hover:text-emerald-600"
          >
            文档中心
          </button>
          <span>/</span>
          <span className="text-gray-700">GMP 岗位说明书</span>
        </div>

        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">GMP 岗位说明书</h1>
            <p className="mt-1 text-sm text-gray-500">
              共 {positions.length} 个岗位
            </p>
          </div>
          <div className="w-full sm:w-72">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索岗位编号、名称、部门..."
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none"
            />
          </div>
        </div>

        {positions.length === 0 ? (
          <div className="rounded-lg bg-white py-16 text-center shadow-sm">
            <p className="text-gray-500">未找到匹配的岗位说明书</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {positions.map((pos) => (
              <button
                key={pos.id}
                onClick={() => router.push(`/docs/positions/GMP/${pos.code}`)}
                className="flex items-start gap-4 rounded-lg bg-white p-5 text-left shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-sm font-bold text-emerald-700">
                  {pos.code}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-semibold text-gray-800">
                      {pos.name}
                    </h3>
                    {pos.version && (
                      <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                        v{pos.version}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500">
                    {pos.departmentName && (
                      <span>部门：{pos.departmentName}</span>
                    )}
                    {pos.reportTo && (
                      <span>上级：{pos.reportTo}</span>
                    )}
                    {pos.effectiveDate && (
                      <span>生效：{pos.effectiveDate}</span>
                    )}
                  </div>
                  {pos.positionPurpose && (
                    <p className="mt-2 line-clamp-1 text-sm text-gray-400">
                      {pos.positionPurpose}
                    </p>
                  )}
                </div>
                <div className="shrink-0 self-center text-gray-400">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                </div>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
