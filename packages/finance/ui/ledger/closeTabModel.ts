import type { FinanceCloseScope, FinanceCloseStatusCounts, FinanceCloseTaskStatus, SaveFinanceCloseWorkpaperInput } from "../../types/close";
export { financeCloseWorkpaperReviewIdempotencyKey } from "../../types/close";

export const FINANCE_CLOSE_TASK_COUNT = 27;

export function financeCloseOpenIdempotencyKey(scope: FinanceCloseScope, actorUserId: number) {
  return `finance-close-open-v1-${actorUserId}-${stableHash(`${scope.companyCode}:${scope.year}:${scope.month}`)}`;
}

export function financeCloseRefreshIdempotencyKey(runId: number, expectedVersion: number, actorUserId: number) {
  return `finance-close-refresh-v1-${actorUserId}-${runId}-${expectedVersion}`;
}

export function financeCloseWorkpaperSaveIdempotencyKey(input: Omit<SaveFinanceCloseWorkpaperInput, "idempotencyKey">, actorUserId: number) {
  return `finance-close-wp-save-v1-${actorUserId}-${stableHash(JSON.stringify(input))}`;
}

export function financeCloseStatusLabel(status: FinanceCloseTaskStatus) {
  if (status === "ready") return "已就绪";
  if (status === "blocked") return "阻断";
  if (status === "unavailable") return "不可用";
  return "待检查";
}

export function financeCloseStatusCounts(counts: FinanceCloseStatusCounts) {
  return {
    total: counts.pending + counts.ready + counts.blocked + counts.unavailable,
    completed: counts.ready,
    pending: counts.pending,
    blocked: counts.blocked,
    unavailable: counts.unavailable,
  };
}

export function financeCloseOwnerLabel(resourceKey: string) {
  if (resourceKey === "inventory.operations" || resourceKey.startsWith("inventory.")) return "存货管理";
  if (resourceKey === "finance.treasury" || resourceKey.startsWith("finance.treasury.")) return "资金管理";
  if (resourceKey === "finance.tax" || resourceKey.startsWith("finance.tax.")) return "税务管理";
  if (resourceKey === "finance.assets" || resourceKey.startsWith("finance.assets.")) return "资产会计";
  if (resourceKey === "finance.statements" || resourceKey.startsWith("finance.statements.")) return "财务报表";
  if (resourceKey === "finance.ledger" || resourceKey.startsWith("finance.ledger.")) return "总账";
  return "业务检查";
}

export function financeCloseBusinessMessage(value: string) {
  return value.replace(/\b(?:finance|inventory)(?:\.[a-z0-9_-]+)+\b/giu, (key) => financeCloseOwnerLabel(key));
}

export function financeCloseBusinessReferences(refs: string[]) {
  const references = [...new Set(refs.map((value) => value.trim()).filter(Boolean))]
    .map(financeCloseBusinessReference);
  const counts = new Map<string, number>();
  for (const reference of references) {
    if (!reference.unit) continue;
    counts.set(reference.label, (counts.get(reference.label) ?? 0) + 1);
  }
  const emitted = new Set<string>();
  return references.flatMap((reference) => {
    if (emitted.has(reference.label)) return [];
    emitted.add(reference.label);
    const count = counts.get(reference.label) ?? 1;
    return [reference.unit && count > 1 ? `${reference.label}（${count}${reference.unit}）` : reference.label];
  });
}

function financeCloseBusinessReference(reference: string) {
  const value = reference.trim();
  const separator = value.lastIndexOf(":");
  const kind = separator > 0 ? value.slice(0, separator) : value;
  const knownLabels: Record<string, { label: string; unit: string }> = {
    "finance-bank-reconciliation": { label: "银行对账底稿", unit: "份" },
    "finance-interest-workpaper": { label: "利息测算底稿", unit: "份" },
    "finance-tax-workpaper": { label: "税费计提底稿", unit: "份" },
    "finance-tax-filing": { label: "纳税申报记录", unit: "份" },
    "finance-tax-payment": { label: "税款缴纳记录", unit: "笔" },
    "finance-tax-reconciliation-snapshot": { label: "税务勾稽快照", unit: "份" },
    "finance-tax-snapshot": { label: "税务勾稽快照", unit: "份" },
    "finance-voucher-item": { label: "总账凭证分录", unit: "条" },
  };
  if (knownLabels[kind]) return knownLabels[kind];
  if (/^(?:finance|inventory|treasury|tax)[a-z0-9._-]*:.+$/iu.test(value) || /^#\d+$/u.test(value)) return { label: "系统业务记录", unit: "条" };
  return { label: financeCloseBusinessMessage(value), unit: null };
}

function stableHash(value: string) {
  let first = 0xdeadbeef ^ value.length;
  let second = 0x41c6ce57 ^ value.length;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 2654435761);
    second = Math.imul(second ^ code, 1597334677);
  }
  first = Math.imul(first ^ (first >>> 16), 2246822507) ^ Math.imul(second ^ (second >>> 13), 3266489909);
  second = Math.imul(second ^ (second >>> 16), 2246822507) ^ Math.imul(first ^ (first >>> 13), 3266489909);
  return `${(second >>> 0).toString(16).padStart(8, "0")}${(first >>> 0).toString(16).padStart(8, "0")}`;
}
