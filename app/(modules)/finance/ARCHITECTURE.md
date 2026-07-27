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
| 成本管理 | 发货、成本结构、成本分析、销售工资 |

### 生命周期标记

财务模块当前全部按 `workspace-owned` 管理。数据来源为 Workspace 本地资料、Excel 导入、ERP readable 归档和本地数据库表；不在运行时通过 ERP/ERPNext API 取数。

### 总账会计 (`/finance/ledger`)

`LedgerClient` 位于 `packages/finance/ui/ledger`，由 route 薄壳挂载，渲染多个 Tab：

| Tab | 组件 | 说明 |
|-----|------|------|
| 科目设置 | AccountTab / GroupAccountTab | “公司科目”展示单公司本地科目，“集团科目”展示版本化集团科目主表 |
| 凭证明细 | VoucherTab | 凭证录入/查询 |
| 余额表 | LedgerTab | 科目余额表查询、年度余额基准滚动计算 |
| 重分类 | ReclassTab | 期末反向余额、辅助余额调整、长期规则和历史调整的统一工作台 |
| 资产折旧 | — | 资产折旧表（开发中） |

权限动作拆分：

- `finance.ledger.create` — 新增科目、凭证、期间和初始化默认账套。
- `finance.ledger.update` — 编辑已有科目、凭证和期间。
- `finance.ledger.revise` — 重算余额、配置重分类规则、生成/调整重分类结果。
当前总账前端只暴露 `revise`、`export` 相关入口：重分类工作台中的长期规则配置使用 `revise`，工作台导出使用 `export`。年度余额资料统一由受控导入流程处理，不再提供独立的财务导入 L2。科目设置和凭证明细不再提供重分类模式切换；重分类判断和规则统一进入独立 Tab。`create/update/delete` 保留为 API contract 和后端 guard，未出现前端新增/编辑/删除按钮时不要提前读取或传递对应 UI 权限。

科目设置下分“公司科目 / 集团科目”两个子 Tab。公司科目、凭证明细、余额表和重分类共用同一默认账套范围：默认公司由 `SystemConfig` 的 `finance.ledger.defaultCompanyCode` 配置，默认年月优先取该公司最近一次成功总账导入的截止月份；没有可用导入批次时，依次回退到最近有凭证的期间和最近已建期间。公司科目只使用其中的公司与年度，额外筛选只保留科目层级，不再用 `groupSubjectCode` 是否为空伪装“集团/独有”类型。列表按公司本地科目逐行展示，并通过版本化映射解析“集团科目”列的集团编码和名称；人工调整映射时，候选集团科目必须与公司科目的类别和余额方向同时一致。公司科目与集团科目统一显示 `已确认 / 已复核 / 待复核 / 待删除` 四态：编码、名称和属性完全一致的系统映射为已确认，人工选择后为已复核，系统建议为待复核，停用公司科目或待清理集团科目为待删除。集团科目按版本服务端分页，Toolbar 可按资产、负债、共同、权益、成本、收入、费用以及四态筛选；集团科目详情只展示已确认或已复核的公司科目映射。企业会计科目来源中的“共同/共同类”统一保存为 `common`；不得用 `other` 兜底或误归入权益。

重分类规则按“左树右表单”维护：左侧复用集团科目目录层级，节点标注 未确认 / 已重分类 / 无需重分类，状态筛选和节点徽标必须使用同一个有效决策口径；筛选变化时切到首个匹配科目，只有当前表单存在未保存修改时才临时保留被筛出的选中项。默认展开有异常历史的分支；右侧展示单个科目的基准信息与处理方式、计算口径表单，保存提交仅含该科目的 change set，切换科目前有未保存修改会先确认。继承上级规则的科目表单只读，并提示到来源科目维护。历史版本只读。服务端在一个事务中完成 upsert，并只物化本次变更科目及其规则继承子树在该版本覆盖期间的结果；同一政策版本的集团映射按批次加载，不因期间数量重复查询。不保留批量编辑、逐行删除或单独重分类 icon。

### 财务报表 (`/finance/statements`)

`StatementsClient` 位于 `packages/finance/ui/statements`，由 route 薄壳挂载。页面只有“合并报表 / 单体报表”两个顶层 Tab；“合并报表”下按业务阶段拆为“合并准备 / 对账与抵销 / 合并工作底稿 / 合并报表”四个子页。两边统一提供“年 / 季度 / 月”期间导航。周期类型是报表取数事实，不只是导航粒度：年度以 12 月为期末、季度以 3/6/9/12 月为期末、月度以所选月为期末。选择期间只读取事实，不得自动创建批次或生成分录；创建期间批次、冻结来源、生成抵销分录和推进生命周期都必须由用户显式操作，并写入批次修订与事件历史。

四个合并子页共用同一套周期和批次版本工具栏状态，跨页切换不得重置周期或所选版本；“合并准备 / 对账与抵销”隐藏三表类型，“合并工作底稿 / 合并报表”共用三表类型。工具栏可切换同一母公司、同一期间的历史批次，版本项必须同时显示年度、季度或月份标签；只有当前最新批次已锁定或已发布且新来源已覆盖目标期间时才允许显式创建下一版本，历史批次保持只读。周期、期间或版本切换后，旧响应必须立即失效；响应范围与当前选择不一致时不得渲染批次或开放写操作。

