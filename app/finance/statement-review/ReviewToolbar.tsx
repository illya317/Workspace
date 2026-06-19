"use client";

import Link from "next/link";
import { PanelCard } from "@workspace/core/ui";

interface Props {
  wp: { id: number } | null;
  rv: { status: string; isStale?: boolean } | null;
  changedCount: number;
  saving: boolean;
  loading: boolean;
  isReadOnly: boolean;
  co: string; yr: string; mo: string; rt: string;
  onGenerate: () => void;
  onSave: () => void;
  onConfirm: () => void;
}

export default function ReviewToolbar({ wp, rv, changedCount, saving, loading, isReadOnly, co, yr, mo, rt, onGenerate, onSave, onConfirm }: Props) {
  return (
    <>
      {wp && (
        <PanelCard bodyClassName="flex items-center gap-3 px-4 py-3">
          <span className="text-xs text-gray-500">底稿已加载{!wp.id ? "（空草稿，请先在底稿页录入数据）" : ""}</span>
          {wp.id > 0 && !rv && <button onClick={onGenerate} disabled={loading} className="rounded bg-blue-600 px-3 py-1.5 text-xs text-white hover:bg-blue-700 disabled:opacity-50">生成校对</button>}
          {wp.id > 0 && rv?.isStale && <button onClick={onGenerate} disabled={loading} className="rounded bg-blue-600 px-3 py-1.5 text-xs text-white hover:bg-blue-700 disabled:opacity-50">重新生成校对</button>}
          {rv && <span className="text-xs text-gray-500">校对状态：<b className={rv.status === "confirmed" && rv.isStale ? "text-amber-600" : rv.status === "confirmed" ? "text-emerald-600" : "text-blue-600"}>{rv.status === "confirmed" && rv.isStale ? "已过期" : rv.status === "confirmed" ? "已确认" : "草稿"}</b></span>}
          {rv && changedCount > 0 && <button onClick={onSave} disabled={saving || isReadOnly} className="rounded bg-emerald-600 px-3 py-1.5 text-xs text-white hover:bg-emerald-700 disabled:opacity-50">保存修改 ({changedCount})</button>}
          {rv && rv.status !== "confirmed" && <button onClick={onConfirm} disabled={saving || changedCount > 0} className="rounded bg-purple-600 px-3 py-1.5 text-xs text-white hover:bg-purple-700 disabled:opacity-50">确认校对</button>}
        </PanelCard>
      )}

      {rv?.status === "confirmed" && !rv.isStale && (
        <PanelCard className="border-emerald-200 bg-emerald-50" bodyClassName="flex items-center justify-between px-4 py-3">
          <span className="text-sm text-emerald-700">✅ 校对已确认</span>
          <Link
            href={`/finance/statements?companyCode=${co}&year=${yr}&month=${mo}&reportType=${rt === "incomeStatement" ? "income" : "cashflow"}`}
            className="rounded bg-emerald-600 px-3 py-1.5 text-xs text-white hover:bg-emerald-700"
          >
            前往财务报表查看最终结果 →
          </Link>
        </PanelCard>
      )}
    </>
  );
}
