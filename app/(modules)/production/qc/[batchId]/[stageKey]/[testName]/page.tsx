import { notFound } from "next/navigation";
import { requireRouteAccess } from "@workspace/platform/server/auth";
import { renderAppShellPage } from "@workspace/platform/ui/app-shell-page";
import { getQcBatch, getQcBatchEditorRuntimeTemplate } from "@workspace/production/server/qc";
import { QcBatchTestRecord } from "@workspace/production/ui";

interface Props {
  params: Promise<{ batchId: string; stageKey: string; testName: string }>;
}

export default async function QcBatchTestPage({ params }: Props) {
  const [{ batchId, stageKey, testName }, user] = await Promise.all([params, requireRouteAccess("/production/qc")]);
  const batch = await getQcBatch(Number(batchId));
  if (!batch) notFound();
  const runtimeTemplate = await getQcBatchEditorRuntimeTemplate(batch).catch(() => null);
  const runtimeStage = runtimeTemplate?.stages.find((item) => item.key === stageKey) ?? null;
  const runtimeTest = runtimeStage?.tests.find((item) => item.key === testName) ?? null;
  if (!runtimeTemplate || !runtimeStage || !runtimeTest) notFound();

  return renderAppShellPage({
    title: "批次检测记录",
    backHref: `/production/qc/${batch.id}/${runtimeStage.key}`,
    user,
    children: <QcBatchTestRecord batch={batch} productName={runtimeTemplate.productName} runtimeTemplate={runtimeTemplate} runtimeStage={runtimeStage} runtimeTest={runtimeTest} currentUserName={user.employeeName || user.nickname} />,
  });
}
