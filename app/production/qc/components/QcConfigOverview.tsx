import type { QcConfigOverview } from "@/server/services/production/qc";

interface Props {
  overview: QcConfigOverview;
  mode: "batches" | "templates";
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function SourceStatus({ overview }: { overview: QcConfigOverview }) {
  const hasUncommittedChanges = overview.source.dirty;
  const tone = !overview.source.available || hasUncommittedChanges
    ? "border-amber-200 bg-amber-50 text-amber-800"
    : "border-emerald-200 bg-emerald-50 text-emerald-800";
  const title = !overview.source.available
    ? "未连接配置源"
    : hasUncommittedChanges
      ? "pharma-ops 配置源有未提交改动"
      : "已连接 pharma-ops 配置";

  return (
    <div className={`rounded-lg border px-4 py-3 text-sm ${tone}`}>
      <div className="font-medium">{title}</div>
      <div className="mt-1 break-all text-xs opacity-80">{overview.source.configRoot}</div>
      {overview.source.revision && (
        <div className="mt-1 text-xs opacity-80">
          revision {overview.source.revision}
          {typeof overview.source.changedFileCount === "number" && ` · ${overview.source.changedFileCount} 个未提交文件`}
        </div>
      )}
      {!!overview.source.changedFiles?.length && (
        <div className="mt-2 flex flex-wrap gap-1">
          {overview.source.changedFiles.slice(0, 6).map((file) => (
            <span key={file} className="rounded bg-white/70 px-2 py-0.5 text-xs">{file}</span>
          ))}
        </div>
      )}
      {overview.source.message && <div className="mt-1 text-xs">{overview.source.message}</div>}
    </div>
  );
}

function BatchesOverview({ overview }: { overview: QcConfigOverview }) {
  const products = overview.products.slice(0, 8);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <Metric label="产品配置" value={overview.products.length} />
        <Metric label="阶段配置" value={overview.products.reduce((sum, product) => sum + product.stageCount, 0)} />
        <Metric label="检测项映射" value={overview.products.reduce((sum, product) => sum + product.itemCount, 0)} />
        <Metric label="记录模板" value={overview.recordTemplates.length} />
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">产品与检验阶段</h2>
        </div>
        <div className="divide-y divide-slate-100">
          {products.map((product) => (
            <div key={product.name} className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(160px,1fr)_2fr]">
              <div>
                <div className="text-sm font-medium text-slate-900">{product.name}</div>
                <div className="mt-1 text-xs text-slate-500">{product.itemCount} 个检测项</div>
              </div>
              <div className="flex flex-wrap gap-2">
                {product.stages.map((stage) => (
                  <span key={`${product.name}-${stage.key}`} className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700">
                    {stage.label} · {stage.itemCount}
                  </span>
                ))}
              </div>
            </div>
          ))}
          {products.length === 0 && <div className="px-4 py-6 text-sm text-slate-500">暂无可读取的产品配置。</div>}
        </div>
      </div>
    </div>
  );
}

function TemplatesOverview({ overview }: { overview: QcConfigOverview }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <Metric label="记录模板 YAML" value={overview.recordTemplates.length} />
        <Metric label="方法 YAML" value={overview.methods.length} />
        <Metric label="方法字段" value={overview.methods.reduce((sum, method) => sum + method.fieldCount, 0)} />
        <Metric label="布局映射 JSON" value={overview.layoutMapping.assignmentCount} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900">记录模板</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {overview.recordTemplates.slice(0, 8).map((template) => (
              <div key={template.id} className="px-4 py-3">
                <div className="text-sm font-medium text-slate-900">{template.productName}</div>
                <div className="mt-1 text-xs text-slate-500">
                  {template.stageCount} 个阶段 · {template.itemCount} 个检测项 · {template.fileName}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900">布局映射样本</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {overview.layoutMapping.samples.map((sample) => (
              <div key={sample.key} className="px-4 py-3">
                <div className="break-all text-sm font-medium text-slate-900">{sample.key}</div>
                <div className="mt-1 text-xs text-slate-500">
                  {sample.templateId} · {sample.status}{sample.sourceRef ? ` · ${sample.sourceRef}` : ""}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

export default function QcConfigOverviewPanel({ overview, mode }: Props) {
  return (
    <section className="space-y-4">
      <SourceStatus overview={overview} />
      {mode === "batches" ? <BatchesOverview overview={overview} /> : <TemplatesOverview overview={overview} />}
    </section>
  );
}
