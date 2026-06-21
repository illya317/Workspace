import { requireResourceAccess } from "@workspace/platform/server/auth";
import { getQcConfigOverview, listQcBatches } from "@workspace/production/server/qc";
import { QcBatchListClient, QcModuleShell } from "@workspace/production/ui";

export default async function QcBatchesPage() {
  const user = await requireResourceAccess("production.qc.batches");
  const [overview, batchList] = await Promise.all([getQcConfigOverview(), listQcBatches()]);

  return (
    <QcModuleShell
      user={user}
      title="批次检验"
      description="创建并管理药品批次检验记录，跟踪待检、已提交和异常状态。"
      activeResourceKey="production.qc.batches"
    >
      <QcBatchListClient initialData={batchList} products={overview.recordTemplates} />
    </QcModuleShell>
  );
}
