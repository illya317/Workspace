import { notFound } from "next/navigation";
import { requireRouteAccess } from "@workspace/platform/server/auth";
import { getQcBatch, getQcTemplateDetail } from "@workspace/production/server/qc";
import { ProductionQcPageSurface, QcBatchTestRecord } from "@workspace/production/ui";

interface Props {
  params: Promise<{ batchId: string; stageKey: string; testName: string }>;
}

export default async function QcBatchTestPage({ params }: Props) {
  const [{ batchId, stageKey, testName }, user] = await Promise.all([params, requireRouteAccess("/production/qc-batches")]);
  const batch = await getQcBatch(Number(batchId));
  if (!batch) notFound();
  const detail = await getQcTemplateDetail(batch.productKey).catch(() => null);
  const stage = detail?.stages.find((item) => item.key === stageKey);
  const test = stage?.tests.find((item) => item.englishName === testName);
  if (!detail || !stage || !test) notFound();

  return (
    <ProductionQcPageSurface title={`${batch.productName} ${test.name}`} backHref={`/production/qc-batches/${batch.id}/${stage.key}`} user={user}>
      <QcBatchTestRecord batch={batch} productName={detail.productName} detail={detail} stage={stage} test={test} currentUserName={user.employeeName || user.nickname} />
    </ProductionQcPageSurface>
  );
}
