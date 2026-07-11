/**
 * Phase 3: 从凭证明细摘要提取关联实体 (relatedEntity)
 *
 * 提取规则（按优先级）:
 *   1. 按 "_" 分割，过滤空段（处理尾部 "_" 噪音）
 *   2. 去掉第一段（事件描述）和末尾日期段（YYYY.MM.DD）
 *   3. 剩余中间段从右向左扫描，取第一个满足条件的：
 *      - 非纯数字（301 等编码无查找表）
 *      - 不在黑名单（TAXRefund 等系统标记）
 *      - 长度 >= 2
 *   4. 中间段全被过滤 → 无实体
 *   5. 无下划线 → 无实体
 *
 * 幂等: 读取和写入均限制 relatedEntity IS NULL OR ''
 *
 * 运行:
 *   npx tsx scripts/extract-related-entity.ts --dry-run    # 预览
 *   npx tsx scripts/extract-related-entity.ts              # 实际写入
 */

import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

// ─── 数据库连接 ──────────────────────────────────────────

const DB_PATH =
  process.env.DATABASE_URL?.replace(/^file:/, "") ?? "data/dev.db";

const p = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: DB_PATH }),
});

const DRY_RUN = process.argv.includes("--dry-run");

// ─── 抽取逻辑 ────────────────────────────────────────────

const DATE_RE = /^\d{4}\.\d{2}\.\d{2}$/;

/** 非业务实体的系统/内部标记 */
const ENTITY_BLACKLIST = new Set(["TAXRefund"]);

/**
 * 从摘要中提取关联实体。
 * @returns 实体字符串，或 null（无法提取）
 */
function extractEntity(description: string | null): string | null {
  if (!description) return null;

  // 按 "_" 分割，过滤空段（处理 "公司名_" 尾部噪音）
  const parts = description.split("_").filter((s) => s.length > 0);
  if (parts.length < 2) return null;

  const hasDate = DATE_RE.test(parts[parts.length - 1]);

  // 去掉第一段（事件描述）和末尾日期段
  const middle = hasDate ? parts.slice(1, -1) : parts.slice(1);
  if (middle.length === 0) return null;

  // 右向左扫描，取第一个有效实体
  for (let i = middle.length - 1; i >= 0; i--) {
    const seg = middle[i].trim();
    if (!seg || seg.length < 2) continue;
    if (/^\d+$/.test(seg)) continue;
    if (ENTITY_BLACKLIST.has(seg)) continue;
    return seg;
  }

  return null;
}

/**
 * 诊断用：解释为什么某条描述无法提取实体
 */
function classifyReason(description: string): string {
  const parts = description.split("_").filter((s) => s.length > 0);
  if (parts.length < 2) return "no-underscore";

  const hasDate = DATE_RE.test(parts[parts.length - 1]);
  const middle = hasDate ? parts.slice(1, -1) : parts.slice(1);
  if (middle.length === 0) return "event-date-only";

  // 检查每个段的过滤原因（取第一个原因）
  for (let i = middle.length - 1; i >= 0; i--) {
    const seg = middle[i].trim();
    if (!seg || seg.length < 2) continue;
    if (/^\d+$/.test(seg)) {
      // 如果还有更多非数字段在前面，标记为 ambiguous（有多段但被数字挡了）
      for (let j = i - 1; j >= 0; j--) {
        const prev = middle[j].trim();
        if (prev && prev.length >= 2 && !/^\d+$/.test(prev) && !ENTITY_BLACKLIST.has(prev)) {
          return "multi-seg-numeric-tail";
        }
      }
      return "numeric-code";
    }
    if (ENTITY_BLACKLIST.has(seg)) return "blacklist";
    return "match"; // shouldn't reach here if extractEntity returned null
  }

  return "empty-segments";
}

// ─── 主流程 ──────────────────────────────────────────────

async function main() {
  console.log(DRY_RUN ? "🔍 DRY-RUN 模式 (不写入)" : "✍️  LIVE 模式 (实际写入)");
  console.log(`数据库: ${DB_PATH}\n`);

  // 1. 获取所有待处理记录（幂等：只取未填充的）
  const emptyWhere = {
    description: { not: null },
    OR: [{ relatedEntity: null }, { relatedEntity: "" }],
  };

  const candidates = await p.financeVoucherItem.findMany({
    where: emptyWhere,
    select: { id: true, description: true },
  });

  console.log(`待处理凭证明细: ${candidates.length} 条\n`);

  // 2. 按 description 分组
  const descMap = new Map<
    string,
    { entity: string | null; reason: string; ids: number[] }
  >();

  for (const item of candidates) {
    const desc = item.description!;
    let entry = descMap.get(desc);
    if (!entry) {
      const entity = extractEntity(desc);
      entry = {
        entity,
        reason: entity ? "match" : classifyReason(desc),
        ids: [],
      };
      descMap.set(desc, entry);
    }
    entry.ids.push(item.id);
  }

  // 3. 分类统计
  const matched: { desc: string; entity: string; count: number; ids: number[] }[] = [];
  const unmatched: { desc: string; reason: string; count: number }[] = [];
  let totalMatchedRecords = 0;

  for (const [desc, entry] of descMap) {
    if (entry.entity) {
      matched.push({ desc, entity: entry.entity, count: entry.ids.length, ids: entry.ids });
      totalMatchedRecords += entry.ids.length;
    } else {
      unmatched.push({ desc, reason: entry.reason, count: entry.ids.length });
    }
  }

  matched.sort((a, b) => b.count - a.count);
  unmatched.sort((a, b) => b.count - a.count);

  // 4. 输出统计
  const reasonCounts: Record<string, { count: number; distinct: number }> = {};
  for (const u of unmatched) {
    const r = reasonCounts[u.reason] || { count: 0, distinct: 0 };
    r.count += u.count;
    r.distinct += 1;
    reasonCounts[u.reason] = r;
  }

  console.log("── 统计 ──");
  console.log(`  可提取:   ${matched.length} 种描述 → ${totalMatchedRecords} 条明细`);
  console.log(`  无法提取: ${unmatched.length} 种描述 → ${candidates.length - totalMatchedRecords} 条明细`);
  for (const [reason, r] of Object.entries(reasonCounts).sort(
    (a, b) => b[1].count - a[1].count,
  )) {
    console.log(`    ${reason}: ${r.count} 条 (${r.distinct} 种描述)`);
  }

  // 5. 样例
  console.log(`\n── 可提取样例 (前20) ──`);
  for (const m of matched.slice(0, 20)) {
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

  // 6. 写入
  if (DRY_RUN) {
    console.log(`\n🔍 DRY-RUN 完成。执行写入: npx tsx scripts/extract-related-entity.ts`);
    return;
  }

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
      // 双重守卫：id 匹配 + relatedEntity 仍为空（防止覆盖人工填写）
      const result = await p.financeVoucherItem.updateMany({
        where: {
          id: { in: batch },
          OR: [{ relatedEntity: null }, { relatedEntity: "" }],
        },
        data: { relatedEntity: entity },
      });
      written += result.count;
    }
  }

  console.log(`\n✅ 已更新 ${written} 条`);

  // 验证
  const remaining = await p.financeVoucherItem.count({ where: emptyWhere });
  const expected = candidates.length - totalMatchedRecords;
  console.log(`剩余未填充: ${remaining} 条 (预期 ${expected}${remaining === expected ? " ✓" : " ⚠️ 不匹配"})`);
}

main()
  .catch(console.error)
  .finally(() => p.$disconnect());
