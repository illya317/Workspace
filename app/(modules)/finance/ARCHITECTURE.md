# Finance 财务总账模块架构

## 路由入口

| 页面 | 路由 | 组件 |
|------|------|------|
| 财务首页 | `/finance` | `page.tsx` → Platform `ModuleHome` |
| 总账会计 | `/finance/ledger` | `ledger/page.tsx` → `@workspace/finance/ui` 的 `LedgerClient` |
| 财务报表 | `/finance/statements` | `statements/page.tsx` → `@workspace/finance/ui` 的 `StatementsClient` |
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

财务模块当前全部按 `workspace-owned` 管理。数据来源为 Workspace 本地资料、Excel 导入、ERP readable 归档和本地数据库表；不在运行时通过 ERP/ERPNext API 取数。

### 总账会计 (`/finance/ledger`)

`LedgerClient` 位于 `packages/finance/ui/ledger`，由 route 薄壳挂载，渲染多个 Tab：

| Tab | 组件 | 说明 |
|-----|------|------|
| 科目设置 | AccountTab | 会计科目 CRUD |
| 凭证明细 | VoucherTab | 凭证录入/查询 |
| 余额表 | LedgerTab | 科目余额表查询、年度余额基准滚动计算 |
| 重分类 | ReclassTab | 期末反向余额、辅助余额调整、长期规则和历史调整的统一工作台 |
| 资产折旧 | — | 资产折旧表（开发中） |

权限动作拆分：

- `finance.ledger.create` — 新增科目、凭证、期间和初始化默认账套。
- `finance.ledger.update` — 编辑已有科目、凭证和期间。
- `finance.ledger.revise` — 重算余额、配置重分类规则、生成/调整重分类结果。
当前总账前端只暴露 `revise`、`export` 相关入口：重分类工作台中的长期规则配置使用 `revise`，工作台导出使用 `export`。年度余额资料统一从财务导入入口处理，不再在余额表 Tab 提供单独的会计软件余额核对区块。科目设置和凭证明细不再提供重分类模式切换；重分类判断和规则统一进入独立 Tab。`create/update/delete` 保留为 API contract 和后端 guard，未出现前端新增/编辑/删除按钮时不要提前读取或传递对应 UI 权限。

科目设置、凭证明细、余额表和重分类共用同一默认账套范围：默认公司由 `SystemConfig` 的 `finance.ledger.defaultCompanyCode` 配置，默认年月优先取该公司最近一次成功总账导入的截止月份；没有可用导入批次时，依次回退到最近有凭证的期间和最近已建期间。科目设置只使用其中的公司与年度。

重分类规则编辑遵循页面草稿协议：点击顶部编辑后，目标科目列整体进入编辑态，跨行修改只保存在客户端草稿中；顶部保存一次提交公司+年度的 change set，空目标表示清除已有规则。服务端在一个事务中完成 upsert/clear，再统一同步重分类结果；不保留逐行保存、逐行删除或单独重分类 icon。

### 财务报表 (`/finance/statements`)

`StatementsClient` 位于 `packages/finance/ui/statements`，由 route 薄壳挂载。页面只有“合并报表 / 财务报表”两个顶层 Tab；“合并报表”下只有“调整与抵消 / 合并报表”两个子页。选择期间后自动建立内部批次；调整页按公司双方展示投资款和客户/供应商往来的每条来源凭证明细及差额。合并报表沿用单体三表展示结构，但不展开科目明细，也不重复展示流程说明、状态指标或发布前检查。个别资产负债表按资产与负债/权益两列独立展开，明细统一显示“科目名称 · 科目编码、期初余额、期末余额”。

三张表只优先读取状态为 `submitted` 的 `FinanceStatementWorkpaper` 事实数据，从而保留经人工提交的法定报表金额；草稿底稿不能进入正式报表。没有已提交底稿时，资产负债表回退到固定报表映射和余额重分类调整，利润表回退到期间凭证明细。报表行及科目映射由 `packages/finance/server/statements/config/*-lines.ts` 定义，`fixed-balance-definition.ts` 是资产负债表聚合与重分类路由的统一入口，不按公司/年度写入配置表。

