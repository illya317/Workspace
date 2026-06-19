import type { QcTemplateDetail, QcTemplateStage, QcTemplateTestItem } from "@workspace/production/server/qc";

interface Props {
  detail: QcTemplateDetail;
}

function fieldCount(test: QcTemplateTestItem) {
  return test.methodGroups.reduce((sum, group) => sum + group.fields.length, 0);
}

function StatusPill({ value }: { value?: string }) {
  if (!value) return <span className="text-xs text-slate-400">未映射</span>;
  const tone = value === "pilot" ? "bg-cyan-50 text-cyan-700" : "bg-slate-100 text-slate-600";
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>{value}</span>;
}

function MethodFields({ test }: { test: QcTemplateTestItem }) {
  if (test.methodGroups.length === 0) {
    return <div className="text-xs text-slate-400">未找到方法字段</div>;
  }

  return (
    <div className="space-y-2">
      {test.methodGroups.map((group) => (
        <div key={`${test.englishName}-${group.name}`}>
          <div className="text-xs font-medium text-slate-500">{group.name}</div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {group.fields.map((field) => (
              <span
                key={`${group.name}-${field.name}`}
                className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700"
                title={field.formula}
              >
                {field.name}{field.unit ? ` / ${field.unit}` : ""}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function TestItem({ test }: { test: QcTemplateTestItem }) {
  return (
    <div className="border-b border-slate-100 px-4 py-4 last:border-b-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-900">
            {test.sequence} {test.name}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {test.englishName} · {test.methodName || "未配置方法"} · {fieldCount(test)} 个字段
          </div>
        </div>
        <StatusPill value={test.layout?.status} />
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(280px,1.2fr)]">
        <div className="space-y-2 text-xs text-slate-600">
          <div>
            <span className="font-medium text-slate-700">标准：</span>
            {test.standardText || "未配置"}
          </div>
          <div>
            <span className="font-medium text-slate-700">结论：</span>
            {test.conclusionName || "未配置"}{test.hasNumericConclusion ? "，含数值" : ""}
          </div>
          <div className="break-all">
            <span className="font-medium text-slate-700">组件：</span>
            {test.layout?.templateId || "未映射"}
            {test.layout?.familyId ? ` · ${test.layout.familyId}` : ""}
            {test.layout?.reusedFrom ? ` · 复用 ${test.layout.reusedFrom}` : ""}
          </div>
          <div className="break-all">
            <span className="font-medium text-slate-700">来源：</span>
            {test.layout?.sourceRef || test.methodFile || "未配置"}
          </div>
        </div>
        <MethodFields test={test} />
      </div>
    </div>
  );
}

function StageSection({ stage }: { stage: QcTemplateStage }) {
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-slate-900">{stage.label}</h2>
          <div className="text-xs text-slate-500">
            {stage.documentCount} 份文件 · {stage.precheckItemCount} 个确认项 · {stage.tests.length} 个检测项
          </div>
        </div>
      </div>
      <div>{stage.tests.map((test) => <TestItem key={`${stage.key}-${test.sequence}-${test.englishName}`} test={test} />)}</div>
    </section>
  );
}

export default function QcTemplateDetailPanel({ detail }: Props) {
  const totalTests = detail.stages.reduce((sum, stage) => sum + stage.tests.length, 0);
  const totalFields = detail.stages.reduce((sum, stage) => sum + stage.tests.reduce((stageSum, test) => stageSum + fieldCount(test), 0), 0);

  return (
    <section className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
          <p className="text-xs text-slate-500">阶段</p>
          <p className="mt-1 text-xl font-semibold text-slate-900">{detail.stages.length}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
          <p className="text-xs text-slate-500">检测项</p>
          <p className="mt-1 text-xl font-semibold text-slate-900">{totalTests}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
          <p className="text-xs text-slate-500">方法字段</p>
          <p className="mt-1 text-xl font-semibold text-slate-900">{totalFields}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
          <p className="text-xs text-slate-500">布局映射</p>
          <p className="mt-1 text-xl font-semibold text-slate-900">{detail.layoutAssignmentCount}</p>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-xs text-slate-500">
        <span>{detail.fileName} · {detail.source.configRoot}</span>
      </div>

      {detail.stages.map((stage) => <StageSection key={stage.key} stage={stage} />)}
    </section>
  );
}
