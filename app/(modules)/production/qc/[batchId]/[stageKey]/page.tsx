import { notFound } from "next/navigation";
import { evaluatePermissionAction, requireRouteAccess } from "@workspace/platform/server/auth";
import { getUserEmployeeSignatureName } from "@workspace/platform/server/user-identity";
import { renderAppShellPage } from "@workspace/platform/ui/app-shell-page";
import { getQcBatch, getQcBatchEditorRuntimeTemplate } from "@workspace/production/server/qc";
import { QcBatchStagePrecheck } from "@workspace/production/ui";

interface Props {
  params: Promise<{ batchId: string; stageKey: string }>;
}

export default async function QcBatchStagePage({ params }: Props) {
  const [{ batchId, stageKey }, user] = await Promise.all([params, requireRouteAccess("/production/qc")]);
  const [canUpdate, canApprove, currentUserName] = await Promise.all([
    evaluatePermissionAction(user.id, "production.qc", "update"),
    evaluatePermissionAction(user.id, "production.qc", "approve"),
    getUserEmployeeSignatureName(user.id),
  ]);
  const batch = await getQcBatch(Number(batchId));
  if (!batch) notFound();
  const runtimeTemplate = await getQcBatchEditorRuntimeTemplate(batch).catch(() => null);
  const runtimeStage = runtimeTemplate?.stages.find((item) => item.key === stageKey) ?? null;
  if (!runtimeTemplate || !runtimeStage) notFound();

  return renderAppShellPage({
    title: "批次阶段确认",
    backHref: "/production/qc",
    user,
    children: (
      <QcBatchStagePrecheck
        batch={batch}
        productName={runtimeTemplate.productName}
        runtimeTemplate={runtimeTemplate}
        runtimeStage={runtimeStage}
        currentUserName={currentUserName || ""}
        canUpdate={canUpdate}
        canApprove={canApprove}
      />
    ),
  });
}