页面上传的 Excel 先落入不可变 `FinanceStatementSourcePackage/Sheet/Line` 来源包：保存原文件、SHA-256、解析单位、工作表和逐行事实。上传只产生 draft；提交时服务端重新消费已存解析事实并生成 submitted workpaper，同时记录来源包 revision/checksum，不接受客户端传入的预览金额。CLI 导入和页面上传共用 `packages/finance/server/statements/source-workbook.ts` 的解析口径。

法定资产负债表与系统口径的差异必须用成对的源/目标科目重分类解释，禁止把差额塞入权益；`npm run finance:statements-reconcile-balance -- --company=<公司> --years=<年度> --execute` 会先校验资产、负债和权益勾稽，再写入 `sourceType="reference_workpaper"` 的余额调整。原“报表项目配置、遗漏科目、余额校对”仅服务于建立映射，现已连同写 API、业务动作和配置表删除。

### 管理会计 (`/finance/analysis`)

`FinanceAnalysisClient` 将法定报表事实加工为内部管理口径。资金来源与用途分析同时读取三层证据：

1. `FinanceStatementWorkpaper` 的现金流量表明细负责经营、投资、筹资的法定分类；管理口径按流入/流出明细重新计算净额，不直接信任导入底稿中的合计符号。
2. 已过账 `FinanceVoucherItem` 中 1001/1002/1012 现金类科目的非现金对手科目，用于识别借款、客户预收、股东投入、单位往来、采购、薪酬、税费和投资等管理渠道。
3. `FinanceAccountBalance` 的年度首月期初和所选期间期末用于核对货币资金变动，并展示借款、合同负债、商业信用、单位往来和股东资本等余额信号。

多公司结果是所选公司简单管理汇总，必须显示“未抵销内部资金往来”提示，不能标为法定合并现金流量表。科目余额变化只作为资金来源/占用信号，不等同于当期现金流入或流出。

页面按同一公司/年度上下文组织六个管理视图：

| 视图 | 当前口径 |
|------|----------|
| 管理总览 | 汇总收入、利润、经营现金、营运资金、母子公司对比、风险诊断和管理会计七领域覆盖 |
| 资金与营运 | 计算流动/速动/现金比率、周转天数、营运资金构成，并下钻经营/投资/筹资来源用途和三层勾稽 |
| 预算与预测 | 有有效预算时计算科目累计预算、实际、偏差和执行率；无预算时自动改用上年同期滚动基线，并提供透明假设的13周现金运行率情景 |
| 盈利与成本 | 从利润表计算公司盈利和费用结构；从成本业务子账展示产品、客户、回款、成本类别和产品成本，同时单列未分配公司及未与总账勾稽的差异 |
| 投融资 | 计算资本结构、资产负债率、投资/筹资现金、资本性支出和自由现金流，并展示余额与流水渠道证据 |
| 绩效与风险 | 计算增长、利润、ROA/ROE、偿债和现金 KPI，按负权益、短期偿债、亏损、现金和数据勾稽规则生成风险发现 |

统一读模型位于 `packages/finance/server/analysis/management-analysis.ts`：优先读取三张法定报表底稿；同期底稿缺失时，利润表回退到已过账凭证方向发生额，资产负债表回退到期末科目余额，并明确提示未含报表重分类。成本子账没有 `companyCode`，所以仅作为“未分配公司”的经营事实，不能与单家公司法定收入直接相加或据此生成审计口径毛利。

法定报表继续由 `/finance/statements` 负责，预算编制和版本管理继续由 `/finance/budget` 负责，成本业务明细继续由 `/finance/cost` 负责。管理会计页只做跨事实加工、决策解释、风险阈值和数据覆盖说明，不复制这些模块的编辑流程。NPV/IRR、资本成本、责任中心利润和到期日现金排程缺少项目/合同/责任维度时必须显示边界，不得从总账猜测。

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
            ├─ ConsolidationWorkpaperTab（调整与抵销凭证明细）
            ├─ ReportTab（个别三表）
            └─ ConsolidatedReportTab（锁定/发布批次的合并三表）

analysis/page.tsx
  └─ FinanceShell
       └─ @workspace/finance/ui FinanceAnalysisClient
            ├─ 管理总览
            ├─ 资金与营运
            ├─ 预算与预测
            ├─ 盈利与成本
            ├─ 投融资
            └─ 绩效与风险

