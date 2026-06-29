import { requireRouteAccess } from "@workspace/platform/server/auth";
import { renderAppShellPage } from "@workspace/platform/ui/app-shell-page";
import { getQcTemplateSummaries, listQcTemplateFeedback } from "@workspace/production/server/qc";
import { QcTemplateWorkbench } from "@workspace/production/ui";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function QcTemplatesPage() {
  const user = await requireRouteAccess("/production/qc-templates");
  const [templates, feedback] = await Promise.all([
    getQcTemplateSummaries(),
    listQcTemplateFeedback(),
  ]);

  return renderAppShellPage({
    title: "检验模板",
    backHref: "/production",
    user,
    children: <QcTemplateWorkbench templates={templates} feedbackStates={feedback.states} />,
  });
}
