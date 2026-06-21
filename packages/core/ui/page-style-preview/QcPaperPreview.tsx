"use client";

import { usePageStylePreviewSamples } from "./sample-context";

type QcPaperPreviewMode = "record" | "template";

export default function QcPaperPreview({ mode }: { mode: QcPaperPreviewMode }) {
  const { qcPaper } = usePageStylePreviewSamples();
  const cellClass = "border border-slate-900 px-3 py-3 text-center text-sm text-slate-800";
  const rows = mode === "template" ? qcPaper.templateRows : qcPaper.rows;

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="mx-auto max-w-4xl bg-white p-5 shadow-sm">
        <h3 className="mb-4 text-center text-base font-semibold text-slate-950">{qcPaper.title}</h3>
        <table className="w-full border-collapse">
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={`row-${rowIndex}`}>
                {row.map((cell, cellIndex) => <td key={`cell-${rowIndex}-${cellIndex}`} className={cellClass}>{cell}</td>)}
              </tr>
            ))}
            <tr>
              <td className={cellClass}>检验依据</td>
              <td className={`${cellClass} text-left`} colSpan={3}>
                {qcPaper.basis}
              </td>
            </tr>
          </tbody>
        </table>
        <div className="mt-4 border border-slate-900 py-3 text-center text-sm text-slate-800">{qcPaper.sectionLabel}</div>
      </div>
    </div>
  );
}
