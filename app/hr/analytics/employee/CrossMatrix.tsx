"use client";

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

  return (
    <div className="bg-white rounded-lg shadow-sm p-5">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">交叉分析</h3>
      <div className="flex items-center gap-4 mb-4">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">行：</span>
          <select
            value={crossRow}
            onChange={(e) => setCrossRow(e.target.value as DimKey)}
            className="px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:border-emerald-400"
          >
            {featureList.map((f) => (
              <option key={f} value={f} disabled={f === crossCol}>{DIM_LABELS[f]}</option>
            ))}
          </select>
        </div>
        <span className="text-xs text-gray-300">&times;</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">列：</span>
          <select
            value={crossCol}
            onChange={(e) => setCrossCol(e.target.value as DimKey)}
            className="px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:border-emerald-400"
          >
            {featureList.map((f) => (
              <option key={f} value={f} disabled={f === crossRow}>{DIM_LABELS[f]}</option>
            ))}
          </select>
        </div>
        <span className="text-xs text-gray-400">共 {statsActive} 人</span>
      </div>

      {crossMatrix.rowKeys.length === 0 ? (
        <p className="text-xs text-gray-400 py-4">无数据</p>
      ) : (
        <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 bg-white">
              <tr>
                <th className="text-left py-2 px-2 border-b font-medium text-gray-600 sticky left-0 bg-white">
                  {DIM_LABELS[crossRow]} \ {DIM_LABELS[crossCol]}
                </th>
                {crossMatrix.colKeys.map((ck) => (
                  <th key={ck} className="text-center py-2 px-2 border-b font-medium text-gray-600 whitespace-nowrap">{ck}</th>
                ))}
                <th className="text-center py-2 px-2 border-b font-medium text-gray-500 bg-gray-50">合计</th>
              </tr>
            </thead>
            <tbody>
              {crossMatrix.rowKeys.map((rk) => (
                <tr key={rk} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="py-2 px-2 font-medium text-gray-700 sticky left-0 bg-white whitespace-nowrap">{rk}</td>
                  {crossMatrix.colKeys.map((ck) => {
                    const v = crossMatrix.matrix[rk]?.[ck] || 0;
                    return (
                      <td key={ck} className={`text-center py-2 px-2 ${heatColor(v, crossMax)}`}>
                        {v > 0 ? v : "—"}
                      </td>
                    );
                  })}
                  <td className="text-center py-2 px-2 font-medium bg-gray-50 text-gray-700">{crossMatrix.rowTotals[rk] || 0}</td>
                </tr>
              ))}
              {/* 列合计 */}
              <tr className="border-t-2 border-gray-200 bg-gray-50 font-medium">
                <td className="py-2 px-2 text-gray-700 sticky left-0 bg-gray-50">合计</td>
                {crossMatrix.colKeys.map((ck) => (
                  <td key={ck} className="text-center py-2 px-2 text-gray-700">{crossMatrix.colTotals[ck] || 0}</td>
                ))}
                <td className="text-center py-2 px-2 text-gray-700">{statsActive}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
