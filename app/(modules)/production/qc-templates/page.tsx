import { requireResourceAccess } from "@workspace/platform/server/auth";
import { getQcTemplateSummaries, listQcTemplateFeedback } from "@workspace/production/server/qc";
import { QcModuleShell, QcTemplateWorkbench } from "@workspace/production/ui";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function QcTemplatesPage() {
  const user = await requireResourceAccess("production.qcTemplates");
  const [templates, feedback] = await Promise.all([
    getQcTemplateSummaries(),
    listQcTemplateFeedback(),
  ]);

  return (
    <QcModuleShell
      user={user}
      title="检验模板"
      description="查看各产品检验模板结构，支持预览版式并提交反馈。"
      activeResourceKey="production.qcTemplates"
    >
      <QcTemplateWorkbench templates={templates} feedbackStates={feedback.states} />
    </QcModuleShell>
  );
}
