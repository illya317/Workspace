import type { DataSurfaceCellSpec } from "@workspace/core/ui";

/** 重分类表头与渲染工具 — ReclassConfigView / ReclassReviewView 共享 */

// ─── 表头标签 ─────────────────────────────────────────────────

/** 科目设置重分类：科目视角 */
export const RECLASS_HEADERS = ["科目编码", "科目名称", "借贷", "金额", "建议科目"] as const;

/** 凭证明细重分类：凭证视角，多了凭证号 */
export const REVIEW_HEADERS = ["凭证号", "科目编码", "科目名称", "借贷", "金额", "建议科目"] as const;

// ─── 方向 Badge ───────────────────────────────────────────────

export function dirBadge(side: string | null): DataSurfaceCellSpec {
  if (!side) return { kind: "empty" };
  return { kind: "badge", label: side === "debit" ? "借" : "贷", tone: "red" };
}

// ─── 目标科目显示 ─────────────────────────────────────────────

const TARGET_NAMES: Record<string, string> = { "2241": "其他应付款", "1463": "其他流动资产" };

export function targetDisplay(code: string) {
  return TARGET_NAMES[code] ? `${code}/${TARGET_NAMES[code]}` : code;
}
