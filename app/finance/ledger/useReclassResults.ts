"use client";

import { useEffect, useState, useCallback } from "react";
import type { ReclassResultRow } from "@/server/services/finance/ledger/reclass-results/types";

const PAGE_SIZE = 200;

export function useReclassResults(companyCode: string, year: string, month: string, showToast: (msg: string, type?: "error") => void) {
  const [reclassMap, setReclassMap] = useState<Map<number, ReclassResultRow>>(new Map());
  const [generating, setGenerating] = useState(false);

  async function lookupPeriodId(): Promise<number | null> {
    const pRes = await fetch(`/api/finance/reclass-results/lookup-period?companyCode=${companyCode}&year=${year}&month=${month}`);
    const { periodId } = await pRes.json();
    return periodId || null;
  }

  const loadReclassResults = useCallback(async () => {
    if (!companyCode || !year || !month) { setReclassMap(new Map()); return; }
    try {
      const periodId = await lookupPeriodId();
      if (!periodId) { setReclassMap(new Map()); return; }
      // Loop-fetch all pages (API caps at 200/page)
      const map = new Map<number, ReclassResultRow>();
      let page = 1;
      while (true) {
        const rRes = await fetch(`/api/finance/reclass-results?periodId=${periodId}&status=all&page=${page}&pageSize=${PAGE_SIZE}`);
        if (!rRes.ok) break;
        const data = await rRes.json();
        for (const r of (data.items || [])) map.set(r.voucherItemId, r);
        if (data.items.length < PAGE_SIZE || map.size >= data.total) break;
        page++;
      }
      setReclassMap(map);
    } catch { /* ignore */ }
  }, [companyCode, year, month]);

  useEffect(() => { loadReclassResults(); }, [loadReclassResults]);

  // ── Review ──────────────────────────────────────────

  async function handleReview(resultId: number, action: "approve" | "reject" | "adjust", body?: Record<string, unknown>) {
    const res = await fetch(`/api/finance/reclass-results/${resultId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...body }),
    });
    if (res.ok) {
      const data = await res.json();
      const item = data.item as ReclassResultRow;
      showToast(action === "approve" ? "已通过" : action === "reject" ? "已驳回" : "已调整");
      setReclassMap((prev) => {
        const next = new Map(prev);
        next.set(item.voucherItemId, item);
        return next;
      });
    } else {
      const err = await res.json().catch(() => ({}));
      showToast(err.error || "操作失败", "error");
    }
  }

  // ── Batch 6: Generate ───────────────────────────────

  async function handleGenerate() {
    setGenerating(true);
    try {
      const periodId = await lookupPeriodId();
      if (!periodId) { showToast("期间不存在", "error"); setGenerating(false); return; }
      const res = await fetch("/api/finance/reclass-results", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodId, dryRun: false }),
      });
      if (res.ok) {
        const data = await res.json();
        showToast(`生成完成：写入 ${data.written} 条，跳过 ${data.skippedNonPending ?? 0} 条已审核，${data.noRule} 无规则，${data.noEntity} 无实体`);
        await loadReclassResults(); // refresh after generate
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || "生成失败", "error");
      }
    } catch { showToast("网络错误", "error"); }
    setGenerating(false);
  }

  return { reclassMap, handleReview, generating, handleGenerate };
}
