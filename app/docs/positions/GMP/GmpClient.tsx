"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import UserMenu from "@/app/components/UserMenu";
import { SessionUser } from '@/lib/types';

interface TreeNode {
  code: string; name: string; level: number;
  parentCode: string | null;
  positions: string[];
  ownPositions?: string[];
  children?: TreeNode[];
}

export default function GmpPositionsPage({ hideShell }: { hideShell?: boolean }) {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState(() => {
    if (typeof window !== "undefined") return new URLSearchParams(window.location.search).get("search") || "";
    return "";
  });

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.ok ? r.json() : Promise.reject()).then(d => setUser(d.user)).catch(() => router.push("/login"));
  }, [router]);

  useEffect(() => {
    fetch("/api/position-descriptions?tree=1")
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => {
        const allNodes = data.tree as TreeNode[];
        // Build tree: attach children under their parent
        for (const n of allNodes) {
          if (n.parentCode) {
            const parent = allNodes.find(p => p.code === n.parentCode);
            if (parent) {
              if (!parent.children) parent.children = [];
              parent.children.push(n);
            }
          }
        }
        // Sort children by code within each parent
        for (const n of allNodes) {
          if (n.children) n.children.sort((a, b) => a.code.localeCompare(b.code));
        }
        // Roots = no parentCode
        const roots = allNodes.filter(n => !n.parentCode);
        roots.sort((a, b) => a.code.localeCompare(b.code));
        // Auto-expand roots
        setExpanded(new Set(roots.map(r => r.code)));
        setTree(roots);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  function toggle(code: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code); else next.add(code);
      return next;
    });
  }

  function renderNode(node: TreeNode, depth: number): React.ReactNode {
    const isOpen = expanded.has(node.code);
    const hasChildren = node.children && node.children.length > 0;
    const totalPositions = node.positions.length;
    const ownPositions: string[] = node.ownPositions || [];
    const showPositions = isOpen && totalPositions > 0;

    const indent = { 0: "ml-0", 1: "ml-6", 2: "ml-12", 3: "ml-16" }[depth] || "ml-16";
    const textSize = { 0: "text-base font-bold", 1: "text-sm font-semibold", 2: "text-sm", 3: "text-xs" }[depth] || "text-xs";
    const bg = { 0: "bg-gray-50", 1: "", 2: "", 3: "" }[depth] || "";

    return (
      <div key={node.code} className={indent}>
        <button onClick={() => toggle(node.code)}
          className={`w-full flex items-center gap-2 px-3 py-2 ${bg} ${textSize} text-gray-800 hover:bg-gray-100 rounded`}
        >
          {(hasChildren || totalPositions > 0) && <span className="text-gray-400 text-xs w-3">{isOpen ? "▼" : "▶"}</span>}
          {!hasChildren && totalPositions === 0 && <span className="w-3" />}
          {node.name}
          <span className="text-gray-400 font-normal text-xs">{totalPositions} 岗</span>
        </button>
        {showPositions && (
          <div className="ml-8 divide-y divide-gray-50 border-l-2 border-gray-100 pl-4">
            {ownPositions
              .filter((p: string) => !search || p.toLowerCase().includes(search.toLowerCase()))
              .sort()
              .map(entry => {
                const [code, name] = entry.split("|");
                return (
                  <button key={code}
                    onClick={() => router.push(`/docs/positions/GMP/${code}`)}
                    className="w-full flex items-center gap-3 py-1.5 text-left hover:bg-emerald-50 transition-colors"
                  >
                    <span className="text-xs text-gray-400 font-mono w-20 shrink-0">{code}</span>
                    <span className="text-sm text-gray-700 flex-1">{name || code}</span>
                    <span className="text-gray-300 text-xs">→</span>
                  </button>
                );
              })}
          </div>
        )}
        {isOpen && hasChildren && node.children!.map(c => renderNode(c, depth + 1))}
      </div>
    );
  }

  if (loading) return <div className="flex min-h-screen items-center justify-center"><p className="text-gray-500">加载中...</p></div>;

  return (
    <div className="min-h-screen bg-gray-50">
      {!hideShell && (
      <nav className="bg-white shadow-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <Image src="/company/logo.png" alt="logo" width={100} height={30} className="h-auto w-auto max-w-[100px] object-contain" />
            <span className="text-sm text-gray-400">|</span><span className="text-sm font-medium text-gray-600">文档中心</span>
          </div>
          <div className="flex items-center gap-5">
            <button onClick={() => router.push("/portal")} className="text-sm text-gray-500 hover:text-emerald-600">返回入口</button>
            <UserMenu user={user} />
          </div>
        </div>
      </nav>
      )}

      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-4 flex items-center gap-2 text-sm text-gray-500">
          <button onClick={() => router.push("/docs")} className="hover:text-emerald-600">文档中心</button>
          <span>/</span><span className="text-gray-700">岗位说明书</span>
        </div>

        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-800">岗位说明书</h1>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="搜索岗位..." className="w-64 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none" />
        </div>

        {tree.length === 0 ? (
          <div className="rounded-lg bg-white py-16 text-center shadow-sm"><p className="text-gray-500">暂无数据</p></div>
        ) : (
          <div className="bg-white rounded-lg shadow-sm p-4 space-y-1">
            {tree.map(n => renderNode(n, 0))}
          </div>
        )}
      </main>
    </div>
  );
}