“合并准备”展示母公司可达的内部持股候选、各关系“并表”是/否选择和各主体三张单体报表状态；无批次时具备资本证券治理更新权限的用户可以调整并表范围，已有批次继续读取冻结范围且不可改。单体报表统一为“已就绪 / 未就绪”，只有实际纳入范围主体的三张单体报表均已就绪才允许创建批次并进入第二步。打开草稿时客户端显式调用幂等写接口，系统按当前 ERP 事实自动刷新三表快照、本位币和适用汇率；只有快照正文或自动准备结论变化时才增加 `revision`。第一步只有“提交并开始对账抵销”一个主动作：无批次时自动创建批次，有草稿时复用打开页面时已冻结的最新快照，并在同一次用户操作中记录客观控制结论、自动生成抵销草稿后直接切换到“对账与抵销”；第二步不再保留单独的生成 `+`，也不要求逐项确认来源、本位币、汇率或填写评论。草稿可直接删除并重新创建，不要求继续推进；已提交或已复核批次可带原因退回草稿，锁定或发布后只能创建修正版。删除草稿使用删除语义动作，并在一个事务中清除批次内范围、来源、汇率、控制结论、匹配组、抵销分录和事件；存在后续版本、正式输出或其他批次分录引用时必须阻断。“对账与抵销”按成立以来截至所选期末的全部已记账凭证明细生成投资款、客户/供应商往来抵销草稿，显示累计勾稽金额，但默认只展开所选年度的来源凭证，以前年度按公司关系折叠汇总。审阅人分别对投资款和往来款执行整类通过或整类退回，明细行只展示核对事实和审阅状态；确实无法形成抵销分录的单边或差额事项作为显式例外保留，不生成虚假分录且不阻断合并报表，未审阅或退回的有效抵销草稿不进入合并数。公司关系在页面统一显示为“公司简称 → 公司简称”；公司编码和系统生成的抵销分录号只作为内部稳定标识，不拼接到关系标题、抵销事项或工作底稿展示中，真实来源凭证号仍用于追溯。

合并范围、股权口径、个别三表来源、外币折算和税务口径不再要求编制人确认或评论；系统在第一步提交时按客观事实分别记录“已就绪 / 未就绪”。任一单体报表未就绪时阻止创建批次或开始对账抵销；汇率抓取暂不可用仍保留自动重试，不增加人工确认步骤。只有确实不存在投资权益或内部往来抵销事项时，才在“对账与抵销”按具体事项单独记录“不适用”及证据。最终提交复核仍会重放完整报表、汇率、抵销与输出校验，准备阶段的自动结论不能绕过正式输出校验。`/finance/statements` 的公司展示统一使用公司主数据简称，法定全称仍保留在底层批次事实与导入校验链中。

“合并工作底稿”是三张表共用的标准桥接表，固定按“报表项目 → 各主体折算数 → 个别报表合计 → 抵销借方 / 抵销贷方 → 合并数 → 比较数”展示，并可展开追溯直接写入该报表行的已批准抵销分录。“对账与抵销”只承载来源配对、抵销草稿生成和按抵销类别整体审阅，不再额外维护一张与正式底稿重复的抵销结果总览。草稿、待复核和已复核批次显示可审计预览；锁定或发布后改为冻结输出。历史冻结快照若没有逐主体贡献字段，降级为汇总列展示，不伪造拆分金额。“合并报表”只展示已锁定或已发布批次的正式三表，沿用单体三表展示结构，不展开科目明细；正式报表及导出不得消费编制中预览。单体和合并报表导出固定依次包含“资产负债表 / 利润表 / 现金流量表”三个工作表；页面 Agent 在该路由下只开放 `finance.readStatementsPage`，按当前公司、期间或合并批次读取实时三表，不用资料库文件替代页面事实。

三张单体报表只从 ERP 原始账事实自动生成：资产负债表按固定报表映射和余额重分类调整生成，利润表按期间凭证明细生成，现金流量表按现金流分配生成。页面和合并批次统一使用“ERP 系统账来源”；冻结到合并批次时由系统记录数据截止期、来源状态和内容指纹，不要求人工核对评论。普通创建入口必须先确认每个合并主体最近完成导入的 `cutoffDate` 已覆盖目标期末、年度或季度内会计期间完整，并具备三表最低来源事实；已关账的零发生利润表或现金流量表属于有效零报表。未来期间只有结转余额缓存时显示“仅有结转余额，期间数据未到齐”，不得据此创建批次。报表行及科目映射由 `packages/finance/server/statements/config/*-lines.ts` 定义，`fixed-balance-definition.ts` 是资产负债表聚合与重分类路由的统一入口，不按公司/年度写入配置表。

系统不提供法定终版三表 Excel 上传、提交、导入或覆盖能力。法定资产负债表与系统口径的差异必须通过 ERP 原始账修正或成对的源/目标科目重分类解释，禁止把差额塞入权益。

### 管理会计 (`/finance/analysis`)

`FinanceAnalysisClient` 将法定报表事实加工为内部管理口径。资金来源与用途分析同时读取三层证据：

1. `FinanceCashFlowAllocation` 负责经营、投资、筹资的系统分类；管理口径按流入/流出明细重新计算净额，并与现金类科目变动勾稽。
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

统一读模型位于 `packages/finance/server/analysis/management-analysis.ts`：利润表读取已过账凭证方向发生额，资产负债表读取期末科目余额，现金流量表读取现金流分配；管理口径会明确标注其系统事实来源。成本子账没有 `companyCode`，所以仅作为“未分配公司”的经营事实，不能与单家公司法定收入直接相加或据此生成审计口径毛利。

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
            ├─ packages/finance/ui/ledger/AccountTab.tsx（公司科目）
            ├─ packages/finance/ui/ledger/GroupAccountTab.tsx（集团科目）
            ├─ packages/finance/ui/ledger/VoucherTab.tsx
            ├─ packages/finance/ui/ledger/LedgerTab.tsx
            ├─ packages/finance/ui/ledger/ReclassTab.tsx
            └─ (折旧表, 占位)

statements/page.tsx
  └─ FinanceShell
       └─ @workspace/finance/ui StatementsClient
            ├─ ConsolidationPreparationTab（范围、来源、控制与生命周期）
            ├─ ConsolidationEliminationTab（对账、生成与审阅抵销分录）
            ├─ ConsolidationWorksheetTab（逐主体标准合并工作底稿）
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
5. 后续年度余额表仍可由受控导入流程保存为 `reconcile` 快照，供基准切换和历史追溯；不提供独立的页面上传核对入口。

