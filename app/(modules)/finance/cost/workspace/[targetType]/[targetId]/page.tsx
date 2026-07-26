import { notFound } from "next/navigation";

import { FinanceOperationalAnalysisPage } from "@workspace/finance/ui";
import type { OperationalAnalysisScopeType } from "@workspace/finance/types";
import { requireRouteAccess } from "@workspace/platform/server/auth";
import { renderAppShellPage } from "@workspace/platform/ui/app-shell-page";

function scopeType(value: string): OperationalAnalysisScopeType | null {
  return value === "personal" || value === "department" || value === "project" ? value : null;
}

function backHref(type: OperationalAnalysisScopeType, id: number) {
  if (type === "department") return `/work/department/${id}`;
  if (type === "project") return `/work/project/${id}`;
  return "/work/me";
}

export default async function FinanceWorkspaceAnalysisPage({
  params,
}: {
  params: Promise<{ targetType: string; targetId: string }>;
}) {
  const raw = await params;
  const type = scopeType(raw.targetType);
  const id = Number(raw.targetId);
  if (!type || !Number.isInteger(id) || id <= 0) notFound();
  const user = await requireRouteAccess("/work/me");
  return renderAppShellPage({
    title: "经营分析",
    backHref: backHref(type, id),
    user,
    children: <FinanceOperationalAnalysisPage
      scopeType={type}
      scopeId={id}
      departmentHomeHref={type === "department" ? backHref(type, id) : undefined}
    />,
  });
}
