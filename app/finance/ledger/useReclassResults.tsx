"use client";

import { useEffect, useState, useCallback } from "react";
import type { ReclassResultRow } from "@/server/services/finance/ledger/reclass-results/types";
import ReclassReviewModal from "../components/ReclassReviewModal";

const PAGE_SIZE = 200;

export function useReclassResults(companyCode: string, year: string, month: string, showToast: (msg: string, type?: "error") => void) {
  const [reclassMap, setReclassMap] = useState<Map<number, ReclassResultRow>>(new Map());
  const [allItems, setAllItems] = useState<ReclassResultRow[]>([]);
  const [adjustItem, setAdjustItem] = useState<ReclassResultRow | null>(null);

  async function lookupPeriodId(): Promise<number | null> {
    const pRes = await fetch(`/api/finance/reclass-results/lookup-period?companyCode=${companyCode}&year=${year}&month=${month}`);
    const { periodId } = await pRes.json();
    return periodId || null;
  }

  const loadReclassResults = useCallback(async () => {
    if (!companyCode || !year || !month) { setReclassMap(new Map()); setAllItems([]); return; }
    try {
      const periodId = await lookupPeriodId();
      if (!periodId) { setReclassMap(new Map()); setAllItems([]); return; }
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
      // Also load all voucher items for "全部" tab
      await loadAllItemsForPeriod(periodId);
    } catch { /* ignore */ }
  }, [companyCode, year, month]);

  async function loadAllItemsForPeriod(periodId: number) {
    try {
      const res = await fetch(`/api/finance/reclass-results/all-items?periodId=${periodId}`);
      if (!res.ok) return;
      const data = await res.json();
      setAllItems(data.items || []);
    } catch { /* ignore */ }
  }

  useEffect(() => { loadReclassResults(); }, [loadReclassResults]);

  // ── Review ──────────────────────────────────────────

  async function handleReview(resultId: number, action: "approve" | "revert" | "adjust", body?: Record<string, unknown>, extra?: { periodId?: number; voucherItemId?: number; sourceAccount?: string }) {
    const payload: Record<string, unknown> = { action, ...body };
    if (resultId === 0 && extra) {
      payload.periodId = extra.periodId;
      payload.voucherItemId = extra.voucherItemId;
      payload.sourceAccount = extra.sourceAccount;
    }
    const res = await fetch(`/api/finance/reclass-results/${resultId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const data = await res.json();
      const item = data.item as ReclassResultRow;
      showToast(action === "approve" ? "已通过" : action === "revert" ? "已撤回" : "已调整");
      setReclassMap((prev) => {
        const next = new Map(prev);
        if (action === "revert") next.set(item.voucherItemId, item); else next.set(item.voucherItemId, item);
        return next;
      });
    } else {
      const err = await res.json().catch(() => ({}));
      showToast(err.error || "操作失败", "error");
    }
  }

  // ── Batch 6: Generate ───────────────────────────────

  async function handleGenerate(silent = false) {
    try {
      const periodId = await lookupPeriodId();
      if (!periodId) { if (!silent) showToast("期间不存在", "error"); return; }
      const res = await fetch("/api/finance/reclass-results", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodId, dryRun: false }),
      });
      if (res.ok) {
        const data = await res.json();
        if (!silent) showToast(`生成完成：写入 ${data.written} 条，跳过 ${data.skippedNonPending ?? 0} 条已审核，${data.noRule} 无规则，${data.noEntity} 无实体`);
        await loadReclassResults();
      } else {
        const err = await res.json().catch(() => ({}));
        if (!silent) showToast(err.error || "生成失败", "error");
      }
    } catch { if (!silent) showToast("网络错误", "error"); }
  }

  const adjustModal = adjustItem ? (
    <ReclassReviewModal
      item={adjustItem} open={!!adjustItem}
      companyCode={companyCode} year={year}
      onClose={() => setAdjustItem(null)}
      onSubmit={async (id, targetAccount, amount, note) => {
        await handleReview(id, "adjust", { targetAccount, amount, note });
        setAdjustItem(null);
      }} />
  ) : null;

  return { reclassMap, allItems, handleReview, handleGenerate, adjustModal };
}
