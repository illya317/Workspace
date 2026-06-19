import Link from "next/link";
import { notFound } from "next/navigation";
import { requireResourceAccess } from "@workspace/platform/server/auth";
import { getQcBatch, getQcTemplateDetail } from "@workspace/production/server/qc";
import QcBatchNumberInput from "../../components/QcBatchNumberInput";
import QcModuleShell from "../../components/QcModuleShell";

interface Props {
  params: Promise<{ batchId: string }>;
}

const numerals = ["一", "二", "三", "四", "五", "六"];

export default async function QcBatchRecordPage({ params }: Props) {
  const [{ batchId }, user] = await Promise.all([params, requireResourceAccess("production.qc.batches")]);
  const batch = await getQcBatch(Number(batchId));
  if (!batch) notFound();
  const detail = await getQcTemplateDetail(batch.productKey).catch(() => null);
  if (!detail) notFound();

  return (
    <QcModuleShell
      user={user}
      title={`${batch.productName} 批检验记录`}
      description="按阶段进入检验前确认和检测项目记录。"
      activeResourceKey="production.qc.batches"
    >
      <section className="bg-white px-4 py-8 shadow-sm">
        <div className="mx-auto max-w-5xl">
          <div className="mb-5 flex max-w-3xl items-center gap-3 rounded-md border border-slate-200 bg-slate-50 px-4 py-2">
            <span className="text-sm font-semibold text-slate-900">批号：</span>
            <QcBatchNumberInput batchId={batch.id} initialValue={batch.batchNumber} />
            <span className="text-xs text-slate-500">批次ID: {batch.id}</span>
          </div>

          <h1 className="mb-7 text-center text-lg font-semibold text-slate-950">{batch.productName} 批检验记录</h1>

          <div className="grid gap-4 md:grid-cols-3">
            {detail.stages.map((stage, index) => (
              <Link
                key={stage.key}
                href={`/production/qc/batches/${batch.id}/${stage.key}`}
                className="min-h-44 border border-slate-950 bg-white p-5 text-slate-950 transition hover:bg-slate-50"
              >
                <div className="mb-4 text-base font-semibold">
                  {numerals[index] ?? index + 1}、{stage.label}
                </div>
                <div className="text-sm text-slate-700">检测项：{stage.tests.length} 项</div>
                <div className="mt-4 text-xs leading-6 text-slate-500">
                  {stage.tests.map((test) => `${test.sequence} ${test.name}`).join(" / ")}
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </QcModuleShell>
  );
}