### ERP readable 归档导入

- `scripts/import/import-finance-readable.ts` 通过统一 prepare/commit 接口导入 readable 资料。T6 是开放结束年度的持续来源；TPlus 仅在迁移年度范围内执行一次历史衔接，并通过 `FinanceSourceLedgerMapping` 指向后续 T6 账套，不能继续作为新增年度来源。
- prepare 阶段必须解析 `source-map.json`、manifest、validation summary 和 `SHA256SUMS.txt`，逐项校验本批次实际消费的 JSONL；缺表、错误表或校验和变化均失败关闭。`FinanceReadableSourcePackage`、`FinanceReadableImportRun` 和 `FinanceLedgerImport.checksum` 保存不可变来源包及每次应用证据，禁止用新快照静默覆盖来源身份。
- T6 导入保留凭证类型、制单/审核/记账/出纳、附件、外部单据链、分录结算信息、科目辅助核算要求、`UA_Period` 期间日期，以及 `GL_mend` 的总账月结、`bAccClosed` 和各模块原始标志。T6 的期间锁定以 `GL_mend.bflag=true`（总账月末结账）派生，`bAccClosed` 只保留为来源审计事实；TPlus 只保留历史凭证、期初/未清项及 `AA_AccountAssociation` 科目衔接，不伪造关账状态。
- 合并批次的本位币优先读取 `FinanceCompanyCurrencyPolicy` 中已经核定的公司财务政策，未维护时才回退到 ERP 基础币种。该政策只用于纠正已确认错误的 ERP 主数据；05 加拿大公司冻结为 CAD，汇率继续按期间由中国货币网自动抓取，不恢复人工汇率录入。
- `FinanceLedgerImport` 保存公司、年度、账套、数据库、快照日期和控制数；科目、凭证、分录及新增事实均保存稳定 source key，年度事务可幂等重跑。
- `FinanceSourceAccountBalance` 保存 ERP 原始余额控制事实；`FinanceAccountBalance` 继续由期初事实加已过账凭证生成，报表不直接覆盖源控制数。
- 辅助成员/余额/凭证链接、现金流分配、AP/AR 未清项、币种和银行账户使用独立规范化事实，供三表下钻和管理会计复用。
- TPlus 的 partner 槽位只作为原始往来对象，不直接等同客户。历史导入在凭证、辅助余额和未清项写完后，按 `(FinanceAuxiliaryMember, FinanceAccount)` 将应收/预收锁定为客户、预付/应付锁定为供应商、个人科目锁定为个人，写入不可变 `FinanceCounterpartyClassification`；重导只允许得到完全相同的归类。T6 继续使用 ERP 原生 customer/supplier/person 维度，不进入该历史归类表。
- `FinanceOpenItem` 已保留单据日、到期日、原始金额、未核金额和状态，并可补录 `agingBaseDate`。一次或多次收付款、对冲、核销及调整分别写入 `FinanceOpenItemSettlement`；账龄天数和账龄区间始终由基准日/到期日/单据日与查询截止日动态计算，不持久化派生值。当前仅准备数据结构，尚未开放人工填写 API 或页面。
- 总账余额工作台的“应收应付”视图按 `1122 / 2202 / 1221 / 2241` 分为 AR、AP、其他 AR、其他 AP 四个子视图。T6 直接读取所选期间 ERP 辅助余额；TPlus 历史只用年初辅助事实加截至所选月份的已记账凭证滚动，往来身份通过锁定的 member-account 归类解析，不能把同一余额的部门、个人等多辅助项重复计数。
- 科目设置、凭证明细、余额表及应收/应付四类视图共用 `/api/modules/finance/ledger/export` 下载 XLSX。导出必须复用页面当前公司、期间、关键词和分类筛选，并遍历全部服务端分页；凭证明细按分录逐行导出，其余工作表列与页面固定展示口径一致。下载要求显式 `finance.ledger.export` 权限，不得回退为普通 read。
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
6. 删除 active baseline：必须先选择新的 baseline。删除普通 reconcile snapshot 可直接级联删除。

## 集团科目与公司科目映射

集团科目是独立主数据，不再把 `FinanceAccount.code` 或运行时名称匹配当作集团身份。租户配置中的参考公司先以原编码建立 `FinanceGroupAccount`；其他公司、来源账套的本地科目通过 `FinanceGroupAccountMapping` 持久化到稳定的 `groupAccountId`。

科目导入和显式回填会为每个公司科目建立映射项，候选集团科目必须与本地科目的类别和余额方向完全一致（资产只对资产、负债只对负债）。同码、同名、同属性的唯一结果记为 `已确认`；同编码族内的唯一同名结果或相似编码名称结果记为 `待复核`。没有可复用候选时，系统按中国会计编码惯例创建 `待复核` 的建议集团科目并立即映射，因此正常同步结束后不允许遗留空映射。版本内映射唯一键是 `(policyVersionId, companyCode, sourceScopeKey, localAccountCode)`，禁止在跨账套调用中退化为仅按本地编码查询。

| 表 | 文件 | 说明 |
|---|---|---|
| `FinanceGroupAccount` | `prisma/models/finance-group-chart.prisma` | 稳定集团科目身份；`id` 跨政策版本不变 |
| `FinanceAccountingPolicyVersion` | `prisma/models/finance-group-chart.prisma` | 集团科目与重分类共用的政策版本和生效区间；V1 覆盖首个后续版本生效前的全部历史期间 |
| `FinanceGroupAccountRevision` | `prisma/models/finance-group-chart.prisma` | 指定政策版本下与公司科目一致的编码、名称、类别、余额方向、层级、币种、父级和启用状态快照；底层保留来源助记码用于导入兼容，但公司科目与集团科目页面、编辑表单及导出均不展示；集团映射字段因自指不展示 |
| `FinanceGroupAccountMapping` | `prisma/models/finance-group-chart.prisma` | 指定政策版本下，公司、来源账套、本地科目到 `groupAccountId` 的持久化映射，并保留本地属性、年度和映射方式快照 |

