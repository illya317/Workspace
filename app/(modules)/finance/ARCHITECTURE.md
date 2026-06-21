# Finance 财务总账模块架构

## 路由入口

| 页面 | 路由 | 组件 |
|------|------|------|
| 财务首页 | `/finance` | `page.tsx` → Platform `ModuleHome` |
| 总账会计 | `/finance/ledger` | `ledger/page.tsx` → `@workspace/finance/ui` 的 `LedgerClient` |
| 财务报表 | `/finance/statements` | `statements/page.tsx` → `@workspace/finance/ui` 的 `StatementsClient` |
| 报表配置 | `/finance/statement-config` | `statement-config/page.tsx` → `@workspace/finance/ui` 的 `StatementConfigClient` |
| 报表校对 | `/finance/statement-review` | `statement-review/page.tsx` → `@workspace/finance/ui` 的 `StatementReviewClient` |
| 管理会计 | `/finance/analysis` | `analysis/page.tsx` → `@workspace/finance/ui` 的 `FinanceAnalysisClient` |
| 预算管理 | `/finance/budget` | `budget/page.tsx` → `@workspace/finance/ui` 的 `BudgetTab` |
| 成本管理 | `/finance/cost` | `cost/page.tsx` → `@workspace/finance/ui` 的 `FinanceCostClient` |
| 税务管理 | `/finance/tax` | `tax/page.tsx` (占位) |
| 司库管理 | `/finance/treasury` | `treasury/page.tsx` (占位) |
| 数据导入与治理 | `/finance/import` | `import/page.tsx` → `@workspace/finance/ui` 的 `FinanceImportClient` |

财务子页面由 `FinanceShell` 统一包裹，提供顶部导航栏、Logo、返回入口及用户菜单。财务首页由 Platform `AppShell` + `ModuleHome` 渲染入口卡片，入口配置来自平台模块注册表。

## 页面结构

### 财务首页 (`/finance`)

`/finance` 通过 Platform `ModuleHome` 渲染模块入口卡片：

| 模块 | 说明 |
|------|------|
| 总账会计 | 科目、凭证、期间、余额、结账、重分类 |
| 财务报表 | 资产负债表、利润表、现金流量表、取数明细 |
| 管理会计 | 经营分析、部门利润、产品客户维度、预算执行分析 |
| 预算管理 | 预算版本、部门预算、研发预算、调整、执行 |
| 成本管理 | 发货、成本结构、成本分析、车间工分、销售工资 |
| 税务管理 | 销项/进项、税负、发票、纳税申报（规划中） |
| 司库管理 | 银行账户、资金日报、收付款、现金流（规划中） |
| 数据导入与治理 | 科目/凭证/余额/预算/成本导入，校验与异常 |

### 生命周期标记

财务模块当前全部按 `workspace-owned` 管理。数据来源为 Workspace 本地资料、Excel 导入和本地数据库表；不再通过 ERP/ERPNext API 取数。

### 总账会计 (`/finance/ledger`)

`LedgerClient` 位于 `packages/finance/ui/ledger`，由 route 薄壳挂载，渲染多个 Tab：

| Tab | 组件 | 说明 |
|-----|------|------|
| 科目设置 | AccountTab | 会计科目 CRUD |
| 凭证明细 | VoucherTab | 凭证录入/查询/重分类审核 |
| 余额表 | LedgerTab | 科目余额表查询、年度余额基准滚动计算、外部余额表校准 |
| 重分类表 | ReclassTab | 重分类结果汇总只读视图（从附注明细迁入） |
| 资产折旧 | — | 资产折旧表（开发中） |

### 财务报表 (`/finance/statements`)

`StatementsClient` 位于 `packages/finance/ui/statements`，由 route 薄壳挂载：

| Tab | 组件 | 说明 |
|-----|------|------|
| 财务报表 | ReportTab | 资产负债表/利润表 |

### 报表配置 (`/finance/statement-config`)

`StatementConfigClient` 位于 `packages/finance/ui/statement-config`，由 route 薄壳挂载：

| Tab | 组件 | 说明 |
|-----|------|------|
| 报表项目配置 | LineConfigTab | 资产负债表项目、科目映射和默认规则调整 |
| 遗漏科目 | UnmappedTab | 余额非零但未被 add 消费的科目检查 |
| 余额校对 | BalanceCheckTab | 父子科目余额一致性校对 |

### 预算管理 (`/finance/budget`)

