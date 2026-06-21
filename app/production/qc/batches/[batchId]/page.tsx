import { notFound } from "next/navigation";
import { requireResourceAccess } from "@workspace/platform/server/auth";
import { getQcBatch, getQcTemplateDetail } from "@workspace/production/server/qc";
import { QcBatchRecordStageList, QcModuleShell } from "@workspace/production/ui";

interface Props {
  params: Promise<{ batchId: string }>;
}

export default async function QcBatchRecordPage({ params }: Props) {
  const [{ batchId }, user] = await Promise.all([params, requireResourceAccess("production.qc.batches")]);
  const batch = await getQcBatch(Number(batchId));
  if (!batch) notFound();
  const detail = await getQcTemplateDetail(batch.productKey).catch(() => null);
  if (!detail) notFound();

  return (
    <QcModuleShell
      user={user}
      title={`${batch.productName}批检验记录`}
      description="按阶段进入检验前确认和检测项目记录。"
      activeResourceKey="production.qc.batches"
      backHref="/production/qc/batches"
    >
      <QcBatchRecordStageList batch={batch} detail={detail} />
    </QcModuleShell>
  );
}
