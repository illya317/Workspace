"use client";

import { PreviewResult } from "./types";

interface ImportPreviewProps {
  preview: PreviewResult;
  importing: boolean;
  typeLabel: string;
  onConfirm: () => void;
}

export default function ImportPreview({
  preview,
  importing,
  typeLabel,
  onConfirm,
}: ImportPreviewProps) {
  return (
    <div className="rounded-lg bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-800">
            预览：{typeLabel}（{preview.year}年）
          </h3>
          <p className="text-sm text-gray-500">
            共 {preview.rows} 行原始数据，解析出 {preview.accounts.length} 个科目
            {preview.balances && `，${preview.balances.length} 条余额`}
            {preview.vouchers && `，${preview.vouchers.length} 张凭证`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {preview.errors.length === 0 && (
            <button
              onClick={onConfirm}
              disabled={importing}
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:bg-gray-300"
            >
              {importing ? "导入中..." : "确认导入"}
            </button>
          )}
        </div>
      </div>

      {/* Errors & Warnings */}
      {preview.errors.length > 0 && (
        <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
          <p className="font-medium">错误（{preview.errors.length}）：</p>
          <ul className="mt-1 list-disc pl-5">
            {preview.errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}
      {preview.warnings.length > 0 && (
        <div className="mb-4 rounded-md bg-yellow-50 p-3 text-sm text-yellow-700">
          <p className="font-medium">警告（{preview.warnings.length}）：</p>
          <ul className="mt-1 list-disc pl-5">
            {preview.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Accounts Table */}
      <div className="mb-4">
        <h4 className="mb-2 text-sm font-semibold text-gray-700">科目列表</h4>
        <div className="max-h-64 overflow-auto rounded-md border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-gray-600">编码</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">名称</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">父级</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">类别</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">余额方向</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {preview.accounts.map((acc) => (
                <tr key={acc.code} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-mono text-gray-700">{acc.code}</td>
                  <td className="px-3 py-2 text-gray-700">{acc.name}</td>
                  <td className="px-3 py-2 text-gray-500">{acc.parentCode || "—"}</td>
                  <td className="px-3 py-2 text-gray-500">{acc.category}</td>
                  <td className="px-3 py-2 text-gray-500">{acc.balanceDirection}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Balance Preview */}
      {preview.balances && preview.balances.length > 0 && (
        <div className="mb-4">
          <h4 className="mb-2 text-sm font-semibold text-gray-700">余额预览（前20条）</h4>
          <div className="max-h-64 overflow-auto rounded-md border border-gray-200">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">科目</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-600">期初借</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-600">期初贷</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-600">本期借</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-600">本期贷</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-600">期末借</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-600">期末贷</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {preview.balances.slice(0, 20).map((b) => (
                  <tr key={b.accountCode} className="hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-700">
                      <span className="font-mono">{b.accountCode}</span> {b.accountName}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-600">{b.openingDebit.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{b.openingCredit.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{b.currentDebit.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{b.currentCredit.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{b.closingDebit.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{b.closingCredit.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.balances.length > 20 && (
            <p className="mt-1 text-xs text-gray-400">还有 {preview.balances.length - 20} 条未显示</p>
          )}
        </div>
      )}

      {/* Voucher Preview */}
      {preview.vouchers && preview.vouchers.length > 0 && (
        <div className="mb-4">
          <h4 className="mb-2 text-sm font-semibold text-gray-700">凭证预览（前10张）</h4>
          <div className="max-h-96 overflow-auto space-y-3">
            {preview.vouchers.slice(0, 10).map((v) => (
              <div key={v.voucherNo} className="rounded-md border border-gray-200">
                <div className="flex items-center justify-between bg-gray-50 px-3 py-2">
                  <span className="font-medium text-gray-700">{v.voucherNo}</span>
                  <span className="text-xs text-gray-500">{v.date}</span>
                  <span className="text-xs text-gray-500">借 {v.totalDebit.toFixed(2)} / 贷 {v.totalCredit.toFixed(2)}</span>
                </div>
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-gray-100">
                    {v.items.map((item, idx) => (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="px-3 py-1.5 text-gray-600">{item.accountCode} {item.accountName}</td>
                        <td className="px-3 py-1.5 text-gray-500">{item.description}</td>
                        <td className="px-3 py-1.5 text-right text-gray-600">{item.debit > 0 ? item.debit.toFixed(2) : ""}</td>
                        <td className="px-3 py-1.5 text-right text-gray-600">{item.credit > 0 ? item.credit.toFixed(2) : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
          {preview.vouchers.length > 10 && (
            <p className="mt-1 text-xs text-gray-400">还有 {preview.vouchers.length - 10} 张未显示</p>
          )}
        </div>
      )}
    </div>
  );
}
