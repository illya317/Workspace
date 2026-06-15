import { requireResourceAccess } from "@/server/auth/guard";
import { getQcConfigOverview, listQcBatches } from "@/server/services/production/qc";
import QcBatchListClient from "../components/QcBatchListClient";
import QcModuleShell from "../components/QcModuleShell";

export default async function QcBatchesPage() {
  const user = await requireResourceAccess("production.qc.batches");
  const [overview, batchList] = await Promise.all([getQcConfigOverview(), listQcBatches()]);

  return (
    <QcModuleShell
      user={user}
      title="批次检验"
      description="承接药品批次检验记录，先建立 Workspace 入口、权限边界和后续迁移落点。"
      activeResourceKey="production.qc.batches"
    >
      <QcBatchListClient initialData={batchList} products={overview.recordTemplates} />
    </QcModuleShell>
  );
}