映射维护收口在科目设置：公司科目列表逐行展示映射结果，集团科目详情展示已确认或已复核的公司科目映射。服务端消费者优先按 `FinanceAccount.id` 或 `sourceScopeKey + localAccountCode` 批量读取；期间查询以期间结束日命中唯一集团科目版本，不能用 `year` 或来源年度选择版本。

当前生效版本的子公司映射允许财务人员在科目设置的公司科目列表内人工复核；历史版本保持只读。人工保存写入 `manual_override`，同步更新来源科目的集团科目编码，并重算受影响期间的辅助余额与自动重分类调整。

`mappingMethod` 只记录映射的产生方式，不直接展示为用户分类。列表只暴露三种业务状态：`已确认` 表示同码、同名、同属性的系统确定项；`待复核` 表示系统给出的同编码族同名、相似编码名称或新增集团科目建议；`已复核` 表示财务人员已经接受或人工改正。编码、名称、类别、余额方向和候选评分由 `mapping-review.ts` 的单一诊断 interface 处理；同名不能跨资产、负债、共同、权益、收入、成本、费用类别推荐，算法细节不作为页面分类。

当前生效版本的待复核映射可在科目设置的公司科目列表中改选已有集团科目后保存，保存即写入 `manual_override`。集团科目页允许在当前版本直接人工新增，不因此自动顺延版本号；新增科目初始为 `待复核`。集团科目字段与公司科目表共用同一字段模型，仅隐藏自指的“集团科目”字段。

集团科目页使用左侧科目树、右侧详情编辑区：左侧只显示编码和名称，右侧默认进入可编辑状态并通过表单根动作直接保存，不再二次打开编辑弹窗；工具栏新增动作在右侧打开 block 表单，不使用弹窗。字段沿用公司科目的编码、名称、类别、余额方向、币种和父级口径，隐藏自指的集团科目字段；币种必填，默认人民币并从常用币种中选择。详情下方只展示已经人工复核到该科目的公司、账套、本地科目及实际存在的科目年份，系统确认和待复核映射不混入详情。公司科目虽然按 `year` 存储，但映射身份是 `(policyVersionId, companyCode, sourceScopeKey, localAccountCode)`：同一集团科目版本内，同公司、同账套、同本地编码跨年复用一条映射，`latestYear` 只是同步快照。若某日起映射语义改变，应发布带生效日的新集团科目版本，不按年度复制映射。

集团科目有 `已确认 / 已复核 / 待复核 / 待删除` 四种状态；`已确认` 只由参考公司种子落下，人工不可设置，人工新增与系统建议初始为 `待复核`。复核是独立于编辑的一键动作（`finance.ledger.groupAccount.review`，需要 `finance.ledger` 的 `approve` 权限），不再随编辑表单整体提交：`待复核` 行可“复核通过”转为 `已复核` 或“标记删除”转为 `待删除`；`待删除` 行可“批准删除”走既有引用守卫硬删，或“恢复”回 `已复核`；`已确认 / 已复核` 为终态。系统建议科目复核通过或恢复时，在同一事务内只把仍指向该科目的精确来源映射从 `suggested` 提升为 `manual_override`；来源映射已经被用户改到其他科目时不得覆盖。复核通过和恢复会记录复核人与复核时间（`reviewedBy` / `reviewedAt`），数据库继续保存 UTC 时间点，集团科目详情按租户业务时区只读展示。参考公司科目即使名称相同，只要编码或父级路径不同就不是重复科目，不能自动标记待删除；只有系统建议科目已被更可靠的同码同名或同一集团父级下同名科目替代，并且已无公司映射、下级科目、重分类规则及结果引用时，才标记为 `待删除`。待删除项从集团科目候选、公司映射、重分类规则和报表解析中排除；待人工删除前保留记录用于审计。删除只删除集团主数据及当前版本修订，不修改公司科目、凭证和账目；存在公司映射、下级科目、历史版本修订、重分类规则或重分类结果引用时必须阻断并先迁移引用。

系统需要新增建议集团科目时，先解析来源公司科目的父级映射：有集团父级时优先沿用来源两位后缀，冲突时在该集团父级下按现有最大序号递增；无父级时优先保留未占用且符合类别前缀的四位本地编码，否则在同类别一级集团科目中递增分配。禁止再用映射行 ID 拼接 `199... / 299...` 之类与集团层级无关的编码。

集团科目自身采用统一的中国企业会计编码惯例并由 service 与数据库约束共同阻断：资产、负债、共同、权益、成本分别以 `1/2/3/4/5` 开头，收入和费用均以 `6` 开头。该检查只约束集团科目，不约束境外或不同会计制度下的公司本地科目；后者必须先映射到合规集团科目。集团科目列表读取时会校验所选完整版本，任一科目不合规即返回明确的科目编码、名称和错误原因。

同码在不同来源账套中可以代表不同业务语义。此类已核定映射以 `hierarchy_match` 记录，表示结合本地科目所属资产/负债层级和集团父子科目确认，不能仅按裸编码或裸名称跨账套复用。

首次迁移或需要补齐历史科目时运行 `npm run finance:group-chart:sync`。正常科目导入在同一业务写入链中自动同步，不要求按年度复制集团科目；映射的 `latestYear` 仅为来源快照。历史上已经复核、但精确来源映射仍为 `suggested` 的存量异常不得靠同步或 Prisma migration 静默改写，只能通过 `finance-reviewed-origin-mappings-v1` 私有数据发布 handler，绑定政策版本与精确来源映射清单后修复。版本属于整张集团科目表，而不是年份或单个科目：政策区间采用半开区间 `[effectiveFrom, effectiveTo)`，V2 生效时在同一事务中关闭 V1，并完整复制下一版集团科目修订、公司映射和重分类规则；重分类规则必须引用同一个 `policyVersionId`，不能维护第二条可独立生效的时间轴。