`BudgetTab` 位于 `packages/finance/ui/budget`，由 route 薄壳挂载：

| Tab | 组件 | 说明 |
|-----|------|------|
| 预算 | BudgetTab | 部门费用预算、研发费用预算 |

### 成本管理（子模块）

详见 `app/(modules)/finance/cost/ARCHITECTURE.md`。

## 核心组件链

```
page.tsx
  └─ AppShell
       └─ ModuleHome

ledger/page.tsx
  └─ FinanceShell
       └─ @workspace/finance/ui LedgerClient
            ├─ packages/finance/ui/ledger/AccountTab.tsx
            ├─ packages/finance/ui/ledger/VoucherTab.tsx
            ├─ packages/finance/ui/ledger/LedgerTab.tsx
            ├─ packages/finance/ui/ledger/ReclassTab.tsx
            └─ (折旧表, 占位)

statements/page.tsx
  └─ FinanceShell
       └─ @workspace/finance/ui StatementsClient
            └─ packages/finance/ui/statements/ReportTab.tsx

statement-config/page.tsx
  └─ FinanceShell
       └─ @workspace/finance/ui StatementConfigClient
            ├─ packages/finance/ui/statement-config/LineConfigTab.tsx
            ├─ packages/finance/ui/statement-config/UnmappedTab.tsx
            └─ packages/finance/ui/statement-config/BalanceCheckTab.tsx

budget/page.tsx
  └─ FinanceShell
       └─ BudgetTab.tsx
```

## 数据流

1. 各 Tab 组件独立管理自身状态，通过 API 加载数据
2. 财务数据以 `Period`（会计期间）为核心维度
3. 年度余额表作为本地导入资料，导入后存为 `FinanceBalanceSnapshot`（批次）+ `FinanceBalanceSnapshotRow`（明细）
4. 月度余额 `FinanceAccountBalance` 由系统从 active baseline snapshot + 已过账序时账凭证逐月滚动计算
5. 上传后续年度余额表做校准时，系统比较"基准+序时账滚动结果"和后续导入余额表，只做校准对比，不覆盖月度余额

## 余额表口径

余额表分三层：

| 层 | 表 | 来源 | 用途 |
|---|---|---|---|
| 年度余额批次 | `FinanceBalanceSnapshot` | 一次本地资料导入 = 一行 | 追溯哪次导入、哪个文件、谁导入 |
| 年度余额明细 | `FinanceBalanceSnapshotRow` | 导入时每个科目的原始行 | 保存 `accountCode`/`accountName` 快照，审计可追溯到 Excel 原始行 |
| 月度余额结果 | `FinanceAccountBalance` | 系统计算 | 按月展示、报表取数 |

计算规则：

1. 导入 2024 年度余额表后，**只写入 `FinanceBalanceSnapshot` + `FinanceBalanceSnapshotRow`**，`snapshotType="baseline"`, `isActive=true`。
2. 后续年度余额表（2025+）导入时默认 `snapshotType="reconcile"`, `isActive=false`，仅用于本地校准核对。
3. 点击余额表"重新计算"时，系统从 active baseline snapshot 的 closing balance 开始，叠加已过账凭证逐月滚动到 `FinanceAccountBalance`。
4. `FinanceAccountBalance` 是 `FinanceBalanceSnapshotRow` 的 materialized 缓存/展示层，不是数据源头。
5. 换基准年份：将某个 reconcile snapshot 改为 `snapshotType="baseline"` + `isActive=true`（同 companyCode+year 下只有一个 active），然后重算受影响月份。
6. 删除 active baseline：必须先选择新的 baseline。删除普通 reconcile snapshot 可直接级联删除。## 重分类系统

重分类工作流将凭证明细中"借贷方向与科目自然余额方向相反"的分录，重新归类到对应目标科目，以消除资产负债表中的虚增余额。

### 数据模型

