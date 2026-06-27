import { notFound } from "next/navigation";
import { requireRouteAccess } from "@workspace/platform/server/auth";
import { getQcBatch, getQcTemplateDetail } from "@workspace/production/server/qc";
import { ProductionQcPageSurface, QcBatchStagePrecheck } from "@workspace/production/ui";

interface Props {
  params: Promise<{ batchId: string; stageKey: string }>;
}

export default async function QcBatchStagePage({ params }: Props) {
  const [{ batchId, stageKey }, user] = await Promise.all([params, requireRouteAccess("/production/qc-batches")]);
  const batch = await getQcBatch(Number(batchId));
  if (!batch) notFound();
  const detail = await getQcTemplateDetail(batch.productKey).catch(() => null);
  const stageIndex = detail?.stages.findIndex((item) => item.key === stageKey) ?? -1;
  const stage = stageIndex >= 0 ? detail?.stages[stageIndex] : null;
  if (!detail || !stage) notFound();

  return (
    <ProductionQcPageSurface title={`${batch.productName} ${stage.label}`} backHref={`/production/qc-batches/${batch.id}`} user={user}>
      <QcBatchStagePrecheck batch={batch} productName={detail.productName} detail={detail} stage={stage} stageIndex={stageIndex} />
    </ProductionQcPageSurface>
  );
}
