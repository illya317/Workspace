import { notFound } from "next/navigation";
import { requireResourceAccess } from "@/server/auth/guard";
import { getQcTemplateEditorData } from "@/server/services/production/qc";
import QcModuleShell from "../../../../components/QcModuleShell";
import QcTemplateModuleEditorClient from "../../../../components/QcTemplateModuleEditorClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface Props {
  params: Promise<{ templateId: string }>;
}

export default async function QcTemplateModuleEditPage({ params }: Props) {
  const [{ templateId }, user] = await Promise.all([
    params,
    requireResourceAccess("production.qc.templates"),
  ]);
  const data = await getQcTemplateEditorData(templateId).catch(() => null);
  if (!data || !data.detail.source.available) notFound();

  return (
    <QcModuleShell
      user={user}
      title={`${data.detail.productName} · 模块编辑`}
      description="以草稿方式编辑模块表格、单元格、字段和公式；生产端仍使用已发布 JSON/YAML。"
      activeResourceKey="production.qc.templates"
    >
      <QcTemplateModuleEditorClient data={data} />
    </QcModuleShell>
  );
}