| 表 | 文件 | 说明 |
|---|---|---|
| `FinanceReclassRule` | `prisma/models/finance-ledger.prisma` | 科目规则：`(companyCode, year, sourceAccountCode, abnormalSide)` → `targetAccountCode` |
| `FinanceReclassItemRule` | `prisma/models/finance-ledger.prisma` | 明细例外规则：`(companyCode, year, sourceAccountCode, matchType, matchValue)` → `targetAccountCode` |
| `ReclassResult` | `prisma/models/finance-ledger.prisma` | 明细级结果：每条凭证明细的生成/审核结果，`ruleId` 可空 |
| `FinanceStatementAccountMapping` | `prisma/models/finance-ledger.prisma` | 科目→报表项目映射：`(companyCode, year, statementType, accountCode)` → `lineCode` |
| `FinanceStatementLineConfig` | `prisma/models/finance-ledger.prisma` | 报表行定义：section/side/isTotal/isGrandTotal |
| `FinanceBalanceReclassAdjustment` | `prisma/models/finance-ledger.prisma` | 余额残差调整：residual = 异常余额 - YTD 凭证明细已调 |

### 规则表 (`FinanceReclassRule`)

- `companyCode` **非空**，规则总是公司作用域
- `@@unique([companyCode, year, sourceAccountCode, abnormalSide])` 公司+年度唯一
- `year`: 规则所属年度，新年度首次使用时从上年度复制初始化
- `abnormalSide`: `debit` = 异常借方、`credit` = 异常贷方、`both` = 全部重分类
- `source`: `"manual"` 手动配置、`"auto"` 系统自动确认、`"suggested"` 系统候选

### 结果表 (`ReclassResult`)

- `@@unique([periodId, voucherItemId])` 确保同一明细只有一条结果
- `ruleId` (Int?) 追溯到生成此结果的 `FinanceReclassRule`；手工添加或历史兼容时为 null
- `status`: 默认 `approved`（系统自动通过），`adjusted`（人工调整，受保护不被覆盖），`pending`（历史兼容，不在 UI 主流程），`rejected`（历史兼容）
- `approved` / `adjusted` 被报表消费

### 端到端数据流

```
┌─ 配置规则 ──────────────────────────────────────────────┐
│ 科目设置 → 重分类规则 scope                              │
│   GET /api/modules/finance/reclass-rules?companyCode=&year=       │
│   调用 scanCandidates() 扫描凭证明细异常方向               │
│   PUT /api/modules/finance/reclass-rules → FinanceReclassRule     │
│   DELETE /api/modules/finance/reclass-rules/[id]                  │
└──────────────────────────────────────────────────────────┘
                    ↓
┌─ 生成结果 ──────────────────────────────────────────────┐
│ 凭证明细 → 生成重分类结果 按钮                            │
│   POST /api/modules/finance/reclass-results { periodId }          │
│   调用 buildReclassResults() → upsert ReclassResult       │
│   引擎读 FinanceReclassRule + FinanceReclassItemRule      │
│   匹配异常方向凭证明细 → 生成 approved ReclassResult       │
│   只保护 adjusted/rejected，approved/pending 可覆盖        │
└──────────────────────────────────────────────────────────┘
                    ↓
┌─ 审核 ──────────────────────────────────────────────────┐
│ 凭证明细 → 查看系统结果 / 人工调整例外                    │
│   PATCH /api/modules/finance/reclass-results/[id]                │
│   系统匹配规则 → approved（自动，不写 ReclassResult for normal） │
│   人工设置/修改 → adjusted + 沉淀 FinanceReclassItemRule  │
│   全部操作走 action="adjust"，id=0 创建、id>0 更新         │
│   pending 仅历史兼容状态，不在 UI 主流程                   │
└──────────────────────────────────────────────────────────┘
                    ↓
┌─ 报表消费 (只读) ───────────────────────────────────────┐
│ /api/modules/finance/reports → generateReport()                   │
│   查询 ReclassResult WHERE status IN (approved, adjusted)  │
│   reclassifyFromEntries() 构建 deductions + additions     │
│   按 sourceAccount 扣减 → 按 targetAccount 增加           │
│   资产负债表 reclassLine() 统一应用 src+tgt 路由          │
└──────────────────────────────────────────────────────────┘
```

### 报表消费口径

- **只消费** `status IN ("approved", "adjusted")`，不消费 `pending` / `rejected`
- 按 `sourceAccount` 前缀扣减对应资产负债表行（资产 1xxx 扣贷方，负债 2xxx 扣借方）
- 按 `targetAccount` 前缀增加到对应资产负债表行
- `ReclassEntry { sourceAccount, targetAccount, amount }` 精确金额，非整科目余额
- 报表页不触发生成、不编辑规则、不审核结果
- 遗留 `FinanceAccount.reclassTargetCode` 仍保留（Batch 8 清理），引擎已不读

### 科目→报表项目映射

