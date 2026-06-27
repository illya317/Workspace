import { notFound } from "next/navigation";
import { requireRouteAccess } from "@workspace/platform/server/auth";
import { getQcBatch, getQcTemplateDetail } from "@workspace/production/server/qc";
import { ProductionQcPageSurface, QcBatchRecordStageList } from "@workspace/production/ui";

interface Props {
  params: Promise<{ batchId: string }>;
}

export default async function QcBatchRecordPage({ params }: Props) {
  const [{ batchId }, user] = await Promise.all([params, requireRouteAccess("/production/qc-batches")]);
  const batch = await getQcBatch(Number(batchId));
  if (!batch) notFound();
  const detail = await getQcTemplateDetail(batch.productKey).catch(() => null);
  if (!detail) notFound();

  return (
    <ProductionQcPageSurface title={`${batch.productName}批检验记录`} backHref="/production/qc-batches" user={user}>
      <QcBatchRecordStageList batch={batch} detail={detail} />
    </ProductionQcPageSurface>
  );
}
