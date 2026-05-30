import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import AppShell from "@/app/components/AppShell";
import { readdir, stat } from "fs/promises";
import path from "path";
import Link from "next/link";

const ROOT = "/Users/koito/Desktop/FH/资料库";

interface Entry { name: string; isDir: boolean; size?: number }

async function scanDir(dirPath: string): Promise<Entry[]> {
  const entries: Entry[] = [];
  try {
    const items = await readdir(dirPath, { withFileTypes: true });
    for (const item of items) {
      if (item.name.startsWith(".")) continue;
      if (item.isDirectory()) {
        entries.push({ name: item.name, isDir: true });
      } else {
        const s = await stat(path.join(dirPath, item.name));
        entries.push({ name: item.name, isDir: false, size: s.size });
      }
    }
  } catch { return []; }
  return entries.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.name.localeCompare(b.name, "zh");
  });
}

function fmtSize(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function LibrarySubPage({ params }: { params: Promise<{ path: string[] }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { path: raw } = await params;
  const segments = raw.map(s => { try { return decodeURIComponent(s) } catch { return s } });
  const dirPath = path.join(ROOT, ...segments);
  const entries = await scanDir(dirPath);
  const currentName = segments[segments.length - 1] || "资料库";

  // Build breadcrumbs
  const crumbs: { label: string; href: string }[] = [{ label: "资料库", href: "/library" }];
  let acc = "";
  for (let i = 0; i < segments.length; i++) {
    const enc = encodeURIComponent(segments[i]);
    acc += "/" + enc;
    crumbs.push({ label: segments[i], href: `/library${acc}` });
  }

  return (
    <AppShell title={currentName} backHref={crumbs.length > 1 ? crumbs[crumbs.length - 2].href : "/library"} user={user}>
      <main className="mx-auto max-w-5xl px-4 py-8">
        {/* Breadcrumb */}
        <div className="mb-4 flex items-center gap-1 text-sm text-gray-500">
          {crumbs.map((c, i) => (
            <span key={i}>
              {i > 0 && <span className="mx-1">/</span>}
              {i < crumbs.length - 1
                ? <Link href={c.href} className="hover:text-emerald-600">{c.label}</Link>
                : <span className="text-gray-700">{c.label}</span>}
            </span>
          ))}
        </div>

        <h1 className="mb-6 text-2xl font-bold text-gray-800">{currentName}</h1>

        {entries.length === 0 ? (
          <div className="rounded-lg bg-white py-16 text-center shadow-sm"><p className="text-gray-500">此目录为空</p></div>
        ) : (
          <div className="rounded-lg bg-white p-4 shadow-sm">
            <div className="space-y-0.5">
              {entries.map(e => (
                <Link key={e.name}
                  href={e.isDir
                    ? `/library/${segments.map(s => encodeURIComponent(s)).join("/")}/${encodeURIComponent(e.name)}`
                    : `/api/library/${segments.map(s => encodeURIComponent(s)).join("/")}/${encodeURIComponent(e.name)}`}
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
        )}
      </main>
    </AppShell>
  );
}