- **`FinanceStatementAccountMapping`** 定义科目归属哪个报表行
- **解析规则**：最近祖先优先
  - 优先用 `FinanceAccount.parentId` 构建 parent chain
  - parent 缺失时 prefix fallback（逐位截断）
  - 无需手动 exclude — 更深层 mapping 自动覆盖父级
- **继承**：`ensureStatementMappings(companyCode, year)` → 已有不覆盖 → 上年复制 → prefix 迁移
- **Resolver**：`resolveAccountMapping()` 返回 `{resolvedLineCode, mappingSource: explicit|inherited|none}`

### 资产负债表口径（M11/M12 authoritative + Phase 2.3B residual）

资产负债表走 **mapping-based** 口径，legacy prefixes 仅作为 fallback / 诊断对比。

```
科目录属 ─→ FinanceStatementAccountMapping 解析（最近祖先优先）
  ↓
聚合 ─→ residual = own_balance - direct_children_balance_sum
       若 abs(residual) > 0.01 → 贡献该 residual 到所属 line
       （避免 parent 自身有余额但 children 全 0 时丢失）
  ↓
行计算 ─→ mappingByLine + reclassByLine（lineCode-keyed）
  ↓
最终金额 ─→ 由 line.side 决定（debit = mk(d-c), credit = mk(c-d)）
```

关键不变量：

1. **Residual leaf 聚合**（Phase 2.3B）：`aggregateMappingBasedBalances()` 计算每个 account node 的 `residual = own - direct_children_sum`，仅当 `abs(residual) > 0.01` 时纳入。真正叶子（无 children）的 residual = own，与原 leaf-only 行为一致；父级有余额但 children 全 0 时，parent 自身余额代表有效余额，纳入；parent 完全等于 children 汇总时排除，避免双算。`residualParents` 列表作为 diagnostics。
2. **Contra 科目自然抵减**：坏账准备（1231）/ 累计折旧（1602 / 1642）等减项科目必须显式映射到与 gross 同一 lineCode。聚合时借方 - 贷方 = 净值，减项的贷方自然抵减 gross 的借方。
3. **重分类按 lineCode 路由**：`resolveReclassEntriesToLines(companyCode, year, entries)` 把每条 `ReclassEntry.sourceAccount / targetAccount` 解析为 lineCode，按 `lineCode` 增减扣；不再用 `line.prefixes` 前缀匹配。
4. **Legacy 仅诊断**：`computeBalanceSheet(config, balances, reclass)` 在 `mappingByLine` 缺失时走 legacy prefixes 路径；已知对 `subtractPrefixes` 符号处理有问题，仅作为 `scripts/balance-sheet-diff.ts` 的对比基线，不作主路径。
5. **Additive mapping seed**：`ensureStatementMappings(companyCode, year, statementType)` 永不"有就跳过整年"，只按 accountCode 维度跳过（manual / 已有），缺失的 accountCode 从 `line.prefixes` + `line.subtractPrefixes` 补齐。复制上一年后**继续跑 backfill**，避免上一年自身的缺漏跨年漏到新年。

诊断与防回归：

- `npm run finance:bs-diff <companyCode> <year> <month>` 输出 legacy vs mapping 逐行 diff、unresolved 三分桶（relevant / ignored / zeroBalance）、`MAPPING_OK` / `MAPPING_GAP` 标识。
- `npm run finance:bs-smoke` 跑 02/2025/2 常用 smoke。
- `npx tsx scripts/repair-statement-mappings.ts [--all] [--dry-run]` 调用 `ensureStatementMappings` 修补缺失；`--all` 已批处理 14 个 (company, year) 补 42 条。
- `MAPPING_OK` 条件：`|mappingBalanceGap| < 0.01` 且 `unresolvedGroups.relevant.length === 0`。

### 已知 outstanding 项（业务待确认）

`npm run finance:bs-smoke:all` 当前结果：**14 OK / 1 GAP**（05 加拿大 2025/2026）。

| 期间 | 缺口来源 | 状态 |
|---|---|---|
| 05 / 2025-2026 | `3001 清算资金往来`，credit 100K（3 年同笔） | **业务待财务确认列示**：paidInCapital / otherEquityItems / 其他权益项目 |

2024 同笔 100K credit 在 05 账上名为「实收资本」(cat=equity)，2025/2026 改名为「清算资金往来」(cat=other)。Phase 2.4A 已对 05/2024 加 `3001 → paidInCapital`，2024 现在 OK。2025/2026 不自动归类，避免污染 paidInCapital 语义；财务确认后再补。

