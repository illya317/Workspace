"use client";

import { workspacePath } from "@workspace/core/routing";
import { useEffect, useState, useCallback } from "react";
import type { ReclassResultRow } from "@workspace/finance/server/ledger/reclass-results/types";
import ReclassReviewModal from "../components/ReclassReviewModal";

const PAGE_SIZE = 200;

export function useReclassResults(companyCode: string, year: string, month: string, showToast: (msg: string, type?: "error") => void) {
  const [reclassMap, setReclassMap] = useState<Map<number, ReclassResultRow>>(new Map());
  const [allItems, setAllItems] = useState<ReclassResultRow[]>([]);
  const [adjustItem, setAdjustItem] = useState<ReclassResultRow | null>(null);

  const lookupPeriodId = useCallback(async (): Promise<number | null> => {
    const pRes = await fetch(workspacePath(`/api/modules/finance/ledger/reclass-results/lookup-period?companyCode=${companyCode}&year=${year}&month=${month}`));
    const { periodId } = await pRes.json();
    return periodId || null;
  }, [companyCode, month, year]);

  const loadAllItemsForPeriod = useCallback(async (periodId: number) => {
    try {
      const res = await fetch(workspacePath(`/api/modules/finance/ledger/reclass-results/all-items?periodId=${periodId}`));
      if (!res.ok) return;
      const data = await res.json();
      setAllItems(data.items || []);
    } catch { /* ignore */ }
  }, []);

  const loadReclassResults = useCallback(async () => {
    if (!companyCode || !year || !month) { setReclassMap(new Map()); setAllItems([]); return; }
    try {
      const periodId = await lookupPeriodId();
      if (!periodId) { setReclassMap(new Map()); setAllItems([]); return; }
      // Loop-fetch all pages (API caps at 200/page)
      const map = new Map<number, ReclassResultRow>();
      let page = 1;
      while (true) {
        const rRes = await fetch(workspacePath(`/api/modules/finance/ledger/reclass-results?periodId=${periodId}&status=all&page=${page}&pageSize=${PAGE_SIZE}`));
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
  }, [companyCode, loadAllItemsForPeriod, lookupPeriodId, month, year]);

  useEffect(() => { loadReclassResults(); }, [loadReclassResults]);

  // ── Review ──────────────────────────────────────────

  const handleReview = useCallback(async (resultId: number, action: "approve" | "revert" | "adjust" | "mark_pending", body?: Record<string, unknown>, extra?: { periodId?: number; voucherItemId?: number; sourceAccount?: string }) => {
    const payload: Record<string, unknown> = { action, ...body };
    if (resultId === 0 && extra) {
      payload.periodId = extra.periodId;
      payload.voucherItemId = extra.voucherItemId;
      payload.sourceAccount = extra.sourceAccount;
    }
    const res = await fetch(workspacePath(`/api/modules/finance/ledger/reclass-results/${resultId}`), {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const data = await res.json();
      const item = data.item as ReclassResultRow;
      const labels: Record<string, string> = { approve: "已保存", revert: "已撤回", adjust: "已保存调整", mark_pending: "已设置重分类" };
      showToast(labels[action] || "操作成功");
      setReclassMap((prev) => {
        const next = new Map(prev);
        next.set(item.voucherItemId, item);
        return next;
      });
      // Also refresh allItems
      const periodId = await lookupPeriodId();
      if (periodId) await loadAllItemsForPeriod(periodId);
    } else {
      const err = await res.json().catch(() => ({}));
      showToast(err.error || "操作失败", "error");
    }
  }, [loadAllItemsForPeriod, lookupPeriodId, showToast]);

  // ── Batch 6: Generate ───────────────────────────────

  const handleGenerate = useCallback(async (silent = false) => {
    try {
      // 确保该年度有规则（无则从上年继承）
      await fetch(workspacePath(`/api/modules/finance/ledger/reclass-rules?companyCode=${companyCode}&year=${year}`), { method: "GET" });
      const periodId = await lookupPeriodId();
      if (!periodId) { if (!silent) showToast("期间不存在", "error"); return; }
      const res = await fetch(workspacePath("/api/modules/finance/ledger/reclass-results"), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodId, dryRun: false }),
      });
      if (res.ok) {
        const data = await res.json();
        if (!silent) showToast(`生成完成：写入 ${data.written} 条，保护 ${data.skippedAdjusted ?? 0} 条人工调整，${data.noRule} 无规则，${data.noEntity} 无实体`);
        await loadReclassResults();
      } else {
        const err = await res.json().catch(() => ({}));
        if (!silent) showToast(err.error || "生成失败", "error");
      }
    } catch { if (!silent) showToast("网络错误", "error"); }
  }, [companyCode, loadReclassResults, lookupPeriodId, showToast, year]);

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