## 重分类系统

重分类工作流以期末余额和客户、供应商、个人等辅助核算对象为判断基础。反向发生额或单笔凭证方向不能直接证明需要重分类；工作台先区分重分类候选、待确认、允许负数、抵减科目和非资产负债表项目，再展示已经确认的辅助余额调整或人工调整。

### 数据模型

| 表 | 文件 | 说明 |
|---|---|---|
| `FinanceReclassRule` | `prisma/models/finance-reclass.prisma` | 版本化集团科目人工结论：`(policyVersionId, sourceGroupAccountId, abnormalSide)` → `reclassify / no_reclass` |
| `FinanceReclassItemRule` | `prisma/models/finance-reclass.prisma` | 旧版凭证明细例外快照；只保留历史数据，不再写入或参与当前重分类决策 |
| `ReclassResult` | `prisma/models/finance-ledger.prisma` | 明细级结果：每条凭证明细的生成/审核结果，`ruleId` 可空 |
| `FinanceBalanceReclassAdjustment` | `prisma/models/finance-reclass.prisma` | 每个期间、源科目唯一的当前结果；规则自动结果、辅助余额结果或人工结果互斥 |
| `FinanceBalanceReclassAdjustmentHistory` | `prisma/models/finance-reclass.prisma` | 当前结果被重算、人工覆盖或恢复自动前的 append-only 快照，仅按所选期间追溯 |

### 规则表 (`FinanceReclassRule`)

- 重分类规则页只维护当前生效的集团科目版本，不再向用户展示可切换的“政策版本”筛选；保存 contract 仍显式携带服务端返回的当前 `policyVersionId`
- 当前政策版本内资产、负债、权益类有效集团科目作为源和目标科目可选范围；损益类科目不进入资产负债表重分类。规则候选只用历史期末余额标记是否曾出现异常，不扫描单笔凭证方向
- 历史期末余额从未出现异常方向且没有人工规则的科目，派生为“无需重分类”，不写入伪人工确认记录；只有出现过异常方向且没有规则的科目进入“未确认”
- `@@unique([policyVersionId, sourceGroupAccountId, abnormalSide])` 在单个政策版本内唯一
- 规则匹配只使用 `policyVersionId + sourceGroupAccountId + abnormalSide`；公司本地科目必须先按期间版本映射到集团科目，不能用本地编码直接命中规则
- `abnormalSide`: `debit` = 异常借方、`credit` = 异常贷方、`both` = 全部重分类
- `decision`: `"reclassify"` 必须同时保存 `targetGroupAccountId`；`"no_reclass"` 必须保持目标为空；源/目标编码仅为版本内审计快照
- `basis`: `account_net` = 按科目净额、`counterparty_gross` = 按往来户逐户（毛额）；change set 未携带时按候选 `defaultBasis` 落库（有辅助余额事实的科目默认毛额，否则净额）；无辅助余额事实的科目不能选择毛额口径。口径只属于规则，期间调整工作台只展示“科目净额 / 按户逐户”徽标，不提供编辑
- 子集团科目没有直接规则时才沿 `parentGroupAccountId` 继承最近上级规则；继承判断使用稳定集团科目 ID，不比较编码快照，上级科目不能反向继承下级规则
- 其他公司的本地科目编码、名称和账套差异只在 `FinanceGroupAccountMapping` 中处理；映射完成后的重分类规则不保留公司或来源账套作用域
- `source` 只使用 `"manual"`；数据库记录只表示人工结论，不用记录缺失本身推断未确认，也不存在静态配对回退
- 保存目标、明确选择“无需重分类”都会记录确认人和确认时间
- 若源或目标集团科目在当前版本中不存在或已停用，整次规则保存返回冲突并回滚，避免旧自动调整继续生效
- 缺少确认人或确认时间的历史 `manual` 标记不作为规则消费；若科目历史出现过异常方向则退回未确认，否则按历史余额派生为无需重分类

### 结果表 (`ReclassResult`)

- `@@unique([periodId, voucherItemId])` 确保同一明细只有一条结果
- `ruleId` (Int?) 追溯到生成此结果的 `FinanceReclassRule`；手工添加或历史兼容时为 null
- `status`: 默认 `approved`（系统自动通过），`adjusted`（人工调整，受保护不被覆盖），`pending`（历史兼容，不在 UI 主流程），`rejected`（历史兼容）
- 历史 `ReclassResult` 仅用于追溯，不再被当前报表消费；报表只消费余额层 `FinanceBalanceReclassAdjustment`

### 端到端数据流

