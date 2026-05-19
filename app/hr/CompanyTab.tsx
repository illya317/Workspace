"use client";

import { useEffect, useState } from "react";

interface CompanyInfo {
  id: number;
  code: string;
  name: string;
  fullName?: string | null;
  registeredCapital?: string | null;
  unifiedCode?: string | null;
  bankName?: string | null;
  registeredAddress?: string | null;
  registeredDate?: string | null;
  legalPerson?: string | null;
}

interface RelationInfo {
  id: number;
  parent: { name: string };
  child: { name: string };
  shareRatio?: number | null;
  isConsolidated: boolean;
}

export default function CompanyTab() {
  const [companies, setCompanies] = useState<CompanyInfo[]>([]);
  const [relations, setRelations] = useState<RelationInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const res = await fetch("/api/admin/company-codes");
      if (res.ok) {
        const data = await res.json();
        setCompanies(data.companies || []);
      }
      const relRes = await fetch("/api/admin/company-relations");
      if (relRes.ok) {
        const data = await relRes.json();
        setRelations(data.relations || []);
      }
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return <p className="p-8 text-center text-gray-500">加载中...</p>;

  return (
    <div className="space-y-6">
      {/* 公司列表 */}
      <div className="overflow-x-auto rounded-lg bg-white shadow-sm">
        <table className="w-full text-xs">
          <thead className="border-b bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-gray-600">编码</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600">简称</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600">全称</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600">法定代表人</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600">注册资本</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600">注册时间</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600">办公地址</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600">统一代码</th>
            </tr>
          </thead>
          <tbody>
            {companies.map((c) => (
              <tr key={c.id} className="border-b last:border-0 hover:bg-gray-50">
                <td className="px-3 py-2 font-mono text-gray-500">{c.code}</td>
                <td className="px-3 py-2 font-medium text-gray-700">{c.name}</td>
                <td className="px-3 py-2 text-gray-600">{c.fullName || "-"}</td>
                <td className="px-3 py-2 text-gray-600">{c.legalPerson || "-"}</td>
                <td className="px-3 py-2 text-gray-600">{c.registeredCapital || "-"}</td>
                <td className="px-3 py-2 text-gray-600">{c.registeredDate || "-"}</td>
                <td className="px-3 py-2 text-gray-600 max-w-xs truncate">{c.registeredAddress || "-"}</td>
                <td className="px-3 py-2 font-mono text-gray-500 text-xs">{c.unifiedCode || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 持股关系 */}
      {relations.length > 0 && (
        <div className="rounded-lg bg-white shadow-sm p-4">
          <h3 className="text-sm font-medium text-gray-700 mb-3">股权结构</h3>
          <div className="space-y-2">
            {relations.map((r) => (
              <div key={r.id} className="flex items-center gap-2 text-sm text-gray-600">
                <span className="font-medium text-gray-700">{r.parent.name}</span>
                <span className="text-gray-400">→</span>
                <span>{r.shareRatio ? `${r.shareRatio}%` : "—"}</span>
                <span className="text-gray-400">→</span>
                <span className="font-medium text-gray-700">{r.child.name}</span>
                {r.isConsolidated && (
                  <span className="text-xs bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">并表</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
