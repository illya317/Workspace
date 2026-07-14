# Finance 财务总账模块架构

## 路由入口

| 页面 | 路由 | 组件 |
|------|------|------|
| 财务首页 | `/finance` | `page.tsx` → Platform `ModuleHome` |
| 总账会计 | `/finance/ledger` | `ledger/page.tsx` → `@workspace/finance/ui` 的 `LedgerClient` |
| 财务报表 | `/finance/statements` | `statements/page.tsx` → `@workspace/finance/ui` 的 `StatementsClient` |
| 报表配置 | `/finance/statement-config` | `statement-config/page.tsx` → `@workspace/finance/ui` 的 `StatementConfigClient` |
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
| 凭证明细 | VoucherTab | 凭证录入/查询 |
| 余额表 | LedgerTab | 科目余额表查询、年度余额基准滚动计算、外部余额表校准 |
| 重分类 | ReclassTab | 期末反向余额、辅助余额调整、长期规则和历史调整的统一工作台 |
| 资产折旧 | — | 资产折旧表（开发中） |

权限动作拆分：

- `finance.ledger.create` — 新增科目、凭证、期间和初始化默认账套。
- `finance.ledger.update` — 编辑已有科目、凭证和期间。
- `finance.ledger.revise` — 重算余额、配置重分类规则、生成/调整重分类结果。
- `finance.ledger.import` — 上传外部余额表进行校准比对。

当前总账前端只暴露 `revise`、`import`、`export` 相关入口：重分类工作台中的长期规则配置使用 `revise`，余额核对使用 `import`，工作台导出使用 `export`。科目设置和凭证明细不再提供重分类模式切换；重分类判断和规则统一进入独立 Tab。`create/update/delete` 保留为 API contract 和后端 guard，未出现前端新增/编辑/删除按钮时不要提前读取或传递对应 UI 权限。

重分类规则编辑遵循页面草稿协议：点击顶部编辑后，目标科目列整体进入编辑态，跨行修改只保存在客户端草稿中；顶部保存一次提交公司+年度的 change set，空目标表示清除已有规则。服务端在一个事务中完成 upsert/clear，再统一同步重分类结果；不保留逐行保存、逐行删除或单独重分类 icon。

### 财务报表 (`/finance/statements`)

`StatementsClient` 位于 `packages/finance/ui/statements`，由 route 薄壳挂载：

| Tab | 组件 | 说明 |
|-----|------|------|
| 财务报表 | ReportTab | 资产负债表/利润表 |

利润表直接按期间凭证明细计算；现金流量表直接读取已导入的 `FinanceStatementWorkpaper` 事实数据。两者都不经过独立的校对、调整或签核页面。

### 报表配置 (`/finance/statement-config`)

`StatementConfigClient` 位于 `packages/finance/ui/statement-config`，由 route 薄壳挂载：

| Tab | 组件 | 说明 |
|-----|------|------|
| 报表项目配置 | LineConfigTab | 资产负债表项目、科目映射和默认规则调整 |
| 遗漏科目 | UnmappedTab | 余额非零但未被 add 消费的科目检查 |
| 余额校对 | BalanceCheckTab | 父子科目余额一致性校对 |

报表配置的科目映射动作贴近具体报表行：添加科目属于 `create`，切换加/减项属于 `update`，删除手工配置或排除默认映射在 UI 上都放在行级删除语义中，避免把“排除默认”显示成新增。

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

重分类工作流以期末余额和客户、供应商、个人等辅助核算对象为判断基础。反向发生额或单笔凭证方向不能直接证明需要重分类；工作台先区分重分类候选、待确认、允许负数、抵减科目和非资产负债表项目，再展示已经确认的辅助余额调整或人工调整。

### 数据模型

| 表 | 文件 | 说明 |
|---|---|---|
| `FinanceReclassRule` | `prisma/models/finance-ledger.prisma` | 科目规则：`(companyCode, year, sourceAccountCode, abnormalSide)` → `targetAccountCode` |
| `FinanceReclassItemRule` | `prisma/models/finance-ledger.prisma` | 明细例外规则：`(companyCode, year, sourceAccountCode, matchType, matchValue)` → `targetAccountCode` |
| `ReclassResult` | `prisma/models/finance-ledger.prisma` | 明细级结果：每条凭证明细的生成/审核结果，`ruleId` 可空 |
| `FinanceStatementAccountMapping` | `prisma/models/finance-ledger.prisma` | 科目→报表项目映射：`(companyCode, year, statementType, accountCode)` → `lineCode` |
| `FinanceStatementLineConfig` | `prisma/models/finance-ledger.prisma` | 报表行定义：section/side/isTotal/isGrandTotal |
| `FinanceBalanceReclassAdjustment` | `prisma/models/finance-reclass.prisma` | 期末余额层调整；正确的自动结果来自辅助余额导入，人工调整受保护 |

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
│ 重分类工作台 → 公司+年度长期规则                         │
│   GET /api/modules/finance/ledger/reclass-rules?companyCode=&year=       │
│   GET 读取公司+年度的支持规则与候选                         │
│   PUT change set → 事务写入/清除 FinanceReclassRule         │
└──────────────────────────────────────────────────────────┘
                    ↓
