import { notFound } from "next/navigation";
import { requireResourceAccess } from "@workspace/platform/server/auth";
import { getQcBatch, getQcTemplateDetail } from "@workspace/production/server/qc";
import { QcBatchStagePrecheck, QcModuleShell } from "@workspace/production/ui";

interface Props {
  params: Promise<{ batchId: string; stageKey: string }>;
}

export default async function QcBatchStagePage({ params }: Props) {
  const [{ batchId, stageKey }, user] = await Promise.all([params, requireResourceAccess("production.qc.batches")]);
  const batch = await getQcBatch(Number(batchId));
  if (!batch) notFound();
  const detail = await getQcTemplateDetail(batch.productKey).catch(() => null);
  const stageIndex = detail?.stages.findIndex((item) => item.key === stageKey) ?? -1;
  const stage = stageIndex >= 0 ? detail?.stages[stageIndex] : null;
  if (!detail || !stage) notFound();

  return (
    <QcModuleShell
      user={user}
      title={`${batch.productName} ${stage.label}`}
      description="检验前确认和检测项目导航。"
      activeResourceKey="production.qc.batches"
      backHref={`/production/qc/batches/${batch.id}`}
    >
      <QcBatchStagePrecheck batch={batch} productName={detail.productName} detail={detail} stage={stage} stageIndex={stageIndex} />
    </QcModuleShell>
  );
}
