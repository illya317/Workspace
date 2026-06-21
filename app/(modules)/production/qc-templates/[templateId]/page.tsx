import { notFound } from "next/navigation";
import { requireResourceAccess } from "@workspace/platform/server/auth";
import { getQcTemplateDetail } from "@workspace/production/server/qc";
import { QcModuleShell, QcTemplateDetailPanel } from "@workspace/production/ui";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface Props {
  params: Promise<{ templateId: string }>;
}

export default async function QcTemplateDetailPage({ params }: Props) {
  const [{ templateId }, user] = await Promise.all([
    params,
    requireResourceAccess("production.qcTemplates"),
  ]);
  const detail = await getQcTemplateDetail(templateId).catch(() => null);
  if (!detail || !detail.source.available) notFound();

  return (
    <QcModuleShell
      user={user}
      title={detail.productName}
      description="检验记录模板结构，包含阶段、检测项、方法字段和组件布局映射。"
      activeResourceKey="production.qcTemplates"
    >
      <QcTemplateDetailPanel detail={detail} />
    </QcModuleShell>
  );
}