budget/page.tsx
  └─ FinanceShell
       └─ BudgetTab.tsx
```

## 数据流

1. 各 Tab 组件独立管理自身状态，通过 API 加载数据
2. 财务数据以 `Period`（会计期间）为核心维度
3. 年度余额表作为本地导入资料，导入后存为 `FinanceBalanceSnapshot`（批次）+ `FinanceBalanceSnapshotRow`（明细）
4. 月度余额 `FinanceAccountBalance` 由系统从 active baseline snapshot + 已过账序时账凭证逐月滚动计算
5. 后续年度余额表仍可通过财务导入入口保存为 `reconcile` 快照，供基准切换和历史追溯；不再提供独立的即时上传核对入口。

### ERP readable 归档导入

- `scripts/import/import-finance-readable.ts` 通过统一 prepare/commit 接口导入 readable 资料。T6 是开放结束年度的持续来源；TPlus 仅在迁移年度范围内执行一次历史衔接，并通过 `FinanceSourceLedgerMapping` 指向后续 T6 账套，不能继续作为新增年度来源。
- prepare 阶段必须解析 `source-map.json`、manifest、validation summary 和 `SHA256SUMS.txt`，逐项校验本批次实际消费的 JSONL；缺表、错误表或校验和变化均失败关闭。`FinanceReadableSourcePackage`、`FinanceReadableImportRun` 和 `FinanceLedgerImport.checksum` 保存不可变来源包及每次应用证据，禁止用新快照静默覆盖来源身份。
- T6 导入保留凭证类型、制单/审核/记账/出纳、附件、外部单据链、分录结算信息、科目辅助核算要求、`UA_Period` 期间日期，以及 `GL_mend` 的总账月结、正式关账和各模块原始标志。`FinancePeriod.isClosed` 只由正式 `bAccClosed=true` 派生；总账月结和子系统年度状态另存审计事实。TPlus 只保留历史凭证、期初/未清项及 `AA_AccountAssociation` 科目衔接，不伪造关账状态。
- `FinanceLedgerImport` 保存公司、年度、账套、数据库、快照日期和控制数；科目、凭证、分录及新增事实均保存稳定 source key，年度事务可幂等重跑。
- `FinanceSourceAccountBalance` 保存 ERP 原始余额控制事实；`FinanceAccountBalance` 继续由期初事实加已过账凭证生成，报表不直接覆盖源控制数。
- 辅助成员/余额/凭证链接、现金流分配、AP/AR 未清项、币种和银行账户使用独立规范化事实，供三表下钻和管理会计复用。
- `scripts/check/check-finance-readable-import.ts` 核对批次控制数、借贷平衡、月度连续性、法定资产负债表和当期三表。ERP 未提供或自身不勾稽的历史现金流分配作为 diagnostics 暴露，不自动制造抵销数。
- readable 快照不包含固定资产卡片或折旧明细；资产折旧表必须等待独立来源，不能由总账余额反推卡片。

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
| `FinanceReclassRule` | `prisma/models/finance-reclass.prisma` | 集团科目人工结论：`(sourceAccountCode, abnormalSide)` → `reclassify / no_reclass`，不区分公司和年度 |
| `FinanceReclassItemRule` | `prisma/models/finance-ledger.prisma` | 明细例外规则：`(companyCode, year, sourceAccountCode, matchType, matchValue)` → `targetAccountCode` |
| `ReclassResult` | `prisma/models/finance-ledger.prisma` | 明细级结果：每条凭证明细的生成/审核结果，`ruleId` 可空 |
| `FinanceBalanceReclassAdjustment` | `prisma/models/finance-reclass.prisma` | 余额层调整；来自辅助余额或经严格勾稽的法定底稿，人工调整受保护 |

### 规则表 (`FinanceReclassRule`)

- 集团全部有效科目的编码并集继续作为目标科目可选范围；规则候选按历史期末余额收窄，不扫描单笔凭证方向
- 历史期末余额从未出现异常方向且没有人工规则的科目，派生为“无需重分类”，不写入伪人工确认记录；只有出现过异常方向且没有规则的科目进入“未确认”
- `@@unique([sourceAccountCode, abnormalSide])` 集团全局唯一
- `abnormalSide`: `debit` = 异常借方、`credit` = 异常贷方、`both` = 全部重分类
- `decision`: `"reclassify"` 必须同时保存 `targetAccountCode`；`"no_reclass"` 必须保持目标为空
- `source` 只使用 `"manual"`；数据库记录只表示人工结论，不用记录缺失本身推断未确认，也不存在静态配对回退
- 保存目标、明确选择“无需重分类”都会记录确认人和确认时间
- 若目标科目在存在待重算辅助余额的开放期间账套中不存在或已停用，整次规则保存返回冲突并回滚，避免旧自动调整继续生效
- 缺少确认人或确认时间的历史 `manual` 标记不作为规则消费；若科目历史出现过异常方向则退回未确认，否则按历史余额派生为无需重分类

### 结果表 (`ReclassResult`)

- `@@unique([periodId, voucherItemId])` 确保同一明细只有一条结果
- `ruleId` (Int?) 追溯到生成此结果的 `FinanceReclassRule`；手工添加或历史兼容时为 null
- `status`: 默认 `approved`（系统自动通过），`adjusted`（人工调整，受保护不被覆盖），`pending`（历史兼容，不在 UI 主流程），`rejected`（历史兼容）
- 历史 `ReclassResult` 仅用于追溯，不再被当前报表消费；报表只消费余额层 `FinanceBalanceReclassAdjustment`

### 端到端数据流

```
┌─ 配置规则 ──────────────────────────────────────────────┐
│ 重分类工作台 → 集团全局长期规则                           │
│   GET /api/modules/finance/ledger/reclass-rules             │
│   GET 读取集团科目并集与人工确认状态                       │
│   PUT change set → 事务写入结论并重算开放期间的辅助余额调整 │
└──────────────────────────────────────────────────────────┘
                    ↓
