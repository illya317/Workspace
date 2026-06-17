import { requireResourceAccess } from "@/server/auth/guard";
import { getQcConfigOverview, getQcTemplateDetail, listQcTemplateFeedback } from "@/server/services/production/qc";
import QcModuleShell from "../components/QcModuleShell";
import QcTemplateWorkbench from "../components/QcTemplateWorkbench";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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
      description="查看各产品检验模板结构，支持预览版式并提交反馈。"
      activeResourceKey="production.qc.templates"
    >
      <QcTemplateWorkbench templates={templates} feedbackStates={feedback.states} />
    </QcModuleShell>
  );
}
