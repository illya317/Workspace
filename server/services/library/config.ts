/**
 * 资料库（本地文件浏览器）共享配置与服务层。
 *
 * 试验版：一次性递归读取目录树，后续可改为按需懒加载。
 * 适配其他文件夹只需修改 LIBRARY_ROOT 环境变量。
 */
import { readdir, stat } from "fs/promises";
import path from "path";

// ─── 配置 ──────────────────────────────────────────────────

/** 允许访问的根目录列表（未来可扩展为 LIBRARY_ROOTS JSON 数组） */
export function getLibraryRoots(): string[] {
  const env = process.env.LIBRARY_ROOT;
  if (!env) return [];
  return env.split(",").map((p) => p.trim()).filter(Boolean);
}

/** 主根目录 */
export function getDefaultRoot(): string {
  return getLibraryRoots()[0] || "";
}

// ─── 路径安全 ──────────────────────────────────────────────

/**
 * 将用户请求的相对路径解析为安全的绝对路径。
 * 返回 null 表示路径穿越或不在允许的根目录内。
 */
export function safeResolve(relativePath: string, root?: string): string | null {
  const base = root || getDefaultRoot();
  if (!base) return null;

  // 规范化：去除 .. 和多余的 /
  const resolved = path.resolve(base, relativePath);

  // 确保解析后的路径仍在 root 内
  const normalizedRoot = path.resolve(base) + path.sep;
  const normalizedResolved = resolved + (resolved.endsWith(path.sep) ? path.sep : "");

  if (!normalizedResolved.startsWith(normalizedRoot)) return null;
  return resolved;
}

// ─── 目录读取（单层，供按需加载使用）───────────────────────

export interface DirEntry {
  name: string;
  path: string; // 绝对文件系统路径
  isDir: boolean;
  size?: number;
}

/** 读取单个目录的内容（不递归），跳过隐藏文件 */
export async function readDirectory(dirPath: string): Promise<DirEntry[]> {
  const entries: DirEntry[] = [];
  try {
    const items = await readdir(dirPath, { withFileTypes: true });
    for (const item of items) {
      if (item.name.startsWith(".")) continue;
      const full = path.join(dirPath, item.name);
      if (item.isDirectory()) {
        entries.push({ name: item.name, path: full, isDir: true });
      } else {
        try {
          const s = await stat(full);
          entries.push({ name: item.name, path: full, isDir: false, size: s.size });
        } catch {
          entries.push({ name: item.name, path: full, isDir: false });
        }
      }
    }
  } catch {
    // 目录不存在或无权限 → 返回空数组
  }
  return entries.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.name.localeCompare(b.name, "zh");
  });
}

// ─── 树节点（供前端渲染）───────────────────────────────────

export interface TreeNode {
  name: string;
  /** 前端 URL 路径，如 /library/01-财务 */
  urlPath: string;
  isDir: boolean;
  size?: number;
  children?: TreeNode[];
}

/**
 * 递归构建完整目录树（试验版一次性加载）。
 * urlBase 是前端路由前缀，如 "/library"。
 */
export async function buildTree(
  dirPath: string,
  urlBase: string,
): Promise<TreeNode[]> {
  const nodes: TreeNode[] = [];
  const entries = await readDirectory(dirPath);
  for (const entry of entries) {
    const urlPath = `${urlBase}/${encodeURIComponent(entry.name)}`;
    if (entry.isDir) {
      nodes.push({
        name: entry.name,
        urlPath,
        isDir: true,
        children: await buildTree(entry.path, urlPath),
      });
    } else {
      nodes.push({
        name: entry.name,
        urlPath,
        isDir: false,
        size: entry.size,
      });
    }
  }
  return nodes;
}