┌─ 生成结果 ──────────────────────────────────────────────┐
│ 导入辅助余额表 → 按辅助对象期末净余额判断                 │
│   importAuxiliaryReclassAdjustments()                     │
│   仅人工确认 reclassify 的规则可生成 FinanceBalanceReclassAdjustment │
│   sourceType="auxiliary_balance"，note 保存辅助对象明细  │
│   adjusted/rejected 受保护，不被后续自动导入覆盖           │
└──────────────────────────────────────────────────────────┘
                    ↓
┌─ 工作台 ────────────────────────────────────────────────┐
│ /finance/ledger → 重分类                                  │
│   “重分类”父 Tab 以 accordion 子 Tab 切换规则设置/期间调整 │
│   schedules/reclassify 汇总期末反向余额、现有规则、余额调整 │
│   未有确认结果 → pending/configured，不进入报表重分类       │
│   approved/adjusted → 已重分类；rejected/exempt → 不消费    │
│   持久化应用金额与当前反向余额分列；不一致时标记待复核      │
│   PUT reclass-adjustments → 新增或修改期间人工调整          │
│   已结账期间仍可调整报表列示，不修改凭证、余额或结账状态    │
│   历史 ReclassResult 只读暴露且不再参与当前报表消费         │
└──────────────────────────────────────────────────────────┘
                    ↓
