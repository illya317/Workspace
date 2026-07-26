"use client";

import { useEffect, type ReactNode } from "react";

export function FormulaHelpDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center bg-slate-950/35 px-4 py-16 backdrop-blur-[1px]" onMouseDown={onClose}>
      <section className="w-full max-w-4xl overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="公式说明">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-slate-50 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-950">公式说明</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">公式可引用 x、y、z、p 编号，函数名不区分大小写；中文括号、中文逗号会自动转成英文符号。</p>
          </div>
          <button type="button" className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded border border-transparent text-slate-500 hover:border-slate-200 hover:bg-white hover:text-slate-900" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>
        <div className="max-h-[72vh] overflow-auto px-5 py-4 text-sm text-slate-700">
          <FormulaAliasGuide />
          <div className="grid gap-4 md:grid-cols-2">
            <FormulaHelpGroup title="统计">
              <FormulaHelpItem formula="AVG(a, b, ...)" text="平均值；也可写 AVERAGE 或 MEAN" />
              <FormulaHelpItem formula="SD(a, b, ...)" text="样本标准差；至少 2 个参数，也可写 STDEV" />
              <FormulaHelpItem formula="RSD(a, b, ...)" text="相对标准偏差，SD / AVG * 100" />
              <FormulaHelpItem formula="RD(a, b, ...)" text="相对差异，(最大值 - 最小值) / 平均值 * 100" />
            </FormulaHelpGroup>
            <FormulaHelpGroup title="数值">
              <FormulaHelpItem formula="ABS(a)" text="绝对值" />
              <FormulaHelpItem formula="SQRT(a)" text="平方根" />
              <FormulaHelpItem formula="ROUND(a, n)" text="按 n 位小数四舍五入" />
              <FormulaHelpItem formula="MAX(a, b, ...)" text="最大值" />
              <FormulaHelpItem formula="MIN(a, b, ...)" text="最小值" />
            </FormulaHelpGroup>
          </div>
          <div className="mt-4 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
            简单加减乘除直接写 <code className="font-mono">x1-x2</code>、<code className="font-mono">x1/x2</code> 这类表达式即可；统计函数只接受输入编号，例如 <code className="font-mono">x1</code>、<code className="font-mono">y1</code>、<code className="font-mono">z1</code>、<code className="font-mono">p1</code>。
          </div>
        </div>
      </section>
    </div>
  );
}

function FormulaAliasGuide() {
  return (
    <div className="mb-4 rounded border border-slate-200 bg-slate-50">
      <div className="border-b border-slate-200 px-3 py-2 text-xs font-semibold text-slate-950">编号说明</div>
      <div className="grid divide-y divide-slate-200 text-xs md:grid-cols-5 md:divide-x md:divide-y-0">
        <FormulaAliasItem alias="i" title="普通输入" text="只记录展示，不参与公式计算。" />
        <FormulaAliasItem alias="x" title="输入参数" text="用户填写的检测数据，可直接参与公式。" />
        <FormulaAliasItem alias="y" title="输出结果" text="由公式算出的结果，也可被后续公式引用。" />
        <FormulaAliasItem alias="z" title="引用来源" text="引用其他位置或章节已有数据。" />
        <FormulaAliasItem alias="p" title="计算参数" text="数字参数，用于权重、系数、限度比例。" />
      </div>
      <div className="border-t border-slate-200 px-3 py-2 text-xs leading-5 text-slate-600 [&_code]:font-mono [&_code]:font-semibold [&_code]:text-slate-950">
        公式里可直接写 <code>x1</code>、<code>y2</code>、<code>z3</code>、<code>p1</code>。日期或日期+时间只支持 <code>a-b</code> 或 <code>(a-b)</code>，结果按小时差计算。
      </div>
    </div>
  );
}

function FormulaAliasItem({ alias, text, title }: { alias: string; text: string; title: string }) {
  return (
    <div className="px-3 py-2">
      <div className="flex items-center gap-2">
        <code className="inline-flex h-6 min-w-6 items-center justify-center rounded border border-slate-300 bg-white font-serif text-sm font-semibold text-slate-950">{alias}</code>
        <span className="font-semibold text-slate-950">{title}</span>
      </div>
      <p className="mt-2 leading-5 text-slate-600">{text}</p>
    </div>
  );
}

function FormulaHelpGroup({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="rounded border border-slate-200 bg-white">
      <h3 className="border-b border-slate-100 px-3 py-2 text-xs font-semibold text-slate-500">{title}</h3>
      <div className="divide-y divide-slate-100">{children}</div>
    </section>
  );
}

function FormulaHelpItem({ formula, text }: { formula: string; text: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] gap-3 px-3 py-2">
      <code className="break-words font-mono text-xs font-semibold text-slate-950">{formula}</code>
      <span className="text-xs leading-5 text-slate-600">{text}</span>
    </div>
  );
}
