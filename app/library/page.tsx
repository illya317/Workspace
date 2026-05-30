import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import AppShell from "@/app/components/AppShell";
import { readdir, stat } from "fs/promises";
import path from "path";
import LibraryClient from "./LibraryClient";

const ROOT = process.env.LIBRARY_ROOT || "/Users/koito/Desktop/FH/资料库";

interface TreeNode {
  name: string;
  path: string;
  isDir: boolean;
  size?: number;
  children?: TreeNode[];
}

async function buildTree(dirPath: string, urlPath: string): Promise<TreeNode[]> {
  const nodes: TreeNode[] = [];
  try {
    const items = await readdir(dirPath, { withFileTypes: true });
    for (const item of items) {
      if (item.name.startsWith(".")) continue;
      const full = path.join(dirPath, item.name);
      const url = `${urlPath}/${encodeURIComponent(item.name)}`;
      if (item.isDirectory()) {
        nodes.push({
          name: item.name, path: url, isDir: true,
          children: await buildTree(full, url),
        });
      } else {
        const s = await stat(full);
        nodes.push({ name: item.name, path: url, isDir: false, size: s.size });
      }
    }
  } catch {}
  return nodes.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.name.localeCompare(b.name, "zh");
  });
}

export default async function LibraryPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const tree = await buildTree(ROOT, "/library");

  return (
    <AppShell title="资料库" backHref="/portal" user={user}>
      <LibraryClient tree={tree} />
    </AppShell>
  );
}