┌─ 报表消费 (只读) ───────────────────────────────────────┐
│ /api/modules/finance/statements/reports → generateReport()                   │
│   资产负债表查询 FinanceBalanceReclassAdjustment           │
│   只消费 status IN (approved, adjusted)                    │
│   reclassifyFromEntries() 构建 deductions + additions      │
│   按 sourceAccount 扣减 → 按 targetAccount 增加           │
│   展开明细按本年/上年调整展示期末/期初余额                │
└──────────────────────────────────────────────────────────┘
```

### 报表消费口径

- 资产负债表及其展开明细只消费 `FinanceBalanceReclassAdjustment` 中 `status IN ("approved", "adjusted")` 的记录，不消费 `pending` / `rejected`
- `sourceType="reference_workpaper"` 只允许由严格勾稽脚本写入：源/目标行差额必须成对相等，全部资产与负债差额必须被解释，权益必须保持不变，源底稿自身必须平衡
- 按 `sourceAccount` 前缀扣减对应资产负债表行（资产 1xxx 扣贷方，负债 2xxx 扣借方）
- 按 `targetAccount` 前缀增加到对应资产负债表行
- `ReclassEntry { sourceAccount, targetAccount, amount }` 精确金额，非整科目余额
- 长期规则 change set 保存后，在同一事务按最长科目前缀重新读取已入库辅助余额，只物化开放期间的 `approved + auxiliary_balance` 调整；`adjusted/rejected` 人工事实和关闭期间不被覆盖。
- 工作台把持久化的报表应用金额与当前反向余额分列；源余额归零、转为正常方向或金额变化时仍保留调整，并标记为待复核，不能让报表仍消费但 UI 静默消失。
- 报表页不触发生成、不编辑规则、不审核结果；这些入口统一归重分类工作台
- 重分类规则唯一存放于 `FinanceReclassRule`；旧科目字段已迁移并删除，科目 API 不再接受规则写入。

### 固定科目→报表项目映射

- `balance-sheet-lines.ts` 定义法定报表行、加项前缀、减项前缀和左右侧。
- `fixed-balance-definition.ts` 从同一份定义构建 `mappingMap`、`operatorMap`、`lineSideMap`，并拒绝同一前缀指向两个报表行。
- `mapping-resolver.ts` 先沿 `FinanceAccount.parentId` 找最近祖先；父关系缺失时逐位截断科目编码，因此固定根科目自然覆盖其明细科目。
- 坏账准备、累计折旧、累计摊销等减项通过 `subtractPrefixes` 映射到同一报表行，不再依赖数据库人工配置。

### 资产负债表口径（fixed mapping + residual）

```
固定报表配置 ─→ 最近祖先/科目前缀解析
  ↓
聚合 ─→ residual = own_balance - direct_children_balance_sum
       按分四舍五入后 residual ≠ 0 → 贡献到所属 line
       （避免 parent 自身有余额但 children 全 0 时丢失）
  ↓
行计算 ─→ mappingByLine + reclassByLine（lineCode-keyed）
  ↓
