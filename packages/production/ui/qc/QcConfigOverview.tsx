import type { QcConfigOverview } from "@workspace/production/server/qc";
import Link from "next/link";
import { PageSurface, createGroupBlock, createPageDataBlock, createPageTableBlock } from "@workspace/core/ui";

interface Props {
  overview: QcConfigOverview;
  mode: "batches" | "templates";
}

type ProductOverview = QcConfigOverview["products"][number];
type RecordTemplateOverview = QcConfigOverview["recordTemplates"][number];
type LayoutMappingSample = QcConfigOverview["layoutMapping"]["samples"][number];

function SourceStatus({ overview }: { overview: QcConfigOverview }) {
  const hasUncommittedChanges = overview.source.dirty;
  const cannotVerifyRevision = overview.source.available && overview.source.gitAvailable === false;
  const tone = !overview.source.available || hasUncommittedChanges || cannotVerifyRevision
    ? "border-amber-200 bg-amber-50 text-amber-800"
    : "border-emerald-200 bg-emerald-50 text-emerald-800";
  const title = !overview.source.available
    ? "未连接配置源"
    : hasUncommittedChanges
      ? "pharma-ops 配置源有未提交改动"
      : cannotVerifyRevision
        ? "已连接配置源，但无法确认版本状态"
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
      {cannotVerifyRevision && (
        <div className="mt-1 text-xs opacity-80">配置源不是 git checkout，无法判断是否已稳定提交。</div>
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
    <PageSurface
      kind="detail"
      embedded
      blocks={[
        createPageDataBlock<ProductOverview>("qc-config-batch-metrics", {
          kind: "metrics",
          metrics: [
            { key: "products", label: "产品配置", value: overview.products.length },
            { key: "stages", label: "阶段配置", value: overview.products.reduce((sum, product) => sum + product.stageCount, 0) },
            { key: "items", label: "检测项映射", value: overview.products.reduce((sum, product) => sum + product.itemCount, 0) },
            { key: "templates", label: "记录模板", value: overview.recordTemplates.length },
          ],
        }),
        createPageTableBlock<ProductOverview>("qc-config-batch-products", {
          framed: true,
          title: "产品与检验阶段",
          rows: products,
          columns: [
            {
              key: "product",
              label: "产品",
              required: true,
              cell: (product) => (
                <div>
                  <div className="text-sm font-medium text-slate-900">{product.name}</div>
                  <div className="mt-1 text-xs text-slate-500">{product.itemCount} 个检测项</div>
                </div>
              ),
            },
            {
              key: "stages",
              label: "阶段",
              required: true,
              cell: (product) => (
                <div className="flex flex-wrap gap-2">
                  {product.stages.map((stage) => (
                    <span key={`${product.name}-${stage.key}`} className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700">
                      {stage.label} · {stage.itemCount}
                    </span>
                  ))}
                </div>
              ),
            },
          ],
          rowKey: (product) => product.name,
          emptyText: "暂无可读取的产品配置。",
        }),
      ]}
    />
  );
}

function TemplatesOverview({ overview }: { overview: QcConfigOverview }) {
  return (
    <PageSurface
      kind="detail"
      embedded
      blocks={[
        createPageDataBlock("qc-config-template-metrics", {
          kind: "metrics",
          metrics: [
            { key: "recordTemplates", label: "记录模板 YAML", value: overview.recordTemplates.length },
            { key: "methods", label: "方法 YAML", value: overview.methods.length },
            { key: "methodFields", label: "方法字段", value: overview.methods.reduce((sum, method) => sum + method.fieldCount, 0) },
            { key: "layoutMappings", label: "布局映射 JSON", value: overview.layoutMapping.assignmentCount },
          ],
        }),
        createGroupBlock("qc-config-template-tables", {
          layout: "grid",
          blocks: [
            createPageTableBlock<RecordTemplateOverview>("qc-config-record-templates", {
              framed: true,
              title: "记录模板",
              rows: overview.recordTemplates.slice(0, 8),
              columns: [
                {
                  key: "template",
                  label: "模板",
                  required: true,
                  cell: (template) => (
                  <Link
                    key={template.id}
                    href={`/production/qc-templates/${template.id}`}
                    className="block px-4 py-3 transition hover:bg-slate-50"
                  >
                    <div className="text-sm font-medium text-slate-900">{template.productName}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {template.stageCount} 个阶段 · {template.itemCount} 个检测项 · {template.fileName}
                    </div>
                  </Link>
                  ),
                },
              ],
              rowKey: (template) => template.id,
              emptyText: "暂无记录模板。",
            }),
            createPageTableBlock<LayoutMappingSample>("qc-config-layout-mapping-samples", {
              framed: true,
              title: "布局映射样本",
              rows: overview.layoutMapping.samples,
              columns: [
                {
                  key: "sample",
                  label: "映射",
                  required: true,
                  cell: (sample) => (
                  <div key={sample.key} className="px-4 py-3">
                    <div className="break-all text-sm font-medium text-slate-900">{sample.key}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {sample.templateId} · {sample.status}{sample.sourceRef ? ` · ${sample.sourceRef}` : ""}
                    </div>
                  </div>
                  ),
                },
              ],
              rowKey: (sample) => sample.key,
              emptyText: "暂无布局映射样本。",
            }),
          ],
        }),
      ]}
    />
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
