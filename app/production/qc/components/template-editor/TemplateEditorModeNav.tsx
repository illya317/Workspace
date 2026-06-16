"use client";

import Link from "next/link";

interface Props {
  templateId: string;
  active: "layout" | "module";
}

function tabClass(active: boolean) {
  return `rounded-md border px-3 py-2 text-sm font-semibold ${
    active
      ? "border-emerald-600 bg-emerald-50 text-emerald-800"
      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
  }`;
}

export default function TemplateEditorModeNav({ templateId, active }: Props) {
  return (
    <nav className="flex flex-wrap gap-2">
      <Link href={`/production/qc/templates/${templateId}/edit`} className={tabClass(active === "layout")}>
        版面编辑器
      </Link>
      <Link href={`/production/qc/templates/${templateId}/edit/modules`} className={tabClass(active === "module")}>
        模块编辑器
      </Link>
    </nav>
  );
}
