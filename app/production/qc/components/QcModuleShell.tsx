import AppShell from "@/app/components/AppShell";
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
  panels: QcPanel[];
}

const navLinks = [
  { label: "批次检验", href: "/production/qc/batches", resourceKey: "production.qc.batches" },
  { label: "检验模板", href: "/production/qc/templates", resourceKey: "production.qc.templates" },
];

export default function QcModuleShell({ user, title, description, panels }: Props) {
  const visibleNavLinks = navLinks
    .filter((link) => user.visibleResourceKeys?.includes(link.resourceKey))
    .map(({ label, href }) => ({ label, href }));

  return (
    <AppShell title={title} backHref="/production" user={user} navLinks={visibleNavLinks}>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <section className="mb-6 border-b border-slate-200 pb-5">
          <p className="text-sm font-medium text-cyan-700">生产管理 / 质量检验</p>
          <h1 className="mt-2 text-2xl font-semibold text-slate-900">{title}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{description}</p>
        </section>

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
