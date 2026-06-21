import { requireResourceAccess } from "@workspace/platform/server/auth";
import { getQcTemplateSummaries, listQcBatches } from "@workspace/production/server/qc";
import { buildQcBatchWorkflow } from "@workspace/production/qc/workflow";
import { QcBatchListClient, QcModuleShell } from "@workspace/production/ui";

export default async function QcBatchesPage() {
  const user = await requireResourceAccess("production.qc.batches");
  const [templates, batchList] = await Promise.all([getQcTemplateSummaries(), listQcBatches()]);
  const templateById = new Map(templates.map((template) => [template.id, template]));
  const initialRows = batchList.batches.map((batch) => {
    const workflow = templateById.get(batch.productKey)
      ? buildQcBatchWorkflow(templateById.get(batch.productKey)!, batch)
      : null;
    return {
      ...batch,
      inspectorNames: workflow?.inspectorNames ?? [],
      reviewerNames: workflow?.reviewerNames ?? [],
      statusLabels: workflow?.statusLabels ?? ["检验中"],
    };
  });
  const products = templates.map((template) => ({ id: template.id, productName: template.productName }));

  return (
    <QcModuleShell
      user={user}
      title="批次检验"
      description="创建并管理药品批次检验记录，跟踪检验、复核、验收和异常状态。"
      activeResourceKey="production.qc.batches"
    >
      <QcBatchListClient initialRows={initialRows} products={products} />
    </QcModuleShell>
  );
}
