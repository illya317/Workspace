import { requireResourceAccess } from "@/server/auth/guard";
import { getQcConfigOverview, getQcTemplateDetail, listQcTemplateFeedback } from "@/server/services/production/qc";
import QcModuleShell from "../components/QcModuleShell";
import QcTemplateWorkbench from "../components/QcTemplateWorkbench";

export default async function QcTemplatesPage() {
  const user = await requireResourceAccess("production.qc.templates");
  const [overview, feedback] = await Promise.all([
    getQcConfigOverview(),
    listQcTemplateFeedback(),
  ]);
  const templates = await Promise.all(overview.recordTemplates.map((template) => getQcTemplateDetail(template.id)));

  return (
    <QcModuleShell
      user={user}
      title="检验模板"
      description="承接组件映射、方法字段和表格布局，先用于收集模板建议，后续扩展为自助搭建模板。"
      activeResourceKey="production.qc.templates"
    >
      <QcTemplateWorkbench templates={templates} feedbackKeys={feedback.keys} />
    </QcModuleShell>
  );
}
