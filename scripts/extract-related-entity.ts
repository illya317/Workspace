/**
 * Phase 3: 从凭证明细摘要提取关联实体 (relatedEntity)
 *
 * 规则: 摘要格式为 "事件描述_实体标识[_日期]"
 *   - 实体 = 事件描述和日期之间的单个非数字段
 *   - 含多个候选实体时跳过（歧义，如 "部门_人名"）
 *   - 纯数字实体跳过（如 "301"，无可靠查找表）
 *   - 幂等: 只更新 relatedEntity IS NULL OR relatedEntity = '' 的记录
 *
 * 运行:
 *   npx tsx scripts/extract-related-entity.ts --dry-run    # 预览
 *   npx tsx scripts/extract-related-entity.ts              # 实际写入
 */

import { PrismaClient } from "../generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const p = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: "data/dev.db" }),
});

const DRY_RUN = process.argv.includes("--dry-run");

// ─── 抽取逻辑 ────────────────────────────────────────────

const DATE_RE = /^\d{4}\.\d{2}\.\d{2}$/;

/** 非业务实体的系统/内部标记，不提取 */
const ENTITY_BLACKLIST = new Set([
  "TAXRefund",
]);

function extractEntity(description: string | null): string | null {
  if (!description) return null;

  const parts = description.split("_");
  if (parts.length < 2) return null;

  const hasDate = DATE_RE.test(parts[parts.length - 1]);

  // 去掉第一段（事件描述）和最后一段（日期，如果存在）
  const middle = hasDate ? parts.slice(1, -1) : parts.slice(1);

  // 没有实体段
  if (middle.length === 0) return null;

  // 多个候选 → 歧义，跳过
  if (middle.length > 1) return null;

  const entity = middle[0].trim();
  if (!entity || entity.length < 2) return null;

  // 纯数字 → 无查找表，跳过
  if (/^\d+$/.test(entity)) return null;

  // 系统/内部标记 → 非业务实体，跳过
  if (ENTITY_BLACKLIST.has(entity)) return null;

  return entity;
}

// ─── 主流程 ──────────────────────────────────────────────

async function main() {
  console.log(DRY_RUN ? "🔍 DRY-RUN 模式 (不写入)\n" : "✍️  LIVE 模式 (实际写入)\n");

  // 1. 获取所有待处理记录（幂等：只处理未填充的）
  const candidates = await p.financeVoucherItem.findMany({
    where: {
      description: { not: null },
      OR: [{ relatedEntity: null }, { relatedEntity: "" }],
    },
    select: { id: true, description: true },
  });

  console.log(`待处理凭证明细: ${candidates.length} 条\n`);

  // 2. 按 description 分组，计算每条 distinct 描述的提取结果
  const descMap = new Map<
    string,
    { entity: string | null; reason: string; ids: number[] }
  >();

  for (const item of candidates) {
    const desc = item.description!;
    let entry = descMap.get(desc);
    if (!entry) {
      const entity = extractEntity(desc);
      const reason = classifyReason(desc, entity);
      entry = { entity, reason, ids: [] };
      descMap.set(desc, entry);
    }
    entry.ids.push(item.id);
  }

  // 3. 分类统计
  const matched: { desc: string; entity: string; count: number; ids: number[] }[] = [];
  const unmatched: { desc: string; reason: string; count: number }[] = [];
  let totalUpdated = 0;

  for (const [desc, entry] of descMap) {
    if (entry.entity) {
      matched.push({ desc, entity: entry.entity, count: entry.ids.length, ids: entry.ids });
      totalUpdated += entry.ids.length;
    } else {
      unmatched.push({ desc, reason: entry.reason, count: entry.ids.length });
    }
  }

  matched.sort((a, b) => b.count - a.count);
  unmatched.sort((a, b) => b.count - a.count);

  // 4. 输出统计
  const noMatchTotal = unmatched.reduce((s, u) => s + u.count, 0);
  const reasonCounts: Record<string, number> = {};
  for (const u of unmatched) {
    reasonCounts[u.reason] = (reasonCounts[u.reason] || 0) + u.count;
  }

  console.log("── 统计 ──");
  console.log(`  可提取 (match):    ${matched.length} 种描述 → ${totalUpdated} 条明细`);
  console.log(`  无法提取:          ${unmatched.length} 种描述 → ${noMatchTotal} 条明细`);
  for (const [reason, count] of Object.entries(reasonCounts).sort(
    (a, b) => b[1] - a[1],
  )) {
    console.log(`    ${reason}: ${count} 条`);
  }

  // 5. 输出样例
  console.log(`\n── 可提取样例 (前15) ──`);
  for (const m of matched.slice(0, 15)) {
    console.log(`  [${m.entity}] ← "${m.desc}" (${m.count}条)`);
  }

  console.log(`\n── 无法提取样例 (按类别，每类前3) ──`);
  const shown = new Set<string>();
  for (const u of unmatched) {
    if (shown.has(u.reason)) continue;
    shown.add(u.reason);
    const samples = unmatched.filter((x) => x.reason === u.reason).slice(0, 3);
    console.log(`  ${u.reason}:`);
    for (const s of samples) {
      console.log(`    "${s.desc}" (${s.count}条)`);
    }
  }

  // 6. 写入（非 dry-run）
  if (DRY_RUN) {
    console.log(
      `\n🔍 DRY-RUN 完成。实际执行: npx tsx scripts/extract-related-entity.ts`,
    );
    return;
  }

  // 批量更新：按 entity 值分组，每批 500 个 id
  const byEntity = new Map<string, number[]>();
  for (const m of matched) {
    const list = byEntity.get(m.entity) || [];
    list.push(...m.ids);
    byEntity.set(m.entity, list);
  }

  let written = 0;
  for (const [entity, ids] of byEntity) {
    for (let i = 0; i < ids.length; i += 500) {
      const batch = ids.slice(i, i + 500);
      await p.financeVoucherItem.updateMany({
        where: { id: { in: batch } },
        data: { relatedEntity: entity },
      });
      written += batch.length;
    }
  }

  console.log(`\n✅ 已更新 ${written} 条凭证明细的 relatedEntity`);

  // 验证幂等性
  const remaining = await p.financeVoucherItem.count({
    where: {
      description: { not: null },
      OR: [{ relatedEntity: null }, { relatedEntity: "" }],
    },
  });
  console.log(`剩余未填充: ${remaining} 条 (应为 ${noMatchTotal})`);
}

// ─── 辅助 ─────────────────────────────────────────────────

function classifyReason(
  desc: string,
  entity: string | null,
): string {
  if (entity) return "match";

  const parts = desc.split("_");
  if (parts.length < 2) return "no-underscore";

  const hasDate = DATE_RE.test(parts[parts.length - 1]);
  const middle = hasDate ? parts.slice(1, -1) : parts.slice(1);

  if (middle.length === 0) return "empty-entity";
  if (middle.length > 1) return "ambiguous";
  const raw = middle[0].trim();
  if (!raw || raw.length < 2) return "empty-entity";
  if (/^\d+$/.test(raw)) return "numeric-code";
  if (ENTITY_BLACKLIST.has(raw)) return "blacklist";

  return "unknown";
}

main()
  .catch(console.error)
  .finally(() => p.$disconnect());
