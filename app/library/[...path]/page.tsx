import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import AppShell from "@/app/components/AppShell";
import { readdir, stat } from "fs/promises";
import path from "path";
import Link from "next/link";

const LIBRARY_ROOT = "/Users/koito/Desktop/FH/资料库";

interface Entry { name: string; isDir: boolean; size?: number }

async function scanDir(dirPath: string): Promise<Entry[]> {
  const entries: Entry[] = [];
  try {
    const items = await readdir(dirPath, { withFileTypes: true });
    for (const item of items) {
      if (item.name.startsWith(".")) continue;
      const full = path.join(dirPath, item.name);
      if (item.isDirectory()) {
        entries.push({ name: item.name, isDir: true });
      } else {
        const s = await stat(full);
        entries.push({ name: item.name, isDir: false, size: s.size });
      }
    }
  } catch { return []; }
  return entries.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.name.localeCompare(b.name, "zh");
  });
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function LibrarySubPage({ params }: { params: Promise<{ path: string[] }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { path: segments } = await params;
  const displayName = segments[segments.length - 1] || "资料库";
  const dirPath = path.join(LIBRARY_ROOT, ...segments);
  const entries = await scanDir(dirPath);

  const breadcrumbs: { label: string; href: string }[] = [{ label: "资料库", href: "/library" }];
  let acc = "";
  for (const seg of segments) {
    acc += "/" + encodeURIComponent(seg);
    breadcrumbs.push({ label: seg, href: `/library${acc}` });
  }
  const backHref = breadcrumbs.length > 1 ? breadcrumbs[breadcrumbs.length - 2].href : "/library";
  const filePrefix = `/api/library/${segments.map(encodeURIComponent).join("/")}/`;

  return (
    <AppShell title={displayName} backHref={backHref} user={user}>
      <main className="mx-auto max-w-5xl px-4 py-8">
        {/* Breadcrumb */}
        <div className="mb-4 flex items-center gap-1 text-sm text-gray-500">
          {breadcrumbs.map((b, i) => (
            <span key={i}>
              {i > 0 && <span className="mx-1">/</span>}
              {i < breadcrumbs.length - 1 ? (
                <Link href={b.href} className="hover:text-emerald-600">{b.label}</Link>
              ) : (
                <span className="text-gray-700">{b.label}</span>
              )}
            </span>
          ))}
        </div>

        <h1 className="mb-6 text-2xl font-bold text-gray-800">{displayName}</h1>

        {entries.length === 0 ? (
          <div className="rounded-lg bg-white py-16 text-center shadow-sm"><p className="text-gray-500">此目录为空</p></div>
        ) : (
          <div className="rounded-lg bg-white p-4 shadow-sm">
            <div className="divide-y">
              {entries.map((entry) => (
                <Link
                  key={entry.name}
                  href={entry.isDir ? `/library/${segments.map(encodeURIComponent).join("/")}/${encodeURIComponent(entry.name)}` : `${filePrefix}${encodeURIComponent(entry.name)}`}
                  className="flex items-center gap-3 px-3 py-2.5 transition hover:bg-gray-50 rounded"
                >
                  <span className="shrink-0 text-sm text-gray-400">{entry.isDir ? "▸" : ""}</span>
                  <span className="flex-1 truncate text-sm text-gray-800">{entry.name}</span>
                  {!entry.isDir && entry.size !== undefined && (
                    <span className="shrink-0 text-xs text-gray-400">{formatSize(entry.size)}</span>
                  )}
                  {entry.isDir && <span className="shrink-0 text-xs text-gray-400">→</span>}
                </Link>
              ))}
            </div>
          </div>
        )}
      </main>
    </AppShell>
  );
}
