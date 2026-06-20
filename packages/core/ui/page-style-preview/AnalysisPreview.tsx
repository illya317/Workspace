import { AnalysisBlock, MetricCard } from "../BaseCards";
import StatusBadge from "../StatusBadge";

const metrics = [
  { label: "本月新增", value: "28" },
  { label: "完成率", value: "96%" },
  { label: "风险项", value: "3" },
  { label: "同比", value: "+12%" },
];

function MiniChart() {
  const bars = [48, 64, 40, 80, 56, 96, 72];
  return (
    <div className="flex h-32 items-end gap-2 rounded-lg border border-slate-200 bg-slate-50 p-4">
      {bars.map((height, index) => (
        <div key={index} className="w-full rounded-t bg-emerald-500/80" style={{ height }} />
      ))}
    </div>
  );
}

export default function AnalysisPreview({ activeChild }: { activeChild: string }) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-4">
        {metrics.map((metric) => (
          <MetricCard key={metric.label} label={metric.label} value={metric.value} />
        ))}
      </div>
      <div className="grid gap-3 lg:grid-cols-[2fr_1fr]">
        <AnalysisBlock title="趋势分析" subtitle={`当前视图：${activeChild}`} bodyClassName="p-4">
          <MiniChart />
        </AnalysisBlock>
        <AnalysisBlock title="预警摘要" bodyClassName="space-y-3 p-4">
          {["合同即将到期", "资料缺失", "审批滞留"].map((item, index) => (
            <div key={item} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
              <span className="font-medium text-slate-700">{item}</span>
              <StatusBadge label={`${index + 1} 项`} variant={index === 0 ? "yellow" : "gray"} />
            </div>
          ))}
        </AnalysisBlock>
      </div>
      <AnalysisBlock title="交叉表" bodyClassName="p-0">
        <div className="grid grid-cols-4 border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-500">
          <span>维度</span>
          <span>当前</span>
          <span>上期</span>
          <span>变化</span>
        </div>
        {["生产", "质量", "行政"].map((name) => (
          <div key={name} className="grid grid-cols-4 border-b border-slate-100 px-4 py-2 text-sm last:border-0">
            <span className="font-medium text-slate-900">{name}</span>
            <span>128</span>
            <span>116</span>
            <span className="text-emerald-700">+10%</span>
          </div>
        ))}
      </AnalysisBlock>
    </div>
  );
}
