import { notFound } from "next/navigation";
import { requireResourceAccess } from "@/server/auth/guard";
import { getQcTemplateDetail } from "@/server/services/production/qc";
import QcModuleShell from "../../components/QcModuleShell";
import QcTemplateDetailPanel from "../../components/QcTemplateDetail";

interface Props {
  params: Promise<{ templateId: string }>;
}

export default async function QcTemplateDetailPage({ params }: Props) {
  const [{ templateId }, user] = await Promise.all([
    params,
    requireResourceAccess("production.qc.templates"),
  ]);
  const detail = await getQcTemplateDetail(templateId).catch(() => null);
  if (!detail || !detail.source.available) notFound();

  return (
    <QcModuleShell
      user={user}
      title={detail.productName}
      description="检验记录模板结构，包含阶段、检测项、方法字段和组件布局映射。"
      activeResourceKey="production.qc.templates"
    >
      <QcTemplateDetailPanel detail={detail} />
    </QcModuleShell>
  );
}
