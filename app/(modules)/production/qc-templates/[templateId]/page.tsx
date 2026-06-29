import { notFound } from "next/navigation";
import { requireRouteAccess } from "@workspace/platform/server/auth";
import { getQcTemplateDetail } from "@workspace/production/server/qc";
import { QcTemplateDetailPanel } from "@workspace/production/ui";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface Props {
  params: Promise<{ templateId: string }>;
}

export default async function QcTemplateDetailPage({ params }: Props) {
  const [{ templateId }] = await Promise.all([
    params,
    requireRouteAccess("/production/qc-templates"),
  ]);
  const detail = await getQcTemplateDetail(templateId).catch(() => null);
  if (!detail || !detail.source.available) notFound();

  return <QcTemplateDetailPanel detail={detail} />;
}
