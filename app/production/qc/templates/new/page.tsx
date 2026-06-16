import { requireResourceAccess } from "@/server/auth/guard";
import { getQcConfigOverview, getQcTemplateDetail } from "@/server/services/production/qc";
import QcModuleShell from "../../components/QcModuleShell";
import QcTemplateCreateWizard from "../../components/QcTemplateCreateWizard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function QcTemplateNewPage() {
  const user = await requireResourceAccess("production.qc.templates");
  const overview = await getQcConfigOverview();
  const templates = await Promise.all(overview.recordTemplates.map((template) => getQcTemplateDetail(template.id)));

  return (
    <QcModuleShell
      user={user}
      title="新建检验模板"
      description="先选择产品与 L0 阶段，建立后续 JSON/YAML 草稿编辑的入口。"
      activeResourceKey="production.qc.templates"
    >
      <QcTemplateCreateWizard templates={templates} />
    </QcModuleShell>
  );
}
