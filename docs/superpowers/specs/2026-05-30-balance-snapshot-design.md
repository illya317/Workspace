# 年度余额快照表拆分设计

> 2026-05-30 | 状态: 已确认

## 动机

`FinanceAnnualBalance` 目前混合了两个职责：
- 外部会计软件的年度余额基准数据（权威输入）
- 被月度余额计算直接引用

缺少批次概念：同一年度多次导入无法区分，删除/换基准无法追溯。

## 决策

新增 **Snapshot 批次表 + SnapshotRow 明细表**，与 `FinanceAccountBalance`（月度计算结果）解耦。

| 表 | 职责 | 性质 |
|---|---|---|
| `FinanceBalanceSnapshot` | 一次年度余额表导入批次 | 外部输入元数据 |
| `FinanceBalanceSnapshotRow` | 每个科目的年度余额行 | 外部输入明细 |
| `FinanceAccountBalance` | 系统月度计算结果 | 计算缓存 |

## 模型

```
FinanceBalanceSnapshot
  id              Int @id
  companyCode     String
  year            Int
  snapshotType    String        // "baseline" | "reconcile"
  isActive        Boolean       // 同公司+同年只有一个 active baseline
  sourceFile      String?
  sourcePath      String?
  checksum        String?
  rowCount        Int
  importedBy      Int?
  importedAt      DateTime
  note            String?
  editedBy/editor/editedAt/version/createdAt/updatedAt

  @@unique([companyCode, year, snapshotType, sourceFile])
  @@index([companyCode, year, isActive])

FinanceBalanceSnapshotRow
  id              Int @id
  snapshotId      Int → FinanceBalanceSnapshot (cascade delete)
  accountId       Int → FinanceAccount
  accountCode     String         // 导入时的编码快照，审计追溯
  accountName     String         // 导入时的名称快照
  openingDebit    Float
  openingCredit   Float
  currentDebit    Float
  currentCredit   Float
  closingDebit    Float
  closingCredit   Float
  sourceSheet     String?
  sourceRow       Int?

  @@unique([snapshotId, accountId])
```

## 关键规则

1. **isActive 作用域**：同一 `(companyCode, year)` 只能有一个 `isActive=true` 的 baseline snapshot
2. **2025/2026 默认 reconcile**：导入时 `snapshotType="reconcile"`，以后可提升为 baseline
3. **月度余额计算**：永远从 active baseline snapshot 的 closing balance + posted vouchers 逐月滚动
4. **删除基准前校验**：删除 active baseline 须阻止，或要求先选新 baseline
5. **换 baseline 后缓存失效**：标记或删除受影响月份的 `FinanceAccountBalance`，强制重算

## 迁移策略（保守五步）

1. ✅ 新增 `FinanceBalanceSnapshot` + `FinanceBalanceSnapshotRow` model，保留旧 `FinanceAnnualBalance`
2. ✅ 写迁移脚本 `scripts/migrate/migrate-annual-to-snapshot.ts`：旧数据按 `(companyCode, year, sourceFile)` 分组搬到新表
3. ✅ 改 `server/services/finance/` → `app/api/finance/` → UI 全部读写新表
4. ⏳ 数据校验：旧表行数 = 新 Row 行数，每个 `(companyCode, year)` 的 closing 合计一致（等运行迁移脚本）
5. ⏳ 确认无旧引用后，删除 `FinanceAnnualBalance` model

## 实现清单

| 文件 | 变更 |
|------|------|
| `prisma/models/finance-ledger.prisma` | 新增 `FinanceBalanceSnapshot` + `FinanceBalanceSnapshotRow`，旧 model 标记 `@deprecated` |
| `prisma/models/auth-rbac.prisma` | User model 新增 `snapshotImports`/`snapshotEdits` 反向关系 |
| `scripts/migrate/migrate-annual-to-snapshot.ts` | 迁移脚本（幂等，dry-run 支持，含校验） |
| `server/services/finance/balance-utils.ts` | 移除硬编码 `BASELINE_YEAR=2024` |
| `server/services/finance/annual-balances.ts` | 完全重写：`findActiveBaselineYear`, `loadActiveBaselineClosing`, `materializeBaselineToPeriod`, `createSnapshotFromPreview`, `setActiveBaseline`, `deleteSnapshot` |
| `server/services/finance/balances.ts` | 改用新 snapshot 函数，`computeBalancesForPeriod`/`computeAnnualComparisonBase` |
| `server/services/finance/import-confirm.ts` | `importAnnualBalanceSnapshot` → `createSnapshotFromPreview` |
| `app/finance/ARCHITECTURE.md` | 更新数据流和余额表口径文档 |

## 验证

- ✅ `npx prisma validate` — schema 合法
- ✅ `npm run schema:check` — 治理规则通过
- ✅ `npm run size:check` — 文件大小红线通过
- ⏳ `npm run lint` / `npx tsc --noEmit` / `npm run build` — 等待并行拆分任务完成