┌─ 生成结果 ──────────────────────────────────────────────┐
│ 导入辅助余额表 → 按辅助对象期末净余额判断                 │
│   importAuxiliaryReclassAdjustments()                     │
│   应收/预收、预付/应付等支持配对 → FinanceBalanceReclassAdjustment │
│   sourceType="auxiliary_balance"，note 保存辅助对象明细  │
│   adjusted/rejected 受保护，不被后续自动导入覆盖           │
└──────────────────────────────────────────────────────────┘
                    ↓
┌─ 工作台 ────────────────────────────────────────────────┐
│ /finance/ledger → 重分类                                  │
│   schedules/reclassify 汇总期末反向余额、现有规则、余额调整 │
│   未有确认结果 → pending/configured，不进入报表重分类       │
│   approved/adjusted → 已重分类；rejected/exempt → 不消费    │
│   历史 ReclassResult 以“历史凭证调整”只读暴露，等待迁移     │
└──────────────────────────────────────────────────────────┘
                    ↓
┌─ 报表消费 (只读) ───────────────────────────────────────┐
│ /api/modules/finance/statements/reports → generateReport()                   │
│   查询 ReclassResult + FinanceBalanceReclassAdjustment     │
│   只消费 status IN (approved, adjusted)                    │
│   reclassifyFromEntries() 构建 deductions + additions      │
│   按 sourceAccount 扣减 → 按 targetAccount 增加           │
│   资产负债表 reclassLine() 统一应用 src+tgt 路由          │
└──────────────────────────────────────────────────────────┘
```

### 报表消费口径

- **只消费** `ReclassResult` 和 `FinanceBalanceReclassAdjustment` 中 `status IN ("approved", "adjusted")` 的记录，不消费 `pending` / `rejected`
- 按 `sourceAccount` 前缀扣减对应资产负债表行（资产 1xxx 扣贷方，负债 2xxx 扣借方）
- 按 `targetAccount` 前缀增加到对应资产负债表行
- `ReclassEntry { sourceAccount, targetAccount, amount }` 精确金额，非整科目余额
- 报表页不触发生成、不编辑规则、不审核结果；这些入口统一归重分类工作台
- 重分类规则唯一存放于 `FinanceReclassRule`；旧科目字段已迁移并删除，科目 API 不再接受规则写入。

### 科目→报表项目映射

- **`FinanceStatementAccountMapping`** 定义科目归属哪个报表行
- **解析规则**：最近祖先优先
  - 优先用 `FinanceAccount.parentId` 构建 parent chain
  - parent 缺失时 prefix fallback（逐位截断）
  - 无需手动 exclude — 更深层 mapping 自动覆盖父级
- **继承**：`ensureStatementMappings(companyCode, year)` → 已有不覆盖 → 上年复制 → prefix 迁移
- **Resolver**：`statements/shared/mapping-resolver.ts` 的纯内存解析器统一返回行、来源、祖先科目和 operator，报表聚合与重分类共用同一套最近祖先规则。

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
4. **Mapping 是唯一计算口径**：`computeBalanceSheet(config, mappingByLine, reclassByLine)` 的两个路由参数均为必填；聚合或重分类解析失败直接暴露错误，不存在 prefixes 计算或回退分支。
5. **Additive mapping seed**：`ensureStatementMappings(companyCode, year, statementType)` 永不"有就跳过整年"，只按 accountCode 维度跳过（manual / 已有），缺失的 accountCode 从 `line.prefixes` + `line.subtractPrefixes` 补齐。复制上一年后**继续跑 backfill**，避免上一年自身的缺漏跨年漏到新年。

诊断与防回归：

- `npm run runtime-content:check` 校验所有有余额期间均已建立 balance mapping，并与 Docs/Library 的规范数据检查一起作为部署硬门。
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

### 利润表与现金流量表数据源

- 利润表使用 `reports/income-system-amounts.ts` 按公司、年度和截至所选月份的凭证明细聚合本年累计金额，并根据行配置生成合计。
- 现金流量表读取 `FinanceStatementWorkpaper` / `FinanceStatementWorkpaperLine` 中已导入的事实金额；导入仍由 `scripts/import-cash-flow-workpapers.ts` 负责。
- `FinanceStatementWorkpaper` 仅作为内部报表事实来源，不再暴露独立页面或写入 API。
- 独立校对数据层、权限资源、业务动作和确认流程已删除。

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
| `GET/POST/PUT/DELETE /api/modules/finance/ledger/accounts` | 会计科目 |
| `GET/POST/PUT/DELETE /api/modules/finance/ledger/vouchers` | 凭证管理 |
| `GET/POST /api/modules/finance/ledger/balances` | 月度余额查询/按年度基准重新计算 |
| `POST /api/modules/finance/ledger/balances/reconcile` | 上传会计软件年度余额表进行校准核对 |
| `GET/PUT/DELETE /api/modules/finance/ledger/periods` | 会计期间 |
| `GET /api/modules/finance/statements/reports` | 财务报表 |
| `GET /api/modules/finance/statements/reports/detail` | 财务报表取数明细 |
| `GET /api/modules/finance/analysis/budget` | 预算分析 |
| `POST /api/modules/finance/ledger/init` | 财务初始化 |
| `GET/PUT /api/modules/finance/ledger/reclass-rules` | 重分类规则读取与 change-set 保存 |
| `GET/POST/PATCH /api/modules/finance/ledger/reclass-results` | 重分类结果列表/生成/审核 |
| `GET/POST/DELETE /api/modules/finance/cost/*` | 成本管理子模块 |

## 权限标准

### 资源键

| 资源 | 键 | 说明 |
|------|-----|------|
| 财务根 | `finance` | 任一财务子权限的汇总标识 |
| 总账会计 | `finance.ledger` | 科目、凭证、余额、期间、重分类、折旧 |
| 财务报表 | `finance.statements` | 资产负债表、利润表、现金流量表 |
| 管理会计 | `finance.analysis` | 经营分析、部门利润、预算执行分析 |
| 预算管理 | `finance.budget` | 部门预算、研发预算、调整、执行 |
| 成本管理 | `finance.cost` | 发货、成本结构、成本分析、车间工分 |
| 税务管理 | `finance.tax` | 销项/进项、税负、发票（规划中） |
| 司库管理 | `finance.treasury` | 银行账户、资金日报、收付款（规划中） |
| 数据导入与治理 | `finance.import` | 科目/凭证/余额/预算/成本导入 |

各资源支持的动作以 `packages/platform/permission-resource-policy.ts` 为准。成本管理当前是导入后的查询模型，写入不开放通用 `create/update`，只保留导入批次清理和导入脚本语义。

### 权限继承规则

- 父资源 `finance.entry/read/create/update/delete` 按 action policy 覆盖支持继承的子资源动作。
- 子资源 checker 的实现顺序：先查子资源权限，未命中再回退到父资源 `finance.*`。
- 例：只授予 `finance.budget.entry/read` 的用户，可以进入 `/finance/budget`，也可以通过 `/finance` 首页和 Portal 入口（`visibleResourceKeys` 会自动包含祖先 `finance`）。

### 页面 Guard

财务页面统一使用 `requireResourceAccess(resourceKey)` 做服务端门禁（基于 `visibleResourceKeys`）。

| 页面 | Guard |
|------|-------|
| `/finance` | `requireResourceAccess("finance")` |
| `/finance/ledger` | `requireResourceAccess("finance.ledger")` |
| `/finance/statements` | `requireResourceAccess("finance.statements")` |
| `/finance/analysis` | `requireResourceAccess("finance.analysis")` |
| `/finance/budget` | `requireResourceAccess("finance.budget")` |
| `/finance/cost` | `requireResourceAccess("finance.cost")` |
| `/finance/tax` | `requireResourceAccess("finance.tax")` |
| `/finance/treasury` | `requireResourceAccess("finance.treasury")` |
| `/finance/import` | `requireResourceAccess("finance.import")` |

### API Guard Wrapper

| API | Wrapper | 说明 |
|-----|---------|------|
| `/api/modules/finance/ledger/accounts*` | `finance.ledger.read/create/update/delete` | 科目管理 |
| `/api/modules/finance/ledger/vouchers*` | `finance.ledger.read/create/update/delete` | 凭证管理 |
| `/api/modules/finance/ledger/balances` | `finance.ledger.read/revise` | 余额查询/按年度基准重新计算 |
| `/api/modules/finance/ledger/balances/reconcile` | `finance.ledger.import` | 上传会计软件年度余额表进行校准核对 |
| `/api/modules/finance/ledger/periods*` | `finance.ledger.read/create/update/delete` | 会计期间 |
| `/api/modules/finance/ledger/init` | `finance.ledger.create` | 财务初始化 |
| `/api/modules/finance/statements/reports*` | `finance.statements.read` | 报表生成/取数明细 |
| `/api/modules/finance/analysis/budget` | `finance.analysis.read` | 预算分析 |
| `/api/modules/finance/budget` | `finance.budget.read/import` | 预算查询/导入 |
| `/api/modules/finance/import/preview` | `finance.import.read` | 导入预览（非变更操作，用 read） |
| `/api/modules/finance/import/confirm` | `finance.import.import` | 导入确认（写入数据库，用 import） |
| `/api/modules/finance/ledger/reclass-rules` | `finance.ledger.read/revise` | 重分类规则查询/change-set 保存 |
| `/api/modules/finance/ledger/reclass-results` | `finance.ledger.read/revise` | 重分类结果列表/生成/审核 |
| `/api/modules/finance/cost/*` | `finance.cost.read/import/delete` | 成本子模块 |
