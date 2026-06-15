import AppShell from "@/app/components/AppShell";
import Link from "next/link";
import type { SessionUser } from "@/lib/types";

interface QcPanel {
  title: string;
  eyebrow: string;
  items: string[];
}

interface Props {
  user: SessionUser;
  title: string;
  description: string;
  activeResourceKey: string;
  panels: QcPanel[];
}

const navLinks = [
  { label: "批次检验", href: "/production/qc/batches", resourceKey: "production.qc.batches" },
  { label: "检验模板", href: "/production/qc/templates", resourceKey: "production.qc.templates" },
];

export default function QcModuleShell({ user, title, description, activeResourceKey, panels }: Props) {
  const visibleNavLinks = navLinks
    .filter((link) => user.visibleResourceKeys?.includes(link.resourceKey));

  return (
    <AppShell title={title} backHref="/production" user={user}>
      <main className="mx-auto max-w-6xl space-y-4 px-4 py-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">{title}</h1>
          <p className="text-sm text-gray-500">{description}</p>
        </div>

        {visibleNavLinks.length > 1 && (
          <nav className="flex gap-2 border-b border-gray-200 pb-1">
            {visibleNavLinks.map((link) => {
              const active = link.resourceKey === activeResourceKey;
              return (
                <Link
                  key={link.resourceKey}
                  href={link.href}
                  className={`px-3 py-2 text-sm font-medium ${
                    active
                      ? "border-b-2 border-emerald-600 text-emerald-700"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        )}

        <section className="grid gap-4 md:grid-cols-3">
          {panels.map((panel) => (
            <article key={panel.title} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-medium text-cyan-700">{panel.eyebrow}</p>
              <h2 className="mt-2 text-base font-semibold text-slate-900">{panel.title}</h2>
              <ul className="mt-4 space-y-2 text-sm text-slate-600">
                {panel.items.map((item) => (
                  <li key={item} className="flex gap-2">
                    <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-cyan-500" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </section>
      </main>
    </AppShell>
  );
}
