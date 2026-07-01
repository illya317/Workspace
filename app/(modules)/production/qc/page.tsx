import { evaluatePermissionAction, requireRouteAccess } from "@workspace/platform/server/auth";
import { renderAppShellPage } from "@workspace/platform/ui/app-shell-page";
import { getQcBatchEditorRuntimeTemplate, listQcBatches, listQcOfficialTemplateProducts } from "@workspace/production/server/qc";
import { buildQcBatchWorkflow } from "@workspace/production/qc/workflow";
import { QcBatchListClient } from "@workspace/production/ui";

export default async function QcBatchesPage() {
  const user = await requireRouteAccess("/production/qc");
  const [products, batchList, canCreate, canDelete, canExport] = await Promise.all([
    listQcOfficialTemplateProducts(),
    listQcBatches(),
    evaluatePermissionAction(user.id, "production.qc", "create"),
    evaluatePermissionAction(user.id, "production.qc", "delete"),
    evaluatePermissionAction(user.id, "production.qc", "export"),
  ]);
  const initialRows = await Promise.all(batchList.batches.map(async (batch) => {
    const runtimeTemplate = await getQcBatchEditorRuntimeTemplate(batch).catch(() => null);
    const workflow = runtimeTemplate ? buildQcBatchWorkflow(runtimeTemplate, batch) : null;
    return {
      ...batch,
      runtimeTemplate,
      inspectorNames: workflow?.inspectorNames ?? [],
      reviewerNames: workflow?.reviewerNames ?? [],
      statusLabels: workflow?.statusLabels ?? ["检验中"],
    };
  }));

  return renderAppShellPage({
    title: "批次检验",
    backHref: "/production",
    user,
    children: (
      <QcBatchListClient
        initialRows={initialRows}
        products={products}
        canCreate={canCreate}
        canDelete={canDelete}
        canExport={canExport}
      />
    ),
  });
}
