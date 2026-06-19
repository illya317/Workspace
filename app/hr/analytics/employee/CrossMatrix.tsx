"use client";

import { AnalysisBlock, SelectField } from "@workspace/core/ui";
import type { DimKey } from "./constants";
import { DIM_LABELS } from "./constants";
import type { CrossMatrixData } from "./useEmployeeData";

function heatColor(v: number, max: number): string {
  if (max === 0) return "bg-gray-50";
  const ratio = v / max;
  if (ratio === 0) return "bg-gray-50";
  if (ratio < 0.15) return "bg-blue-100";
  if (ratio < 0.3) return "bg-blue-200";
  if (ratio < 0.5) return "bg-blue-300";
  if (ratio < 0.7) return "bg-blue-400 text-white";
  return "bg-blue-600 text-white";
}

export default function CrossMatrix({
  crossMatrix,
  crossRow,
  crossCol,
  statsActive,
  featureList,
  setCrossRow,
  setCrossCol,
}: {
  crossMatrix: CrossMatrixData;
  crossRow: DimKey;
  crossCol: DimKey;
  statsActive: number;
  featureList: DimKey[];
  setCrossRow: (v: DimKey) => void;
  setCrossCol: (v: DimKey) => void;
}) {
  const crossMax = Math.max(0, ...Object.values(crossMatrix.rowTotals));
  const rowOptions = featureList
    .filter((feature) => feature !== crossCol)
    .map((feature) => ({ value: feature, label: DIM_LABELS[feature] }));
  const colOptions = featureList
    .filter((feature) => feature !== crossRow)
    .map((feature) => ({ value: feature, label: DIM_LABELS[feature] }));

  return (
    <AnalysisBlock
      title="交叉分析"
      toolbar={
        <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <SelectField
            label="行："
            value={crossRow}
            onChange={(value) => setCrossRow(value as DimKey)}
            options={rowOptions}
            selectClassName="min-h-7 w-28"
          />
        </div>
        <span className="text-xs text-gray-300">&times;</span>
        <div className="flex items-center gap-2">
          <SelectField
            label="列："
            value={crossCol}
            onChange={(value) => setCrossCol(value as DimKey)}
            options={colOptions}
            selectClassName="min-h-7 w-28"
          />
        </div>
        <span className="text-xs text-gray-400">共 {statsActive} 人</span>
        </div>
      }
    >

      {crossMatrix.rowKeys.length === 0 ? (
        <p className="text-xs text-gray-400 py-4">无数据</p>
      ) : (
        <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
          <table className="min-w-full border-collapse text-left text-sm">
            <thead className="sticky top-0 bg-slate-50 text-slate-500">
              <tr>
                <th className="sticky left-0 border-b border-slate-200 bg-slate-50 px-4 py-3 font-medium">
                  {DIM_LABELS[crossRow]} \ {DIM_LABELS[crossCol]}
                </th>
                {crossMatrix.colKeys.map((ck) => (
                  <th key={ck} className="whitespace-nowrap border-b border-slate-200 px-4 py-3 text-center font-medium">{ck}</th>
                ))}
                <th className="border-b border-slate-200 bg-slate-100 px-4 py-3 text-center font-medium">合计</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-800">
              {crossMatrix.rowKeys.map((rk) => (
                <tr key={rk} className="hover:bg-emerald-50/20">
                  <td className="sticky left-0 whitespace-nowrap bg-white px-4 py-3 font-medium text-slate-800">{rk}</td>
                  {crossMatrix.colKeys.map((ck) => {
                    const v = crossMatrix.matrix[rk]?.[ck] || 0;
                    return (
                      <td key={ck} className={`px-4 py-3 text-center ${heatColor(v, crossMax)}`}>
                        {v > 0 ? v : "—"}
                      </td>
                    );
                  })}
                  <td className="bg-slate-50 px-4 py-3 text-center font-medium text-slate-800">{crossMatrix.rowTotals[rk] || 0}</td>
                </tr>
              ))}
              {/* 列合计 */}
              <tr className="border-t border-slate-200 bg-slate-50 font-medium">
                <td className="sticky left-0 bg-slate-50 px-4 py-3 text-slate-800">合计</td>
                {crossMatrix.colKeys.map((ck) => (
                  <td key={ck} className="px-4 py-3 text-center text-slate-800">{crossMatrix.colTotals[ck] || 0}</td>
                ))}
                <td className="px-4 py-3 text-center text-slate-800">{statsActive}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </AnalysisBlock>
  );
}
