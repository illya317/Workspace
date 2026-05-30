"use client";

import { useState, useMemo } from "react";
import Link from "next/link";

interface TreeNode {
  name: string; path: string; isDir: boolean; size?: number; children?: TreeNode[];
}

function fmtSize(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function SidebarNode({ node, depth, currentPath, onNav }: {
  node: TreeNode; depth: number; currentPath: string; onNav: (path: string) => void;
}) {
  const [open, setOpen] = useState(depth < 2);
  const hasChildren = node.children && node.children.some(c => c.isDir);
  const isActive = currentPath === node.path || currentPath.startsWith(node.path + "/");

  return (
    <div>
      <button
        onClick={() => { onNav(node.path); if (hasChildren) setOpen(!open); }}
        className={`w-full text-left flex items-center gap-1.5 rounded px-2 py-1.5 text-sm transition hover:bg-gray-100 ${
          isActive ? "bg-emerald-50 text-emerald-700 font-medium" : "text-gray-700"
        }`}
        style={{ paddingLeft: `${12 + depth * 16}px` }}
      >
        {hasChildren && <span className="shrink-0 text-xs text-gray-400 w-3">{open ? "▼" : "▶"}</span>}
        {!hasChildren && <span className="shrink-0 w-3" />}
        <span className="truncate">{node.name}</span>
      </button>
      {open && hasChildren && node.children!.filter(c => c.isDir).map(c => (
        <SidebarNode key={c.path} node={c} depth={depth + 1} currentPath={currentPath} onNav={onNav} />
      ))}
    </div>
  );
}

export default function LibraryClient({ tree }: { tree: TreeNode[] }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [currentPath, setCurrentPath] = useState("/library");

  function findNode(path: string, nodes: TreeNode[]): TreeNode | undefined {
    for (const n of nodes) {
      if (n.path === path) return n;
      if (n.children) { const f = findNode(path, n.children); if (f) return f; }
    }
  }

  const rootNode: TreeNode = { name: "资料库", path: "/library", isDir: true, children: tree };
  const currentDir = useMemo(
    () => currentPath === "/library" ? rootNode : findNode(currentPath, tree),
    [currentPath, tree]
  );

  const breadcrumbs = useMemo(() => {
    const parts: { label: string; path: string }[] = [{ label: "资料库", path: "/library" }];
    if (currentPath === "/library") return parts;
    const segs = currentPath.replace("/library/", "").split("/");
    let acc = "/library";
    for (const s of segs) {
      acc += "/" + s;
      parts.push({ label: decodeURIComponent(s), path: acc });
    }
    return parts;
  }, [currentPath]);

  return (
    <div className="flex h-[calc(100vh-48px)]">
      {/* Sidebar */}
      <div className={`${sidebarOpen ? "w-64" : "w-0"} shrink-0 overflow-hidden border-r bg-white transition-all`}>
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-xs font-medium text-gray-500">目录</span>
          <button onClick={() => setSidebarOpen(false)} className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
        </div>
        <div className="overflow-y-auto py-2" style={{ height: "calc(100% - 40px)" }}>
          {tree.filter(n => n.isDir).map(n => (
            <SidebarNode key={n.path} node={n} depth={0} currentPath={currentPath} onNav={setCurrentPath} />
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="relative flex-1 overflow-y-auto">
        {!sidebarOpen && (
          <button onClick={() => setSidebarOpen(true)}
            className="fixed left-0 top-1/2 z-40 -translate-y-1/2 rounded-r bg-white px-2 py-4 shadow-md text-gray-500 hover:text-gray-700"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </button>
        )}

        <main className="mx-auto max-w-4xl px-6 py-8">
          <div className="mb-2 flex items-center gap-1 text-sm text-gray-500">
            {breadcrumbs.map((c, i) => (
              <span key={i}>
                {i > 0 && <span className="mx-1">/</span>}
                {i < breadcrumbs.length - 1
                  ? <Link href={c.path} onClick={() => setCurrentPath(c.path)} className="hover:text-emerald-600">{c.label}</Link>
                  : <span className="text-gray-700 font-medium">{c.label}</span>}
              </span>
            ))}
          </div>

          <h1 className="mb-6 text-2xl font-bold text-gray-800">{breadcrumbs[breadcrumbs.length - 1].label}</h1>

          {currentDir?.children && currentDir.children.length > 0 ? (
            <div className="rounded-lg bg-white p-4 shadow-sm">
              <div className="space-y-0.5">
                {currentDir.children.map(e => (
                  <Link key={e.path}
                    href={e.isDir ? e.path : `/api/library${e.path.slice(8)}`}
                    onClick={() => { if (e.isDir) setCurrentPath(e.path); }}
                    className="flex items-center gap-2 rounded px-3 py-2.5 text-sm text-gray-800 transition hover:bg-gray-50"
                  >
                    <span className="text-xs text-gray-400">{e.isDir ? "▸" : ""}</span>
                    <span className="flex-1 truncate">{e.name}</span>
                    {!e.isDir && e.size != null && <span className="shrink-0 text-xs text-gray-400">{fmtSize(e.size)}</span>}
                    {e.isDir && <span className="shrink-0 text-xs text-gray-400">→</span>}
                  </Link>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-lg bg-white py-16 text-center shadow-sm"><p className="text-gray-500">此目录为空</p></div>
          )}
        </main>
      </div>
    </div>
  );
}