### Phase 3 Batch 1：利润表 / 现金流量表 line config 框架

P3 Batch 1 只搭**配置**层（line config + DB 行），**不接 compute、不接 UI、不接 workpaper/review**。

新增：
- `packages/finance/server/statements/config/cash-flow-lines.ts` — 完整现金流量表项目框架（经营 / 投资 / 筹资 三大活动 + 流入小计 + 流出小计 + 净额 + 净增加额 + 期末余额），支持 chnPrefixes / canPrefixes 双轨。
- `packages/finance/server/statements/config/load-config-reports.ts` — 新增 `loadIncomeStatementConfig` / `loadCashFlowConfig`，与 `loadBalanceSheetConfig` 同样的 3-tier 加载（DB → 上年 → TS default）。从主文件 re-export 以保持 ≤260 行。
- `packages/finance/server/statements/config/ensure-line-configs.ts` — 新增 `ensureStatementLineConfigs(companyCode, year, reportType)` 与 `ensureAllStatementLineConfigs(companyCode, year)`，封装 3-tier cascade：当年有 → no-op；无 + 上年有 → 复制；上年无 → TS default seed。`source` 返回 `existing | copied | migrated` 标签。

复用 `FinanceStatementLineConfig`：`reportType = "balanceSheet" | "incomeStatement" | "cashFlow"`。每张表独立 sortOrder，按行分。

不做的：
- 不接 `generateIncomeStatement` / `generateCashFlow`（依然返回"未实现"或走老路径）。
- 不动 `/finance/statements` 页面计算逻辑；`/finance/statement-config` route 只保留薄壳，UI 位于 `packages/finance/ui/statement-config`。
- 不建 workpaper / review 表。
- 不动资产负债表 authoritative 口径。

### Phase 3 Batch 2：底稿输入 schema + service + API

P3 Batch 2 新增底稿（workpaper）表与服务层，用于保存利润表/现金流量表的底稿手工输入。**不做 review/确认流，不做 UI，不碰 balanceSheet。**

新增表（`prisma/models/finance-ledger.prisma`）：

- `FinanceStatementWorkpaper` — 底稿头。唯一键 `(companyCode, year, month, reportType)`。`reportType` 支持 `incomeStatement` / `cashFlow`。字段：`status`（draft/submitted）、`note`、`updatedBy`。
- `FinanceStatementWorkpaperLine` — 底稿行。唯一键 `(workpaperId, lineCode)`。只存事实输入：`manualAmount`、`importedAmount`、`formulaText`（纯记录不执行）、`note`、`source`。不存计算结果。

新增 service（`packages/finance/server/statements/workpapers/`）：

- `types.ts` — DTO 类型（`WorkpaperOutput`、`WorkpaperLineInput/Output`、`SaveWorkpaperInput`）
- `service.ts` — `getOrCreateDraft(params)`：DB 有则返回无则基于 line config 生成空 draft（不落库）；`saveWorkpaper(input, userId?)`：事务内校验 lineCode → upsert header → delete stale lines → upsert lines

新增 API（`app/api/modules/finance/statement-workpapers/route.ts`）：

- `GET ?companyCode=&year=&month=&reportType=` — `withFinanceReportAccess`，返回底稿或空 draft
- `PUT { companyCode, year, month, reportType, lines[] }` — `withFinanceReportWrite`，**全量保存**（payload 的 lines 完全替换现有行，不在 payload 中的 lineCode 会被删除）

设计原则：
- DB 存事实输入，不存最终报表计算结果
- amount 用 Float（与现有财务表一致）
- lineCode 必须校验存在于对应 reportType 的 `FinanceStatementLineConfig`
- GET 空 draft 不落库，只有 PUT 才写 DB
- **PUT 是全量保存语义**，不是 PATCH 局部更新；UI 须传完整行集合
- **statement-workpapers 是输入底稿，不参与最终报表计算**；Batch 3 review 才做校对状态与计算消费

### Phase 3 Batch 3：校对 schema + service + API

P3 Batch 3 新增校对（review）表与服务层，作为 workpaper → review → report 的桥梁。**不做 UI、不接 compute consumption、不接 systemAmount mapping。**

新增表（`prisma/models/finance-ledger.prisma`）：