```
┌─ 配置规则 ──────────────────────────────────────────────┐
│ 重分类工作台 → 会计政策版本内的集团统一规则               │
│   GET /api/modules/finance/ledger/reclass-rules             │
│   GET 按 policyVersionId 读取集团科目与人工确认状态         │
│   PUT change set → 写入当前版本结论并重算该版本覆盖期间     │
└──────────────────────────────────────────────────────────┘
                    ↓
┌─ 生成结果 ──────────────────────────────────────────────┐
│ 导入辅助余额表 → 按辅助对象期末净余额判断                 │
│   importAuxiliaryReclassAdjustments()                     │
│   人工确认 reclassify/no_reclass 均物化为本期当前结果       │
│   sourceType="auxiliary_balance"，note 保存辅助对象明细  │
│   sourceType="manual" 的人工结果受保护，不被自动导入覆盖  │
└──────────────────────────────────────────────────────────┘
                    ↓
┌─ 工作台 ────────────────────────────────────────────────┐
│ /finance/ledger → 重分类                                  │
│   “重分类”父 Tab 切换规则设置/期间调整                     │
│   schedules/reclassify 汇总期末反向余额、现有规则、余额调整 │
│   当前状态 → 自动分类 / 人工分类 / 无需处理 / 未配置        │
│   历史记录 → 当前结果被替换前的自动、人工、无需处理快照     │
│   持久化应用金额与当前反向余额分列；不一致时标记待复核      │
│   PUT reclass-adjustments → 人工分类、人工无需处理、恢复自动 │
│   已结账期间仍可调整报表列示，不修改凭证、余额或结账状态    │
│   已结账期间不能恢复自动；历史记录始终只读                  │
└──────────────────────────────────────────────────────────┘
                    ↓
┌─ 报表消费 (只读) ───────────────────────────────────────┐
│ /api/modules/finance/statements/reports → generateReport()                   │
│   资产负债表查询 FinanceBalanceReclassAdjustment           │
│   只消费 decision=reclassify 且目标科目非空的当前结果       │
│   reclassifyFromEntries() 构建 deductions + additions      │
│   按 sourceAccount 扣减 → 按 targetAccount 增加           │
│   展开明细按本年/上年调整展示期末/期初余额                │
└──────────────────────────────────────────────────────────┘
```

### 报表消费口径

- 资产负债表及其展开明细只消费 `FinanceBalanceReclassAdjustment` 中 `decision="reclassify"`、目标科目非空且 `status IN ("approved", "adjusted")` 的当前结果；`no_reclass` 和历史表永不进入报表
- 资产负债表按一般企业法定格式依次列示“期末余额 → 上年年末余额”。期末列使用所选截止月的原账期末余额和该月重分类结果；比较列统一使用本年 1 月原账期初余额，并叠加上年 12 月重分类结果。年报、季报、月报只改变期末截止日，不改变资产负债表比较基准；“本月期初 = 上月期末”属于总账连续性和月度变动分析，不作为法定资产负债表比较列。重分类只影响报表列示，不写回总账余额
- 按 `sourceAccount` 前缀扣减对应资产负债表行（资产 1xxx 扣贷方，负债 2xxx 扣借方）
- 按 `targetAccount` 前缀增加到对应资产负债表行
- `ReclassEntry { sourceAccount, targetAccount, amount }` 精确金额，非整科目余额
- 规则确认时间只用于审计，来源导入截止日只用于标识原始数据范围，两者都不参与重分类期间归属。期间结束日按半开区间命中唯一 `policyVersionId`；规则 change set 保存后，在同一事务按集团科目层级重算该版本覆盖的全部现有账套期间。已结账和未结账期间都按各自期末事实生成报表列示调整。
- 可读财务归档导入完成后，会在同一事务重跑已确认长期规则，保证“先确认规则后导入数据”和“先导入数据后确认规则”得到相同结果。有辅助对象明细时优先物化 `auxiliary_balance`，否则按科目反向期末余额物化 `automatic_rule`；`no_reclass` 同样物化为目标为空的当前结论。
- 人工修改统一写为 `sourceType="manual"`，包括人工选择“无需处理”；优先级为人工 > 自动分类/自动无需处理。恢复自动会先归档人工当前结果，再按确认规则重建；关闭期间禁止恢复自动。
- 任一当前结果被替换或删除前必须写入 `FinanceBalanceReclassAdjustmentHistory`。工作台“历史记录”只查询所选期间，保留自动、人工和无需处理的全部旧结论；旧 `ReclassResult` 继续作为只读历史兼容记录。
- 工作台把持久化的报表应用金额与当前反向余额分列；源余额归零、转为正常方向或金额变化时仍保留调整，并标记为待复核，不能让报表仍消费但 UI 静默消失。
- 毛额口径行的“当前反向余额”为当前逐户毛额；无辅助余额事实的毛额行不显示金额（标记“无辅助余额事实”），编辑动作只允许“无需处理”，保存 reclassify 会被服务端 409 拒绝。
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

- 自动科目规则按“有效规则边界”计算净额：父子科目解析到同一处理结论和目标科目时，使用最高层规则科目的期末净余额；只有处理结论或目标不同的子树才单独切开。禁止把同一税种下的进项、销项等借贷叶子分别按毛额重分类。
- 常用往来配对覆盖：1122↔2203、1123↔2202、1221↔2241；更具体的 122101/122102 与 224101/224102 优先于父级规则。
- 应交税费 2221 出现借方余额时，默认重分类到 1463 其他流动资产。
- 默认规则沿版本内集团科目父子层级继承，企业本地自设明细先映射到稳定集团科目身份，无需逐个配置；用户仍可在重分类工作台调整目标科目，人工调整继续受保护。

### 利润表与现金流量表数据源

- 资产负债表使用固定映射、期末余额和重分类结果生成。
- 利润表使用 `reports/income-system-amounts.ts` 按公司、年度和已过账凭证明细分别聚合所选月份发生额与截至所选月份的本年累计金额，并根据行配置分别生成合计。
- 现金流量表使用 `FinanceCashFlowAllocation` 和 ERP 现金流项目生成本年累计的经营、投资、筹资分类；累计数以年度首月期初和所选期间期末货币资金勾稽，无源分配或分配不完整时明确返回 diagnostics。系统可保留当月计算用于内部勾稽，但不得作为一般企业法定现金流量表的额外列。
- 利润表和现金流量表在页面、合并冻结输出及 Excel 导出统一按一般企业法定格式列示“本期金额 → 上期金额”；本期金额为本年年初至所选期间末累计数，上期金额为上年可比累计期间数。资产负债表、利润表和现金流量表不得用年份或自定义“当月金额”替代法定列名。
- 法定终版三表上传页面、API、业务动作和导入脚本均已删除。

### 合并报表边界

