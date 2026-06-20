"use client";

type QcPaperPreviewMode = "record" | "template";

export default function QcPaperPreview({ mode }: { mode: QcPaperPreviewMode }) {
  const templateMode = mode === "template";
  const cellClass = "border border-slate-900 px-3 py-3 text-center text-sm text-slate-800";
  const rows = [
    ["检品名称", "阿奇霉素胶囊(中间体)", "包装情况", "桶、塑料袋"],
    ["检验目的", "水分、含量", "检品数量", templateMode ? "i" : "12"],
    ["请验部门", "固体制剂车间", "请验日期", templateMode ? "date" : "2026 年 06 月 20 日"],
    ["检验日期", templateMode ? "date" : "2026 年 06 月 20 日", "报告日期", templateMode ? "date" : "2026 年 06 月 20 日"],
  ];

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="mx-auto max-w-4xl bg-white p-5 shadow-sm">
        <h3 className="mb-4 text-center text-base font-semibold text-slate-950">一、阿奇霉素胶囊中间体</h3>
        <table className="w-full border-collapse">
          <tbody>
            {rows.map((row) => (
              <tr key={row.join("-")}>
                {row.map((cell) => <td key={cell} className={cellClass}>{cell}</td>)}
              </tr>
            ))}
            <tr>
              <td className={cellClass}>检验依据</td>
              <td className={`${cellClass} text-left`} colSpan={3}>
                《阿奇霉素胶囊中间体质量标准》（MQS074026）、《阿奇霉素胶囊中间体检验标准操作规程》（SOP073426）
              </td>
            </tr>
          </tbody>
        </table>
        <div className="mt-4 border border-slate-900 py-3 text-center text-sm text-slate-800">1.1 文件</div>
      </div>
    </div>
  );
}
