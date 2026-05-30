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
  const displayPath = segments.join("/");
  const dirPath = path.join(LIBRARY_ROOT, ...segments);
  const entries = await scanDir(dirPath);

  // Build breadcrumb
  const breadcrumbs: { label: string; href: string }[] = [
    { label: "资料库", href: "/library" },
  ];
  let acc = "";
  for (const seg of segments) {
    acc += "/" + encodeURIComponent(seg);
    breadcrumbs.push({ label: seg, href: `/library${acc}` });
  }

  // File download path prefix
  const filePrefix = `/api/library/${segments.map(encodeURIComponent).join("/")}/`;

  return (
    <AppShell title={segments[segments.length - 1] || "资料库"} backHref={breadcrumbs.length > 1 ? breadcrumbs[breadcrumbs.length - 2].href : "/library"} user={user}>
      <main className="mx-auto max-w-4xl px-4 py-8">
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

        <div className="rounded-lg bg-white shadow-sm">
          {entries.length === 0 ? (
            <div className="py-16 text-center text-gray-400">此目录为空</div>
          ) : (
            <div className="divide-y">
              {entries.map((entry) => (
                <Link
                  key={entry.name}
                  href={entry.isDir ? `/library/${segments.map(encodeURIComponent).join("/")}/${encodeURIComponent(entry.name)}` : `${filePrefix}${encodeURIComponent(entry.name)}`}
                  className="flex items-center gap-3 px-4 py-3 transition hover:bg-gray-50"
                >
                  <span className="text-lg">{entry.isDir ? "📁" : "📄"}</span>
                  <span className="flex-1 text-sm font-medium text-gray-800">{entry.name}</span>
                  {!entry.isDir && entry.size !== undefined && (
                    <span className="text-xs text-gray-400">{formatSize(entry.size)}</span>
                  )}
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
    </AppShell>
  );
}