- `FinanceStatementReview` — 校对头。`workpaperId` unique（1 workpaper → 1 review）。字段：`companyCode/year/month/reportType` 快照冗余、`status`（draft/confirmed/voided）、`generatedFromVersion`、`reviewedBy/reviewedAt`。
- `FinanceStatementReviewLine` — 校对行。唯一键 `(reviewId, lineCode)`。字段：`systemAmount`（Batch 5 前为 0）、`workpaperAmount`（底稿快照）、`adjustedAmount`（null=未调整）、`finalAmount`（= adjustedAmount ?? workpaperAmount）、`status`（pending/confirmed/adjusted/flagged）、`comment`。

新增 service（`packages/finance/server/statements/reviews/`）：

- `types.ts` — DTO
- `service.ts` — `generateReview(workpaperId)`：从 workpaper 生成校对、幂等（已有 draft 则返回、已有 confirmed 则 409）；`getReview(params)`：按 workpaperId 或 natural key 查询；`updateReviewLines(id, lines)`：局部更新、confirmed 禁止修改(409)；`confirmReview(id, userId)`：校验无 flagged 行后签核

新增 API：
- `GET /api/modules/finance/statement-reviews?workpaperId=` — `withFinanceReportAccess`
- `GET /api/modules/finance/statement-reviews?companyCode=&year=&month=&reportType=` — `withFinanceReportAccess`
- `POST /api/modules/finance/statement-reviews { workpaperId }` — `withFinanceReportWrite`
- `PUT /api/modules/finance/statement-reviews/[id] { lines[], note? }` — `withFinanceReportWrite`，局部更新
- `POST /api/modules/finance/statement-reviews/[id]/confirm` — `withFinanceReportWrite`

设计原则：
- Review 不改 workpaper，workpaper 始终是会计原始输入
- 只有 confirmed review 的 finalAmount 才进入最终报表（Batch 5/6 消费）
- finalAmount 存 DB 是校对签核事实，非普通派生字段
- `generatedFromVersion` 用于判断 review 是否落后于 workpaper

后续 Batch 计划（见 `docs/planning/plans.md`）：
- Batch 4: review 页面骨架
- Batch 5: 利润表 mapping preview
- Batch 6: 天力通 2025 smoke

## 预算管理

详见 `app/(modules)/finance/budget/ARCHITECTURE.md`。

预算数据来自 `prisma/seed-data/预算/` 下的 Excel 文件（部门费用预算、研发费用预算）。

`FinanceBudgetVersion` 为版本头表（draft/active/archived），`FinanceBudgetDept` / `FinanceBudgetRd` 为事实表，通过 `versionId` 关联到版本。`accountId` 外键关联到 `FinanceAccount`。

### 预算导入

```bash
# 将 Excel 预算数据导入数据库（创建 draft 版本）
curl -X POST /api/modules/finance/budget -H "Content-Type: application/json" -d '{"year":2026}'
```

### 预算科目同步脚本

```bash
npm run budget:sync-accounts
```

该脚本读取两份预算 Excel，将预算中未出现在 `FinanceAccount` 的科目创建为 `isActive=false` 的占位科目（编码格式 `BUDGET-{DEPT|RD}-###`）。**需在预算 Excel 变更后重新运行，然后重新导入预算到数据库**。

## API 规范

| 端点 | 说明 |
|------|------|
| `GET/POST/PUT/DELETE /api/modules/finance/accounts` | 会计科目 |
| `GET/POST/PUT/DELETE /api/modules/finance/vouchers` | 凭证管理 |
| `GET/POST /api/modules/finance/balances` | 月度余额查询/按年度基准重新计算 |
| `POST /api/modules/finance/balances/reconcile` | 上传会计软件年度余额表进行校准核对 |
| `GET/PUT /api/modules/finance/periods` | 会计期间 |
| `GET /api/modules/finance/reports` | 财务报表 |
| `GET /api/modules/finance/init` | 财务初始化 |
| `GET/PUT/DELETE /api/modules/finance/reclass-rules` | 重分类规则管理 |
| `GET/POST/PATCH /api/modules/finance/reclass-results` | 重分类结果列表/生成/审核 |
| `GET/PUT /api/modules/finance/statement-workpapers` | 底稿查询/保存（P3 Batch 2） |
| `GET/POST /api/modules/finance/statement-reviews` | 校对查询/生成（P3 Batch 3） |
| `PUT /api/modules/finance/statement-reviews/[id]` | 校对行更新（P3 Batch 3） |
| `POST /api/modules/finance/statement-reviews/[id]/confirm` | 校对确认（P3 Batch 3） |
| `GET/POST/DELETE /api/modules/finance/cost/*` | 成本管理子模块 |

