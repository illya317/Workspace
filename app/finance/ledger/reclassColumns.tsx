/** 重分类表头与渲染工具 — ReclassConfigView / ReclassReviewView 共享 */

// ─── 表头标签 ─────────────────────────────────────────────────

/** 科目设置重分类：科目视角 */
export const RECLASS_HEADERS = ["科目编码", "科目名称", "异常方向", "异常金额", "建议科目"] as const;

/** 凭证明细重分类：凭证视角，多了凭证号 */
export const REVIEW_HEADERS = ["凭证号", "科目编码", "科目名称", "异常方向", "异常金额", "建议科目"] as const;

// ─── 金额格式化 ───────────────────────────────────────────────

export const fmt = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ─── 方向 Badge ───────────────────────────────────────────────

export function dirBadge(side: string | null) {
  if (!side) return <>—</>;
  return side === "debit"
    ? <span className="inline-block rounded px-1.5 py-0.5 text-xs font-medium bg-blue-50 text-blue-700">借</span>
    : <span className="inline-block rounded px-1.5 py-0.5 text-xs font-medium bg-amber-50 text-amber-700">贷</span>;
}

// ─── 目标科目显示 ─────────────────────────────────────────────

const TARGET_NAMES: Record<string, string> = { "2241": "其他应付款", "1463": "其他流动资产" };

export function targetDisplay(code: string) {
  return TARGET_NAMES[code] ? `${code}/${TARGET_NAMES[code]}` : code;
}