合并报表不等于多公司简单相加，也不复用单体报表的负数重分类。`/finance/statements` 的“合并报表”父 Tab 按“合并准备 → 对账与抵销 → 合并工作底稿 → 合并报表”组织；期间选择只驱动事实读取，批次、来源冻结、抵销生成和生命周期都由显式动作推进。税务影响作为对应调整分录的从属底稿或控制结论处理。“单体报表”继续展示各公司个别三表。

合并范围和持股比例只读取资本证券物化投影 `OwnershipInterest`：`isConsolidated` 决定纳入范围，`ownerPartyId/issuerCompanyId/shareRatio` 表达直接法律持股关系，`effectiveFrom/effectiveTo` 表达控制期间；Finance 仅接受 owner Party 已链接内部 Company 的并表关系。Finance 页面调整“并表”时调用资本证券治理动作，按所选报告期末追加只改变控制方的确认快照事件，并在同一事务中整体重建投影；不得直接更新 `OwnershipInterest`，也不得在 Finance 建立第二份范围表。其他股权事实同样必须先进入统一注册资本事件账本，再由投影器整体重建 `OwnershipInterest`；受治理导入校验比例、期间和控制链，Finance 在创建批次时再次阻断环路、同一期间多直接持股方或非内部公司控制方。无既有批次或显式母公司参数时，Finance 从有效内部持股关系中选择覆盖范围最大的最上层主体，不能从中间控股公司截断上游主体；首次进入默认展示合并范围内三表来源均完整的最近期间，仍允许用户显式切换到其他期间。批次冻结整条直接持股链及各关系版本；投资方可以是顶层母公司，也可以是任意层级的中间控股公司。持股比例不足 100% 时，必须先完成少数股东权益计算才可自动抵销；比例缺失或链路与法律资料不一致时明确阻断，不自动猜测比例或金额。

外币中间价事实存放在 `FinanceStatementExchangeRate`，不提供人工逐项录入。系统从中国外汇交易中心（中国货币网）自动抓取人民币汇率中间价，按币种对和中间价日期幂等保存，并保留原始币种对、报价单位、来源 URL、抓取时间和中间价日期；`CAD/CNY`、`100JPY/CNY`、`CNY/MOP` 等方向和单位统一换算为“人民币/1 外币”。实体本位币从 ERP `FinanceCurrency.isBase` 主数据推导，不再保留人工“基本信息”页。批次创建、打开草稿和第一步提交都会自动尝试冻结本期、有比较数时的比较期期末汇率，以及境外主体每笔实收资本、股本、资本公积和可唯一识别被投资主体的长期股权投资发生日汇率；抓取暂不可用时记录外币折算“未就绪”，不阻止进入对账抵销，也不静默生成虚假汇率，后续打开草稿会自动重试。最早可用账期已存在但缺失原始出资凭证的期初资本，以最早账期起始日作为显式、可追溯的历史折算日。并购日处理仍暂不启用。

当前自动抵销只覆盖两类：母公司长期股权投资与子公司实收资本/资本公积，以及合并主体之间的客户/供应商往来。内部销售与未实现利润、内部长期资产、收益/股利分配、内部现金流、并购日处理和递延所得税均延期，不得作为当前生成或发布阻断。抵销分录按总账日记账结构组织为凭证头和借贷行，借贷必须平衡且落到批次冻结来源中的规范 `lineCode`。每条生成行关联真实 `FinanceVoucherItem`、本方和对方实体快照；`FinanceConsolidationMatchGroup` + `FinanceConsolidationMatchSource` 独立保存 1:1、1:N、N:1 或 N:N 来源组、分配金额、指纹、规则版本与差额。

往来匹配只消费已通过真实 FK 绑定集团 `Company` 的凭证明细，按公司对汇总双方截至期间的全部已记账分录；只有双方净额方向相反且分币一致时生成草稿。投资匹配按批次冻结的每一条直接持股关系归集投资方长期股权投资与被投资方实收资本/资本公积的全部凭证明细，形成保留 1:1、1:N、N:1 或 N:N 原始证据的关系组；未标关联公司的投资凭证只有在法律持股链和被投资方权益证据共同留下唯一候选时才归组，不依据摘要猜测主体。未找到一方凭证、多个候选、报表项目未映射、少数股东权益未计算、历史汇率未处理或同币种金额有差异时只保留待复核组及全部来源凭证，不生成虚假分录，也不以期末余额替代凭证证据。生成结果不得写回单体账或用报表差额自动配平。

递延所得税模型保留供后续阶段使用，但当前页面、自动生成和提交校验不要求录入税效，也不把缺少税效作为阻断。

`FinanceConsolidationBatch` 是合并事实根，按母公司、期间、周期类型和版本冻结 `OwnershipInterest` 范围、个别三表 payload、汇率及应用、控制结论、凭证匹配组和抵销分录；同一 12 月截止日的年度批次、第四季度批次和月度批次相互独立，既有批次迁移为月度。`revision` 是每次草稿写入和生命周期操作的 CAS 令牌。生命周期为 `draft → submitted → reviewed → locked → published`，复核阶段也可带原因退回 `draft`。编制人提交后不得原地修改，复核人必须与所有编制/来源贡献人独立；草稿可按当前 `revision` 直接硬删除，删除后不保留批次事件，已进入提交阶段则必须先退回草稿。所有要求员工操作者姓名的合并动作都走 Platform 统一业务操作者身份；未绑定员工的 root `admin` 以固定签名“管理员”记入事件，普通账号仍必须绑定员工。一个范围内已有草稿时，创建命令只返回该草稿，不因来源或持股事实变化自动堆叠新版本；用户可刷新草稿来源，或删除草稿后按最新事实重建。锁定、发布后只能新建版本。锁定、发布前都会重放快照并校验来源指纹、当前两类抵销落表和资产负债表当期/上期平衡。

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
| `POST/PUT /api/modules/finance/ledger/group-accounts` | 集团科目新增（catalog）与公司科目映射 change-set 保存 |
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

## 工作空间轻代码读取模型