## 权限标准

### 资源键

| 资源 | 键 | 说明 |
|------|-----|------|
| 财务根 | `finance` | 任一财务子权限的汇总标识 |
| 总账会计 | `finance.ledger` | 科目、凭证、余额、期间、重分类、折旧 |
| 财务报表 | `finance.statement` | 资产负债表、利润表、现金流量表 |
| 管理会计 | `finance.analysis` | 经营分析、部门利润、预算执行分析 |
| 预算管理 | `finance.budget` | 部门预算、研发预算、调整、执行 |
| 成本管理 | `finance.cost` | 发货、成本结构、成本分析、车间工分 |
| 税务管理 | `finance.tax` | 销项/进项、税负、发票（规划中） |
| 司库管理 | `finance.treasury` | 银行账户、资金日报、收付款（规划中） |
| 数据导入与治理 | `finance.import` | 科目/凭证/余额/预算/成本导入 |

每个资源支持 `access` / `write` / `delete` 三个动作（成本子资源另有 `shipments` / `analysis` / `structure` / `workshop` / `salary` / `imports` 细分）。

### 权限继承规则

- 父资源 `finance.access` 自动覆盖所有子资源的 `access`。
- 子资源 checker 的实现顺序：先查子资源权限，未命中再回退到父资源 `finance.*`。
- 例：只授予 `finance.budget.access` 的用户，可以进入 `/finance/budget`，也可以通过 `/finance` 首页和 Portal 入口（`visibleResourceKeys` 会自动包含祖先 `finance`）。

### 页面 Guard

财务页面统一使用 `requireResourceAccess(resourceKey)` 做服务端门禁（基于 `visibleResourceKeys`）。

| 页面 | Guard |
|------|-------|
| `/finance` | `requireResourceAccess("finance")` |
| `/finance/ledger` | `requireResourceAccess("finance.ledger")` |
| `/finance/statements` | `requireResourceAccess("finance.statement")` |
| `/finance/analysis` | `requireResourceAccess("finance.analysis")` |
| `/finance/budget` | `requireResourceAccess("finance.budget")` |
| `/finance/cost` | `requireResourceAccess("finance.cost")` |
| `/finance/tax` | `requireResourceAccess("finance.tax")` |
| `/finance/treasury` | `requireResourceAccess("finance.treasury")` |
| `/finance/import` | `requireResourceAccess("finance.import")` |

### API Guard Wrapper

| API | Wrapper | 说明 |
|-----|---------|------|
| `/api/modules/finance/accounts*` | `withFinanceLedgerAccess/Write/Delete` | 科目管理 |
| `/api/modules/finance/vouchers*` | `withFinanceLedgerAccess/Write/Delete` | 凭证管理 |
| `/api/modules/finance/balances*` | `withFinanceLedgerAccess/Write` | 余额查询/重算/校准 |
| `/api/modules/finance/periods*` | `withFinanceLedgerAccess/Write/Delete` | 会计期间 |
| `/api/modules/finance/init` | `withFinanceLedgerWrite` | 财务初始化 |
| `/api/modules/finance/reports` | `withFinanceReportAccess` | 报表生成 |
| `/api/modules/finance/budget` | `withFinanceBudgetAccess/Write` | 预算查询/导入 |
| `/api/modules/finance/import/preview` | `withFinanceImportAccess` | 导入预览（非变更操作，用 Access） |
| `/api/modules/finance/import/confirm` | `withFinanceImportWrite` | 导入确认（写入数据库，用 Write） |
| `/api/modules/finance/reclass-rules` | `withFinanceLedgerAccess/Write` | 重分类规则查询/写入 |
| `/api/modules/finance/reclass-results` | `withFinanceLedgerAccess/Write` | 重分类结果列表/生成/审核 |
| `/api/modules/finance/statement-workpapers` | `withFinanceReportAccess/Write` | 底稿查询/保存（P3 Batch 2） |
| `/api/modules/finance/statement-reviews` | `withFinanceReportAccess/Write` | 校对查询/生成/更新/确认（P3 Batch 3） |
| `/api/modules/finance/cost/*` | `withFinanceCostAccess/Write/Delete` | 成本子模块 |