最终金额 ─→ 由 line.side 决定（debit = mk(d-c), credit = mk(c-d)）
```

关键不变量：

1. **Residual leaf 聚合**（Phase 2.3B）：`aggregateMappingBasedBalances()` 计算每个 account node 的 `residual = own - direct_children_sum`，先按分四舍五入，再纳入所有非零分差额。真正叶子（无 children）的 residual = own，与原 leaf-only 行为一致；父级有余额但 children 全 0 时，parent 自身余额代表有效余额，纳入；parent 完全等于 children 汇总时排除，避免双算。`residualParents` 列表作为 diagnostics。
2. **Contra 科目自然抵减**：坏账准备（1231）/ 累计折旧（1602 / 1642）等减项科目必须显式映射到与 gross 同一 lineCode。聚合时借方 - 贷方 = 净值，减项的贷方自然抵减 gross 的借方。
3. **重分类按 lineCode 路由**：`resolveReclassEntriesToLines(companyCode, year, entries)` 把每条 `ReclassEntry.sourceAccount / targetAccount` 解析为 lineCode，按 `lineCode` 增减扣；不再用 `line.prefixes` 前缀匹配。
4. **固定 Mapping 是唯一计算口径**：`computeBalanceSheet(config, mappingByLine, reclassByLine)` 的两个路由参数均为必填；聚合或重分类解析失败直接暴露错误，不存在租户配置或数据库回退分支。

### 默认重分类口径

- 常用往来配对覆盖：1122↔2203、1123↔2202、1221↔2241；更具体的 122101/122102 与 224101/224102 优先于父级规则。
- 应交税费 2221 出现借方余额时，默认重分类到 1463 其他流动资产。
- 默认规则按“最长科目前缀”继承，企业自设明细科目无需逐个配置；用户仍可在重分类工作台调整目标科目，人工调整继续受保护。

### 利润表与现金流量表数据源

- 资产负债表、利润表和现金流量表均优先读取 `FinanceStatementWorkpaper` / `FinanceStatementWorkpaperLine` 中已导入的法定报表事实；三表工作簿由 `scripts/import-financial-statement-workpapers.ts` 导入。
- 没有利润表底稿时，使用 `reports/income-system-amounts.ts` 按公司、年度和截至所选月份的已过账凭证明细聚合本年累计金额，并根据行配置生成合计。
- 没有现金流底稿时，使用 `FinanceCashFlowAllocation` 和 ERP 现金流项目生成经营、投资、筹资分类，并以年度首月期初和所选期间期末货币资金勾稽；无源分配或分配不完整时明确返回 diagnostics。
- `FinanceStatementWorkpaper` 仅作为内部报表事实来源，不再暴露独立页面或写入 API。
- 独立校对数据层、权限资源、业务动作和确认流程已删除。

### 合并报表边界

合并报表不等于多公司简单相加，也不复用单体报表的负数重分类。`/finance/statements` 的“合并报表”父 Tab 只按“调整与抵消 → 合并报表”组织；期间选择直接驱动批次和合并预览，税务影响作为对应调整分录的从属底稿展示。“财务报表”继续展示各公司个别三表。

合并范围和持股比例只读取资本证券主数据 `CompanyRelation`：`isConsolidated` 决定纳入范围，`parentId/childId/shareRatio` 表达直接法律持股关系，`effectiveFrom/effectiveTo` 表达控制期间。资本证券写链校验比例区间、期间重叠、环路和同一期间多父链，并记录编辑人、编辑时间和版本。Finance 不建立第二份股权表，而是在批次中冻结整条直接持股链及各关系版本。当前阶段校验持股关系本身，但少数股东权益及损益分配暂不进入自动生成和发布阻断；比例缺失或链路与法律资料不一致时仍明确阻断，不自动猜测比例或金额。

外币中间价事实存放在 `FinanceStatementExchangeRate`，不提供人工逐项录入。系统从中国外汇交易中心（中国货币网）自动抓取人民币汇率中间价，按币种对和中间价日期幂等保存，并保留原始币种对、报价单位、来源 URL、抓取时间和中间价日期；`CAD/CNY`、`100JPY/CNY`、`CNY/MOP` 等方向和单位统一换算为“人民币/1 外币”。抓取失败必须报错并允许重试，不得静默使用旧值。实体本位币从 ERP `FinanceCurrency.isBase` 主数据推导；缺失时明确阻断，而不是保留人工“基本信息”页。当前仅冻结本期和有比较数时的比较期截止日汇率；并购日、投资日及资本历史汇率折算暂不启用，也不作为发布阻断。

当前自动抵销只覆盖两类：母公司长期股权投资与子公司实收资本/资本公积，以及合并主体之间的客户/供应商往来。内部销售与未实现利润、内部长期资产、收益/股利分配、内部现金流、并购日处理和递延所得税均延期，不得作为当前生成或发布阻断。抵销分录按总账日记账结构组织为凭证头和借贷行，借贷必须平衡且落到批次冻结来源中的规范 `lineCode`。每条生成行关联真实 `FinanceVoucherItem`、本方和对方实体快照；`FinanceConsolidationMatchGroup` + `FinanceConsolidationMatchSource` 独立保存 1:1、1:N、N:1 或 N:N 来源组、分配金额、指纹、规则版本与差额。

往来匹配只消费已通过真实 FK 绑定集团 `Company` 的凭证明细，按公司对汇总双方截至期间的全部已记账分录；只有双方净额方向相反且分币一致时生成草稿。投资匹配不依赖摘要猜测被投资主体，只在母公司投资凭证与某一子公司权益凭证同日、等额、方向相反且互为唯一候选时生成。未找到对方、多个候选、报表项目未映射、币种不一致或金额有差异时只保留待复核组及全部来源凭证，不生成虚假分录，也不以期末余额替代凭证证据。生成结果不得写回单体账或用报表差额自动配平。

递延所得税模型保留供后续阶段使用，但当前页面、自动生成和提交校验不要求录入税效，也不把缺少税效作为阻断。

`FinanceConsolidationBatch` 是合并事实根，按母公司、期间和版本冻结 `CompanyRelation` 范围、个别三表 payload、汇率及应用、控制结论、凭证匹配组和抵销分录；`revision` 是每次草稿写入和生命周期操作的 CAS 令牌。生命周期为 `draft → submitted → reviewed → locked → published`，复核阶段也可带原因退回 `draft`。编制人提交后不得原地修改，复核人必须与所有编制/来源贡献人独立；草稿删除需原因并把完整快照追加到批次事件。未绑定员工的 root `admin` 可创建批次并运行自动生成，以固定签名“系统管理员”记入事件；普通账号仍必须绑定员工。锁定、发布后只能新建版本。锁定、发布前都会重放快照并校验来源指纹、当前两类抵销落表和资产负债表当期/上期平衡。

合并输出分为期间预览和正式快照。期间预览读取当前批次冻结的单体三表并应用尚未冲回的调整与抵销；任何实体缺少 ERP 本位币主数据时直接阻断，不能默认按 CNY 预览。`consolidated-output` 按实体本位币和批次冻结的中国货币网中间价折算并重新计算合计行；页面采用与单体财务报表相同的三表布局，但不展开科目明细。锁定成功时，状态迁移、批次事件和唯一 `FinanceConsolidationOutputSnapshot` 在同一事务写入；当前正式快照只要求已批准的投资/权益及内部往来抵销，暂不要求少数股东分配或递延税调整。快照保存输入/输出 SHA-256、计算版本、完整三表正文和生成时间，数据库禁止更新或删除。发布后的 GET 只校验并返回这份冻结快照，不随代码升级动态重算；任何范围、来源、汇率或分录变化都必须进入新批次版本。

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
| `GET/PUT/DELETE /api/modules/finance/ledger/periods` | 会计期间 |
| `GET /api/modules/finance/statements/reports` | 财务报表 |
| `GET /api/modules/finance/statements/reports/detail` | 财务报表取数明细 |
| `GET /api/modules/finance/analysis/budget` | 预算分析 |
| `GET /api/modules/finance/analysis/fund-flow` | 资金来源/用途、现金流水、余额信号与母子公司核对 |
| `GET /api/modules/finance/analysis/management` | 三表、成本、预算/基线、绩效与风险统一管理分析 |
| `POST /api/modules/finance/ledger/init` | 财务初始化 |
| `GET/PUT /api/modules/finance/ledger/reclass-rules` | 重分类规则读取与 change-set 保存 |
| `PUT /api/modules/finance/ledger/reclass-adjustments` | 期间重分类调整 change-set 保存 |
| `GET/POST/PATCH /api/modules/finance/ledger/reclass-results` | 重分类结果列表/生成/审核 |
| `GET/POST/PUT /api/modules/finance/ledger/assets` | 资产卡片和月度折旧摊销工作台；更新使用卡片版本防止覆盖并发修改 |
| `POST /api/modules/finance/ledger/asset-adjustments` | 独立补录调整，不改写正常计算政策 |
| `POST /api/modules/finance/ledger/asset-periods/recalculate` | 按资产卡片重算开放期间 |
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
| `/api/modules/finance/ledger/periods*` | `finance.ledger.read/create/update/delete` | 会计期间 |
| `/api/modules/finance/ledger/init` | `finance.ledger.create` | 财务初始化 |
| `/api/modules/finance/statements/reports*` | `finance.statements.read` | 报表生成/取数明细 |
| `/api/modules/finance/analysis/budget` | `finance.analysis.read` | 预算分析 |
| `/api/modules/finance/analysis/fund-flow` | `finance.analysis.read` | 资金来源与用途管理分析 |
| `/api/modules/finance/analysis/management` | `finance.analysis.read` | 统一管理会计读模型 |
| `/api/modules/finance/budget` | `finance.budget.read/import` | 预算查询/导入 |
| `/api/modules/finance/import/preview` | `finance.import.read` | 导入预览（非变更操作，用 read） |
| `/api/modules/finance/import/confirm` | `finance.import.import` | 导入确认（写入数据库，用 import） |
| `/api/modules/finance/ledger/reclass-rules` | `finance.ledger.read/revise` | 重分类规则查询/change-set 保存 |
| `/api/modules/finance/ledger/reclass-adjustments` | `finance.ledger.revise` | 期间重分类调整 change-set 保存 |
| `/api/modules/finance/ledger/reclass-results` | `finance.ledger.read/revise` | 重分类结果列表/生成/审核 |
| `/api/modules/finance/cost/*` | `finance.cost.read/import/delete` | 成本子模块 |
