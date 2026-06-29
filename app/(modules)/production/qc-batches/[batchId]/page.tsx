import { notFound } from "next/navigation";
import { requireRouteAccess } from "@workspace/platform/server/auth";
import { getQcBatch, getQcTemplateDetail } from "@workspace/production/server/qc";
import { QcBatchRecordStageList } from "@workspace/production/ui";

interface Props {
  params: Promise<{ batchId: string }>;
}

export default async function QcBatchRecordPage({ params }: Props) {
  const [{ batchId }] = await Promise.all([params, requireRouteAccess("/production/qc-batches")]);
  const batch = await getQcBatch(Number(batchId));
  if (!batch) notFound();
  const detail = await getQcTemplateDetail(batch.productKey).catch(() => null);
  if (!detail) notFound();

  return <QcBatchRecordStageList batch={batch} detail={detail} />;
}
