import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import AppShell from "@/app/components/AppShell";
import { readdir } from "fs/promises";
import path from "path";
import Link from "next/link";

const ROOT = "/Users/koito/Desktop/FH/资料库";

async function getDirs(): Promise<string[]> {
  try {
    const items = await readdir(ROOT, { withFileTypes: true });
    return items
      .filter(i => i.isDirectory() && !i.name.startsWith("."))
      .map(i => i.name)
      .sort((a, b) => a.localeCompare(b, "zh"));
  } catch { return []; }
}

export default async function LibraryPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const dirs = await getDirs();

  return (
    <AppShell title="资料库" backHref="/portal" user={user}>
      <main className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="mb-6 text-2xl font-bold text-gray-800">资料库</h1>
        {dirs.length === 0 ? (
          <div className="rounded-lg bg-white py-16 text-center shadow-sm"><p className="text-gray-500">暂无数据</p></div>
        ) : (
          <div className="rounded-lg bg-white p-4 shadow-sm">
            <div className="space-y-0.5">
              {dirs.map(d => (
                <Link key={d} href={`/library/${d}`}
                  className="flex items-center gap-2 rounded px-3 py-2.5 text-sm text-gray-800 transition hover:bg-gray-50"
                >
                  <span className="text-xs text-gray-400">▸</span>
                  <span className="flex-1">{d}</span>
                  <span className="text-xs text-gray-400">→</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </main>
    </AppShell>
  );
}
