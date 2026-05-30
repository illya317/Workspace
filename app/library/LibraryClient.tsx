"use client";

import { useState, useMemo } from "react";

interface TreeNode {
  name: string;
  /** 前端 URL 路径，如 /library/01-财务 */
  urlPath: string;
  isDir: boolean;
  size?: number;
  children?: TreeNode[];
}

function fmtSize(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

/** urlPath → API 文件地址 */
function apiHref(urlPath: string): string {
  // "/library/01-财务/report.pdf" → "/api/library/01-财务/report.pdf"
  return `/api${urlPath}`;
}

/** 在树中按 urlPath 查找节点 */
function findNode(urlPath: string, nodes: TreeNode[]): TreeNode | undefined {
  for (const n of nodes) {
    if (n.urlPath === urlPath) return n;
    if (n.children) {
      const f = findNode(urlPath, n.children);
      if (f) return f;
    }
  }
}

// ─── 侧边栏目录树节点 ──────────────────────────────────────

function SidebarNode({ node, depth, currentPath, onNav }: {
  node: TreeNode; depth: number; currentPath: string; onNav: (path: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const dirChildren = node.children?.filter(c => c.isDir) || [];
  const hasChildren = dirChildren.length > 0;
  const isActive = currentPath === node.urlPath || currentPath.startsWith(node.urlPath + "/");

  const handleClick = () => {
    onNav(node.urlPath);
    if (hasChildren) setOpen(!open);
  };

  return (
    <div>
      <button
        onClick={handleClick}
        className={`w-full text-left flex items-center gap-1.5 rounded px-2 py-1.5 text-sm transition hover:bg-gray-100 ${
          isActive ? "bg-emerald-50 text-emerald-700 font-medium" : "text-gray-700"
        }`}
        style={{ paddingLeft: `${12 + depth * 16}px` }}
      >
        {hasChildren ? (
          <span className="shrink-0 text-xs text-gray-400 w-3">{open ? "▼" : "▶"}</span>
        ) : (
          <span className="shrink-0 w-3" />
        )}
        <span className="truncate">{node.name}</span>
      </button>
      {open && hasChildren && dirChildren.map(c => (
        <SidebarNode key={c.urlPath} node={c} depth={depth + 1} currentPath={currentPath} onNav={onNav} />
      ))}
    </div>
  );
}

// ─── 主组件 ────────────────────────────────────────────────

export default function LibraryClient({ tree, rootLabel }: { tree: TreeNode[]; rootLabel: string }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [currentPath, setCurrentPath] = useState("/library");

  const rootNode: TreeNode = useMemo(
    () => ({ name: rootLabel, urlPath: "/library", isDir: true, children: tree }),
    [rootLabel, tree],
  );
  const currentDir = useMemo(
    () => currentPath === "/library" ? rootNode : findNode(currentPath, tree),
    [currentPath, tree, rootNode],
  );

  const breadcrumbs = useMemo(() => {
    const parts: { label: string; urlPath: string }[] = [{ label: rootLabel, urlPath: "/library" }];
    if (currentPath === "/library") return parts;
    const segs = currentPath.replace("/library/", "").split("/");
    let acc = "/library";
    for (const s of segs) {
      acc += "/" + s;
      parts.push({ label: decodeURIComponent(s), urlPath: acc });
    }
    return parts;
  }, [currentPath, rootLabel]);

  return (
    <div className="flex h-[calc(100vh-48px)]">
      {/* ── 侧边栏：仅目录树 ── */}
      <div className={`${sidebarOpen ? "w-64" : "w-0"} shrink-0 overflow-hidden border-r bg-white transition-all`}>
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-xs font-medium text-gray-500">目录</span>
          <button onClick={() => setSidebarOpen(false)} className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
        </div>
        <div className="overflow-y-auto py-2" style={{ height: "calc(100% - 40px)" }}>
          {tree.filter(n => n.isDir).map(n => (
            <SidebarNode key={n.urlPath} node={n} depth={0} currentPath={currentPath} onNav={setCurrentPath} />
          ))}
        </div>
      </div>

      {/* ── 右侧内容区：当前目录下的文件夹 + 文件 ── */}
      <div className="relative flex-1 overflow-y-auto">
        {/* 侧边栏打开按钮（隐藏时显示） */}
        {!sidebarOpen && (
          <button onClick={() => setSidebarOpen(true)}
            className="fixed left-0 top-1/2 z-40 -translate-y-1/2 rounded-r bg-white px-2 py-4 shadow-md text-gray-500 hover:text-gray-700"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </button>
        )}

        <main className="mx-auto max-w-4xl px-6 py-8">
          {/* 面包屑：点击目录名导航（纯客户端，不走 Link） */}
          <nav className="mb-2 flex items-center gap-1 text-sm text-gray-500">
            {breadcrumbs.map((c, i) => (
              <span key={i}>
                {i > 0 && <span className="mx-1">/</span>}
                {i < breadcrumbs.length - 1 ? (
                  <button onClick={() => setCurrentPath(c.urlPath)} className="hover:text-emerald-600">
                    {c.label}
                  </button>
                ) : (
                  <span className="text-gray-700 font-medium">{c.label}</span>
                )}
              </span>
            ))}
          </nav>

          <h1 className="mb-6 text-2xl font-bold text-gray-800">{breadcrumbs[breadcrumbs.length - 1].label}</h1>

          {currentDir?.children && currentDir.children.length > 0 ? (
            <div className="rounded-lg bg-white p-4 shadow-sm">
              <div className="space-y-0.5">
                {currentDir.children.map(e =>
                  e.isDir ? (
                    /* 目录：纯客户端导航，不用 Link */
                    <button
                      key={e.urlPath}
                      onClick={() => setCurrentPath(e.urlPath)}
                      className="flex w-full items-center gap-2 rounded px-3 py-2.5 text-sm text-gray-800 transition hover:bg-gray-50 text-left"
                    >
                      <svg className="h-4 w-4 shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
                      <span className="flex-1 truncate">{e.name}</span>
                      <span className="shrink-0 text-xs text-gray-400">→</span>
                    </button>
                  ) : (
                    /* 文件：API 下载链接 */
                    <a
                      key={e.urlPath}
                      href={apiHref(e.urlPath)}
                      target="_blank" rel="noreferrer"
                      className="flex items-center gap-2 rounded px-3 py-2.5 text-sm text-gray-800 transition hover:bg-gray-50"
                    >
                      <svg className="h-4 w-4 shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                      <span className="flex-1 truncate">{e.name}</span>
                      {e.size != null && <span className="shrink-0 text-xs text-gray-400">{fmtSize(e.size)}</span>}
                    </a>
                  ),
                )}
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