Finance 通过 `packages/finance/server/workspace-analysis-source-registrations.ts` 与
`cost/workspace-analysis-sources.ts` 登记稳定经营事实，并由
`cost/workspace-analysis-source-executor.ts` 的同一个 owner executor 执行。当前 Finance owner
共登记 60 个版本化 source：通用财务读取模型 54 个，成本/发货读取模型 6 个。

每个 source 继承对应受保护 GET contract 的
`resourceKey + requiredActions + projection + enforcement`，执行时仍由 Finance owner 重新检查
请求账号的原业务 `read` 和原 service 的对象可见范围。公开 DTO 中稳定的标量字段均可进入分析，
内部 ID、版本、时间戳和来源文件/Sheet/行号不会仅因“内部”标签被省略；`sensitivity` 与
`exportPolicy` 只描述敏感级和导出处理，不形成第二套查询权限，也不阻断已获原业务权限的分析。

当前除成本 6 个源外，已登记：

- 总账：公司科目及集团映射、科目余额、往来余额、会计期间、凭证头与分录、现金流分配、来源元数据、
  重分类结果/规则/工作行、集团科目目录及其年度、实际父级、父级建议和公司科目映射明细。公司科目映射子源同时保留原接口公开的实际集团科目 ID、编码和名称；实际父级与诊断建议是两个不同事实，不互相替代。
- 资产：资产卡片、期间折旧、资产调整、逐科目勾稽、期间汇总。
- 预算与成本导入：预算版本、按月份规范化的部门预算、研发预算、成本导入批次。
- 管理分析：资金活动、来源/用途、总账渠道、余额信号、逐公司资金汇总，以及经营绩效、费用结构、
  营运资金、现金情景、预算偏差、KPI、风险、覆盖度和业务排行。
- 报表与合并：资产负债表/利润表/现金流量表行、报表科目取数及重分类、合并范围实体、合并报表行和逐公司贡献。

以下读取面暂不登记为轻代码数据源：导出/下载、选项/lookup/search、权限与配置、模板与运行时、
纯工作流动作和不稳定控制面组合。嵌套业务数组必须拆成有界标量子源；父记录超过 4,000 行或
规范化结果超过 4,000 行时直接失败，不能用父列表当前页伪造“全量”。

成本事实源都支持按 `importId` 精确筛选，并包含公开 DTO 已暴露的批次 ID、创建/更新时间等稳定标量。
导入详情 API 中五类 `take:5` 数组只用于页面预览；coverage 由完整分页的批次、发货、工资、车间归档、
成本构成和成本分析源共同派生，绝不把五行样本登记成“完整数据”。成本构成公开产品对象还等价展开为
`productMasterCode` / `productMasterName`，继续继承 `finance.cost.read`，不额外要求 Inventory 权限。

Finance 的 source discovery 组合本地 Finance owner 与 8 个远程业务 owner：Administration、
Capital Securities、External、HR、Inventory、Library、Production、Work。目录只汇总各 owner
对当前 requester + target 返回的可用 source；每个 owner 在执行时继续按自己的原业务权限和
对象可见规则授权，Finance 不替其他模块建立字段白名单或放宽其读取范围。

## 权限标准

### 资源键

| 资源 | 键 | 说明 |
|------|-----|------|
| 财务根 | `finance` | 任一财务子权限的汇总标识 |
| 总账会计 | `finance.ledger` | 科目、凭证、余额、期间、重分类、折旧 |
| 财务报表 | `finance.statements` | 资产负债表、利润表、现金流量表 |
| 管理会计 | `finance.analysis` | 经营分析、部门利润、预算执行分析 |
| 预算管理 | `finance.budget` | 部门预算、研发预算、调整、执行 |
| 成本管理 | `finance.cost` | 发货、成本结构、成本分析 |

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

### API Guard Wrapper

| API | Wrapper | 说明 |
|-----|---------|------|
| `/api/modules/finance/ledger/accounts*` | `finance.ledger.read/create/update/delete` | 科目管理 |
| `/api/modules/finance/ledger/group-accounts` | `finance.ledger.revise` | 集团科目新增与公司科目映射保存 |
| `/api/modules/finance/ledger/vouchers*` | `finance.ledger.read/create/update/delete` | 凭证管理 |
| `/api/modules/finance/ledger/balances` | `finance.ledger.read/revise` | 余额查询/按年度基准重新计算 |
| `/api/modules/finance/ledger/periods*` | `finance.ledger.read/create/update/delete` | 会计期间 |
| `/api/modules/finance/ledger/init` | `finance.ledger.create` | 财务初始化 |
| `/api/modules/finance/statements/reports*` | `finance.statements.read` | 报表生成/取数明细 |
| `/api/modules/finance/statements/reports/export`、`/api/modules/finance/statements/consolidation/batches/:batchId/report/export` | `finance.statements.export` | 当前单体、合并三表或合并工作底稿下载；合并端点以 `artifact=report/workpaper` 区分文件 |
| `/api/modules/finance/analysis/budget` | `finance.analysis.read` | 预算分析 |
| `/api/modules/finance/analysis/fund-flow` | `finance.analysis.read` | 资金来源与用途管理分析 |
| `/api/modules/finance/analysis/management` | `finance.analysis.read` | 统一管理会计读模型 |
| `/api/modules/finance/budget` | `finance.budget.read/import` | 预算查询/导入 |
| `/api/modules/finance/ledger/reclass-rules` | `finance.ledger.read/revise` | 重分类规则查询/change-set 保存 |
| `/api/modules/finance/ledger/reclass-adjustments` | `finance.ledger.revise` | 期间重分类调整 change-set 保存 |
| `/api/modules/finance/ledger/reclass-results` | `finance.ledger.read/revise` | 重分类结果列表/生成/审核 |
| `/api/modules/finance/cost/*` | `finance.cost.read/import/delete` | 成本子模块 |
