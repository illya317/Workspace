import { notFound } from "next/navigation";
import { requireResourceAccess } from "@/server/auth/guard";
import { getQcBatch, getQcTemplateDetail } from "@workspace/production/server/qc";
import QcBatchTestRecord from "../../../../components/QcBatchTestRecord";
import QcModuleShell from "../../../../components/QcModuleShell";

interface Props {
  params: Promise<{ batchId: string; stageKey: string; testName: string }>;
}

export default async function QcBatchTestPage({ params }: Props) {
  const [{ batchId, stageKey, testName }, user] = await Promise.all([params, requireResourceAccess("production.qc.batches")]);
  const batch = await getQcBatch(Number(batchId));
  if (!batch) notFound();
  const detail = await getQcTemplateDetail(batch.productKey).catch(() => null);
  const stage = detail?.stages.find((item) => item.key === stageKey);
  const test = stage?.tests.find((item) => item.englishName === testName);
  if (!detail || !stage || !test) notFound();

  return (
    <QcModuleShell
      user={user}
      title={`${batch.productName} ${test.name}`}
      description="YAML 方法字段驱动的检验项目记录。"
      activeResourceKey="production.qc.batches"
    >
      <QcBatchTestRecord batch={batch} productName={detail.productName} stage={stage} test={test} />
    </QcModuleShell>
  );
}
