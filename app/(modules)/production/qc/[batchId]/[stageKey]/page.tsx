import { notFound } from "next/navigation";
import { requireRouteAccess } from "@workspace/platform/server/auth";
import { renderAppShellPage } from "@workspace/platform/ui/app-shell-page";
import { getQcBatch, getQcBatchEditorRuntimeTemplate } from "@workspace/production/server/qc";
import { QcBatchStagePrecheck } from "@workspace/production/ui";

interface Props {
  params: Promise<{ batchId: string; stageKey: string }>;
}

export default async function QcBatchStagePage({ params }: Props) {
  const [{ batchId, stageKey }, user] = await Promise.all([params, requireRouteAccess("/production/qc")]);
  const batch = await getQcBatch(Number(batchId));
  if (!batch) notFound();
  const runtimeTemplate = await getQcBatchEditorRuntimeTemplate(batch).catch(() => null);
  const runtimeStage = runtimeTemplate?.stages.find((item) => item.key === stageKey) ?? null;
  if (!runtimeTemplate || !runtimeStage) notFound();

  return renderAppShellPage({
    title: "批次阶段确认",
    backHref: "/production/qc",
    user,
    children: <QcBatchStagePrecheck batch={batch} productName={runtimeTemplate.productName} runtimeTemplate={runtimeTemplate} runtimeStage={runtimeStage} />,
  });
}
