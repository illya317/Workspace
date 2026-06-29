import type { QcTemplateDetail, QcTemplateStage, QcTemplateTestItem } from "@workspace/production/server/qc";
import { createBlockSurfaceSection, createPageBody, createPageDataSection, type DataSurfaceCellSpec, type DataSurfaceColumnSpec, type DataSurfaceTableProps, PageSurface } from "@workspace/core/ui";

interface Props {
  detail: QcTemplateDetail;
}

function fieldCount(test: QcTemplateTestItem) {
  return test.methodGroups.reduce((sum, group) => sum + group.fields.length, 0);
}

function statusCell(value?: string): DataSurfaceCellSpec {
  if (!value) return { kind: "empty", content: "未映射",  };
  return { kind: "badge", label: value, tone: value === "pilot" ? "sky" : "slate" };
}

function MethodFields({ test }: { test: QcTemplateTestItem }) {
  if (test.methodGroups.length === 0) {
    return <div className="py-4 text-xs text-slate-400">未找到方法字段</div>;
  }

  return (
    <div className="space-y-2">
      {test.methodGroups.map((group) => (
        <div key={`${test.englishName}-${group.name}`}>
          <div className="text-xs font-medium text-slate-500">{group.name}</div>
          <ul className="mt-1 flex flex-wrap gap-x-2 gap-y-1">
            {group.fields.map((field) => (
              <li
                key={`${group.name}-${field.name}`}
                className="text-xs text-slate-700"
                title={field.formula}
              >
                {field.name}{field.unit ? ` / ${field.unit}` : ""}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function TestItem({ test }: { test: QcTemplateTestItem }) {
  return (
    <div className="border-b border-slate-100 px-4 py-4 last:border-b-0">
      <div className="flex flex-wrap items-start gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-900">
            {test.sequence} {test.name}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {test.englishName} · {test.methodName || "未配置方法"} · {fieldCount(test)} 个字段
          </div>
        </div>
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

function createStageSurface(stage: QcTemplateStage): DataSurfaceTableProps<QcTemplateTestItem> {
  const columns: DataSurfaceColumnSpec<QcTemplateTestItem>[] = [
    {
      key: "test",
      label: "检测项",
      required: true,
      cell: (test) => <TestItem test={test} />,
    },
    {
      key: "layoutStatus",
      label: "布局",
      required: true,
      wrap: "nowrap",
      cell: (test) => statusCell(test.layout?.status),
    },
  ];

  return {
    kind: "table",
    framed: true,
    title: stage.label,
    subtitle: `${stage.documentCount} 份文件 · ${stage.precheckItemCount} 个确认项 · ${stage.tests.length} 个检测项`,
    rows: stage.tests,
    columns,
    rowKey: (test) => `${stage.key}-${test.sequence}-${test.englishName}`,
    emptyText: "暂无检测项。",
  };
}

export default function QcTemplateDetailPanel({ detail }: Props) {
  const totalTests = detail.stages.reduce((sum, stage) => sum + stage.tests.length, 0);
  const totalFields = detail.stages.reduce((sum, stage) => sum + stage.tests.reduce((stageSum, test) => stageSum + fieldCount(test), 0), 0);

  return <PageSurface kind="standard"
    embedded
    body={createPageBody([
      createPageDataSection("template-metrics", {
          kind: "metrics",
          metrics: [
            { key: "stages", label: "阶段", value: detail.stages.length },
            { key: "tests", label: "检测项", value: totalTests },
            { key: "fields", label: "方法字段", value: totalFields },
            { key: "layoutAssignments", label: "布局映射", value: detail.layoutAssignmentCount },
          ],
        }),
      createBlockSurfaceSection("template-source", {
        kind: "message",
        tone: "muted",

        content: `${detail.fileName} · ${detail.source.configRoot}`
      }),
      ...detail.stages.map((stage) => ({
        kind: "data" as const,
        key: stage.key,
        surface: createStageSurface(stage),
      })),
    ])}
  />;
}
