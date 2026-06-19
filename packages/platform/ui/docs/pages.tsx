import Link from "next/link";
import { redirect } from "next/navigation";
import type { SessionUser } from "@workspace/platform/types";
import { MODULES } from "@workspace/platform/module-nav";
import AppShell from "../AppShell";
import ModuleHome from "../ModuleHome";
import ApiGuideClient from "./ApiGuideClient";
import GmpPositionDetailClient from "./positions/gmp/GmpPositionDetailClient";
import GmpPositionsClient from "./positions/gmp/GmpPositionsClient";

export function DocsHome({ user }: { user: SessionUser }) {
  const mod = MODULES.find((m) => m.key === "docs");
  if (!mod) redirect("/portal");

  return (
    <AppShell title={mod.label} backHref="/portal" user={user}>
      <ModuleHome module={mod} user={user} />
    </AppShell>
  );
}

export function DocsPlaceholderPage({
  user,
  title,
  description,
}: {
  user: SessionUser;
  title: string;
  description: string;
}) {
  return (
    <AppShell title={title} backHref="/docs" user={user}>
      <main className="mx-auto max-w-5xl px-4 py-10">
        <h2 className="mb-4 text-lg font-semibold text-gray-800">{title}</h2>
        <p className="text-sm text-gray-500">{description}</p>
      </main>
    </AppShell>
  );
}

export function DocsPositionsIndex({ user }: { user: SessionUser }) {
  return (
    <AppShell title="岗位说明书" backHref="/docs" user={user}>
      <main className="mx-auto max-w-5xl px-4 py-10">
        <h2 className="mb-6 text-lg font-semibold text-gray-800">岗位说明书</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Link href="/docs/positions/GMP" className="rounded-lg bg-white p-5 shadow-sm transition hover:shadow-md">
            <h3 className="text-base font-semibold text-gray-800">GMP 岗位说明书</h3>
            <p className="mt-1 text-sm text-gray-500">GMP 体系岗位说明书</p>
            <span className="mt-3 inline-block text-sm text-emerald-600">查看 -&gt;</span>
          </Link>
        </div>
      </main>
    </AppShell>
  );
}

export function DocsApiGuidePage({ user }: { user: SessionUser }) {
  return (
    <AppShell title="接入指南" backHref="/docs" user={user}>
      <ApiGuideClient hideShell />
    </AppShell>
  );
}

export function GmpPositionsPage({ user }: { user: SessionUser }) {
  return (
    <AppShell title="岗位说明书" backHref="/docs" user={user}>
      <GmpPositionsClient hideShell />
    </AppShell>
  );
}

export function GmpPositionDetailPage({ code, user }: { code: string; user: SessionUser }) {
  return (
    <AppShell title="岗位说明书" backHref="/docs/positions/GMP" user={user}>
      <GmpPositionDetailClient code={code} />
    </AppShell>
  );
}
