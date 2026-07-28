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
| 凭证明细 | VoucherTab / ReclassTab | “公司明细 / 重分类明细 / 合并明细”分别展示单体凭证、期末重分类调整和集团凭证；三个子页统一使用年、季度、月期间筛选，合并明细的凭证类别、生成方式、当期/截至所选期末的历史汇总范围与导出内容收进低频筛选面板 |
| 科目余额 | LedgerTab | 科目余额查询、年度余额基准滚动计算 |
| 资产折旧 | — | 资产折旧表（开发中） |

权限动作拆分：

- `finance.ledger.create` — 新增科目、凭证、期间和初始化默认账套。
- `finance.ledger.update` — 编辑已有科目、凭证和期间。
- `finance.ledger.revise` — 重算余额、配置重分类规则、生成/调整重分类结果。
当前总账前端暴露 `revise`、`export` 和集团科目复核入口：集团科目中的重分类规则使用 `finance.ledger.revise`，重分类明细导出使用 `finance.ledger.export`，集团科目复核使用 `finance.ledger.approve`。年度余额资料统一由受控导入流程处理，不再提供独立的财务导入 L2。公司凭证、重分类明细和合并明细都是只读查询与追溯页，不读取或传递业务写入权限，不提供新增、编辑、复核或删除入口。重分类规则和合并规则都只在集团科目详情维护；重分类与合并的运行结果统一进入“凭证明细”的“重分类明细 / 合并明细”，对应确认与锁定只在期间工作底稿流程完成。

科目设置下分“公司科目 / 集团科目”两个子 Tab。公司科目、凭证明细、科目余额和重分类共用同一默认账套范围：默认公司由 `SystemConfig` 的 `finance.ledger.defaultCompanyCode` 配置，默认年月优先取该公司最近一次成功总账导入的截止月份；没有可用导入批次时，依次回退到最近有凭证的期间和最近已建期间。凭证明细通过“录入来源”区分 T6、T+ 与 `Workspace 合并`；集团层历史调整必须进入其生效期间的 `FinanceConsolidationEntry`，不得伪装成 ERP 导入事实或继续存入 `FinanceVoucher`。公司科目只使用其中的公司与年度，不再用层级或 `groupSubjectCode` 是否为空伪装业务类型。列表按公司本地科目逐行展示，并通过版本化映射解析“集团科目”列的集团编码和名称；人工调整映射时，候选集团科目必须与公司科目的类别和余额方向同时一致。公司科目与集团科目底层保留 `已确认 / 已复核 / 待复核 / 待删除` 四态：参考公司种子为已确认，全部系统自动对应（包括编码、名称和属性完全一致）均为待复核，人工接受或改选后为已复核，停用公司科目或待清理集团科目为待删除；Toolbar 不单列待删除筛选，“待复核”同时覆盖普通待复核与删除复核中的科目。集团科目按版本服务端分页，Toolbar 可按资产、负债、共同、权益、成本、收入、费用、科目用途以及已确认、已复核、待复核筛选；科目用途分为全部科目、合并科目和重分类科目，合并科目由集团科目自身的合并属性确定，重分类科目由当前版本实际生效且结论为重分类的规则确定（包括上级规则覆盖的下级科目）。集团科目详情只展示已确认或已复核的公司科目映射。企业会计科目来源中的“共同/共同类”统一保存为 `common`；不得用 `other` 兜底或误归入权益。

重分类规则在集团科目详情维护：右侧展示单个科目的处理方式和计算口径，保存提交仅含该科目的 change set；继承上级规则的科目只读，并提示到来源科目维护。历史版本只读。服务端在一个事务中完成 upsert，并只物化本次变更科目及其规则继承子树在该版本覆盖期间的结果；同一政策版本的集团映射按批次加载，不因期间数量重复查询。不再维护第二份规则汇总页；期间运行结果在“凭证明细 / 重分类明细”只读查询与追溯。

### 财务报表 (`/finance/statements`)

`StatementsClient` 位于 `packages/finance/ui/statements`，由 route 薄壳挂载。页面只有“合并报表 / 单体报表”两个顶层 Tab；“合并报表”下按业务阶段拆为“合并准备 / 合并工作底稿 / 合并报表”三个子页。两边统一提供“年 / 季度 / 月”期间导航。周期类型是报表取数事实，不只是导航粒度：年度以 12 月为期末、季度以 3/6/9/12 月为期末、月度以所选月为期末。选择期间只读取事实，不得自动创建批次或生成分录；创建期间批次、冻结来源、生成合并凭证和确认工作底稿都必须由用户显式操作，并写入批次修订与事件历史。

三个合并子页共用同一套周期和批次版本工具栏状态，跨页切换不得重置周期或所选版本；“合并准备”隐藏三表类型，“合并工作底稿 / 合并报表”共用三表类型。工具栏可切换同一母公司、同一期间的历史批次，版本项必须同时显示年度、季度或月份标签；只有当前最新批次已锁定或已发布且新来源已覆盖目标期间时才允许显式创建下一版本，历史批次保持只读。周期、期间或版本切换后，旧响应必须立即失效；响应范围与当前选择不一致时不得渲染批次或开放写操作。

“合并准备”展示母公司可达的内部持股候选、各主体“本次并表”是/否选择和三张单体报表状态；无批次时具备 `finance.statements.update` 的用户可以调整本次报表生成主体，已有批次继续读取冻结范围且不可改。单体报表全部就绪后，“生成合并工作底稿”在同一次显式操作中创建或复用草稿批次、冻结三表与汇率证据、记录客观控制结论并生成合并凭证，然后直接进入工作底稿。来源无法支持的事项保留为缺失证据，不按一侧人民币金额反推外币流水，也不生成虚假凭证。草稿可直接删除并重新创建；锁定或发布后只能创建修正版。

合并范围、股权口径、个别三表来源、外币折算和税务口径不要求编制人逐项确认或评论；系统在生成工作底稿时按客观事实分别记录“已就绪 / 未就绪”。任一单体报表未就绪时阻止生成工作底稿；汇率抓取暂不可用保留自动重试，不增加人工确认步骤。工作底稿确认会重放完整报表、汇率、合并凭证与输出校验，准备阶段的自动结论不能绕过正式输出校验。

“合并工作底稿”是三张表共用的标准桥接表，固定按“报表项目 → 各主体折算数 → 个别报表合计 → 抵销借方 / 抵销贷方 → 合并数”展示，并可展开追溯直接写入该报表行的合并凭证；页面顶部不再重复展示独立的“合并凭证来源与例外”汇总。工作底稿页面和 Excel 导出均不展示比较数；比较期数据只在正式合并报表中按法定列示口径呈现。草稿显示包含系统生成凭证的可审计预览；具备 `finance.statements.lock` 的用户确认后，系统在一个事务中批准当前凭证、锁定批次并冻结正式合并报表，随后直接切换到“合并报表”。历史 `submitted/reviewed` 批次仍可读取并按旧生命周期继续处理，但不再作为新批次的正常页面阶段。

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
            ├─ ConsolidationWorksheetTab（全部主体报表项目、简洁抵销摘要与未合并事项）
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
- `FinanceAuxiliaryMember` 保留每个公司、来源系统、账套、维度和源编码下的原始辅助对象身份，同时最多通过一个真实 FK 解析为集团 `Company`、内部 `Employee` 或法定 `Party`。内部个人往来优先关联 Employee，不要求为每名员工创建 Party；客户/供应商关联已有 Party，内部单位继续关联 Company。每个非公司身份链接必须保存匹配方法、证据、时间和操作者，数据库约束禁止一个辅助对象同时指向多个目标；重名、缺失主档或冲突证件必须保持未关联。
- 员工另有股东、供应商、客户或合同自然人身份时，可通过一对一 `EmployeePartyIdentityLink` 确认 Employee 与既有个人 Party 是同一自然人；HR 事实仍归 Employee，法定身份和外部角色仍归 Party。证件号一致可自动确认，只有姓名相同不得自动建立该链接。
- `FinanceOpenItem` 已保留单据日、到期日、原始金额、未核金额和状态，并可另行记录 `agingBaseDate`。一次或多次收付款、对冲、核销及调整分别写入 `FinanceOpenItemSettlement`；账龄天数和账龄区间始终由基准日/到期日/单据日与查询截止日动态计算，不持久化派生值。当前仅准备数据结构，尚未开放人工填写 API 或页面。
- 总账余额工作台的“往来款项”视图按 `1122 / 2202 / 1221 / 2241` 分为 AR、AP、其他 AR、其他 AP 四个子视图。T6 直接读取所选期间 ERP 辅助余额；TPlus 历史只用年初辅助事实加截至所选月份的已记账凭证滚动，往来身份通过锁定的 member-account 归类解析，不能把同一余额的部门、个人等多辅助项重复计数。
- 往来款项四个子视图共用始终展开的 `全部 / 关联方 / 其他` micro 筛选；“其他”包含已匹配的非关联方和未匹配辅助对象，详细对象类型继续在表格中展示，不再增加第二个前端筛选。关联性质只从辅助成员已确认的 `Company / Employee / Party` FK 及其权威公司、核心人员、股权和 External 关联方事实派生，不按名称猜测，也不在 Finance 维护第二份关联方名单。页面与 XLSX 导出必须携带相同的关联范围，并展示对象类型、关系性质和对应科目。
- 科目设置、凭证明细、科目余额及应收/应付四类视图共用 `/api/modules/finance/ledger/export` 下载 XLSX。导出必须复用页面当前公司、期间、关键词和分类筛选，并遍历全部服务端分页；凭证明细按分录逐行导出，其余工作表列与页面固定展示口径一致。下载要求显式 `finance.ledger.export` 权限，不得回退为普通 read。
- 财务 XLSX 统一遵守 `packages/finance/server/workbook-formula-contract.ts`：只有前置输入已在同一工作簿中可见，且按工作表显示精度复算与后台缓存值完全一致时，才输出 Excel 公式并保存后台缓存值。公式禁止写入业务金额、固定汇率、尾差或其他数字补差；`ROUND(...,2)` 的精度、`MAX(...,0)` 的零界限和 `*2`、`/3` 这类受限结构整数不属于业务硬编码。缺少可见前置事实的结果保持后台冻结值；已经声明为公式但无法精确复算时导出失败，不得降级为带魔法数字的公式。`gate:domain` 同时阻断绕过该 contract 直接写 XLSX 公式的实现。
- 当前公式 baseline：科目余额及往来余额的期末借贷由同一行期初和本期发生额滚算；本期折旧摊销由正常计算与调整相加；折旧摊销勾稽差异由工作表已展示金额相减；单体/合并三表只对可见组成行完整且精确勾稽的小计、合计和派生行使用公式；合并工作底稿的主体派生合计、个别报表合计及合并数遵守同一规则。原币利润表和现金流月度来源必须先逐行精确到分勾稽，任何原币 `0.01` 差异都按真实来源差异阻断；只有“月度原币发生额 × 当月平均汇率”按规定舍入后产生的人民币尾差才属于折算舍入，并通过重算人民币小计、净额及现金汇率变动影响保持展示链闭合。科目映射、凭证事实、集团匹配、审计来源、外币折算输入和重分类结果仍作为事实值展示。
- `scripts/check/check-finance-readable-import.ts` 核对批次控制数、借贷平衡、月度连续性、法定资产负债表和当期三表。ERP 未提供或自身不勾稽的历史现金流分配作为 diagnostics 暴露，不自动制造抵销数。
- readable 快照不包含固定资产卡片或折旧明细；资产折旧表必须等待独立来源，不能由总账余额反推卡片。

## 科目余额口径

科目余额分三层：

| 层 | 表 | 来源 | 用途 |
|---|---|---|---|
| 年度余额批次 | `FinanceBalanceSnapshot` | 一次本地资料导入 = 一行 | 追溯哪次导入、哪个文件、谁导入 |
| 年度余额明细 | `FinanceBalanceSnapshotRow` | 导入时每个科目的原始行 | 保存 `accountCode`/`accountName` 快照，审计可追溯到 Excel 原始行 |
| 月度余额结果 | `FinanceAccountBalance` | 系统计算 | 按月展示、报表取数 |

计算规则：

1. 导入 2024 年度余额表后，**只写入 `FinanceBalanceSnapshot` + `FinanceBalanceSnapshotRow`**，`snapshotType="baseline"`, `isActive=true`。
2. 后续年度余额表（2025+）导入时默认 `snapshotType="reconcile"`, `isActive=false`，仅用于本地校准核对。
3. 点击科目余额“重新计算”时，系统从 active baseline snapshot 的 closing balance 开始，叠加已过账凭证逐月滚动到 `FinanceAccountBalance`。
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

`mappingMethod` 只记录映射的产生方式，不直接展示为用户分类。列表只暴露三种业务状态：`已确认` 仅用于参考公司种子；`待复核` 包含全部系统自动对应，即使编码、名称、类别和余额方向完全一致；`已复核` 表示财务人员已经接受或人工改正。编码、名称、类别、余额方向和候选评分由 `mapping-review.ts` 的单一诊断 interface 处理；同名不能跨资产、负债、共同、权益、收入、成本、费用类别推荐，算法细节不作为页面分类。

当前生效版本的待复核映射可在科目设置的公司科目列表中改选已有集团科目后保存，保存即写入 `manual_override`。集团科目页允许在当前版本直接人工新增，不因此自动顺延版本号；新增科目初始为 `待复核`。集团科目字段与公司科目表共用同一字段模型，仅隐藏自指的“集团科目”字段。

集团科目页使用左侧科目树、右侧详情编辑区：左侧只显示编码和名称，右侧默认进入可编辑状态并通过表单根动作直接保存，不再二次打开编辑弹窗；工具栏新增动作在右侧打开 block 表单，不使用弹窗。字段沿用公司科目的编码、名称、类别、余额方向、币种和父级口径，隐藏自指的集团科目字段；币种必填，默认人民币并从常用币种中选择。集团科目维护稳定的合并主数据属性：合并处理类型、对方集团公司是否采集、默认取数口径和默认折算方法；匹配方式、金额口径、差额处理、优先级等跨科目算法属于合并规则集。实际对方公司由公司凭证明细的辅助核算或集团凭证分录记录。工具栏的“合并科目 / 重分类科目”仅按当前版本生效规则筛选集团科目，不复制第二份规则事实。详情下方只展示已经人工复核到该科目的公司、账套、本地科目及实际存在的科目年份，系统确认和待复核映射不混入详情。公司科目虽然按 `year` 存储，但映射身份是 `(policyVersionId, companyCode, sourceScopeKey, localAccountCode)`：同一集团科目版本内，同公司、同账套、本地编码跨年复用一条映射，`latestYear` 只是同步快照。若某日起映射语义改变，应发布带生效日的新集团科目版本，不按年度复制映射。

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

- 重分类规则只在集团科目详情维护；没有历史反向余额且未显式配置的科目派生为“无需重分类”，不写入伪人工确认记录。当前只使用生效的集团科目版本，不再向用户展示可切换的“政策版本”筛选；保存 contract 仍显式携带服务端返回的当前 `policyVersionId`
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
│ 集团科目详情 → 会计政策版本内的集团统一规则               │
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
┌─ 明细维护 ──────────────────────────────────────────────┐
│ /finance/ledger → 凭证明细 → 重分类明细                    │
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
- 报表页不触发生成、不编辑规则、不审核结果；规则维护统一归集团科目详情，期间结果统一归“凭证明细 / 重分类明细”只读追溯
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
- 默认规则沿版本内集团科目父子层级继承，企业本地自设明细先映射到稳定集团科目身份，无需逐个配置；“凭证明细 / 重分类明细”仅展示按期间物化的规则结果与历史人工调整。
- 集团科目详情是重分类规则的唯一维护入口，直接展示处理方式、目标科目、计算口径及继承来源；子科目命中父级规则时只读展示继承来源，并要求回到来源科目修改。

### 利润表与现金流量表数据源

- 资产负债表使用固定映射、期末余额和重分类结果生成。
- 利润表使用 `reports/income-system-amounts.ts` 按公司、年度和已过账凭证明细分别聚合所选月份发生额与截至所选月份的本年累计金额，并根据行配置分别生成合计。
- 现金流量表使用 `FinanceCashFlowAllocation` 和 ERP 现金流项目生成本年累计的经营、投资、筹资分类；累计数以年度首月期初和所选期间期末货币资金勾稽，无源分配或分配不完整时明确返回 diagnostics。系统可保留当月计算用于内部勾稽，但不得作为一般企业法定现金流量表的额外列。
- 利润表和现金流量表在页面、合并冻结输出及 Excel 导出统一按一般企业法定格式列示“本期金额 → 上期金额”；本期金额为本年年初至所选期间末累计数，上期金额为上年可比累计期间数。资产负债表、利润表和现金流量表不得用年份或自定义“当月金额”替代法定列名。
- 法定终版三表上传页面、API、业务动作和导入脚本均已删除。

### 合并报表边界

合并报表不等于多公司简单相加。批次冻结的资产负债表来源保留各单体已经批准的余额重分类，但合并层不得再次生成第二套负数重分类；往来抵销必须与冻结来源使用同一列报行。`counterparty_gross` 规则已经把某一异常方向辅助余额移到目标科目时，该余额的抵销行同步落到目标报表项目，正常方向余额仍落源报表项目；`account_net` 规则不按单条辅助余额改写抵销行。公司对之间存在差额时，系统先按方向分配双方可抵销金额并生成平衡分录，只把未分配余额保留为待核对例外，不能因一笔未达账项丢弃同组已匹配金额。`/finance/statements` 的“合并报表”父 Tab 按“合并准备 → 合并工作底稿 → 合并报表”组织；期间选择只驱动事实读取，批次、来源冻结、凭证生成和工作底稿确认都由显式动作推进。税务影响作为对应调整分录的从属底稿或控制结论处理。“单体报表”继续展示各公司个别三表。

候选公司关系和持股比例只读资本证券物化投影 `OwnershipInterest`：`ownerPartyId/issuerCompanyId/shareRatio` 表达直接法律持股关系，`effectiveFrom/effectiveTo` 表达控制期间，`isConsolidated` 仅作为当前期间尚无 Finance 选择时的默认值；Finance 仅接受 owner Party 已链接内部 Company 的关系。财务人员在页面选择“本次并表”时，系统按母公司、报表期间和候选公司写入 `FinanceConsolidationScopeSelection`，权限为 `finance.statements.update`；创建批次后把最终选择冻结到 `FinanceConsolidationEntitySnapshot` 并消费临时记录。该路径不更新 `OwnershipInterest`、不追加 `ShareCapitalEvent`、不重建资本证券投影，也不把临时选择反向解释为法定控制关系。其他股权事实仍必须先进入统一注册资本事件账本，再由投影器整体重建 `OwnershipInterest`；Finance 在创建批次时继续校验关系版本、持股比例、环路、同一期间多直接持股方和内部公司身份。无既有批次或显式母公司参数时，Finance 从有效内部持股关系中选择覆盖范围最大的最上层主体，不能从中间控股公司截断上游主体；首次进入默认展示合并范围内三表来源均完整的最近期间，仍允许用户显式切换到其他期间。批次冻结本次实际纳入的直接持股链及各关系版本；投资方可以是顶层母公司，也可以是任意层级的中间控股公司。持股比例不足 100% 不阻断已有实际出资和历史汇率证据的投资与权益抵销凭证生成；系统按比例净资产法生成独立少数股东分配凭证，以冻结并折算后的子公司期末净资产确认少数股东权益、以本期净利润确认少数股东损益，并从母公司未分配利润及归母净利润重分类，合并净资产和净利润总额不变。比例缺失或链路与法律资料不一致时仍明确保留待处理事项，不自动猜测比例或金额。

外币中间价事实存放在 `FinanceStatementExchangeRate`，不提供人工逐项录入。系统从中国外汇交易中心（中国货币网）自动抓取人民币汇率中间价，按币种对和中间价日期幂等保存，并保留原始币种对、报价单位、来源 URL、抓取时间和中间价日期；`CAD/CNY`、`100JPY/CNY`、`CNY/MOP` 等方向和单位统一换算为“人民币/1 外币”。实体本位币从 ERP `FinanceCurrency.isBase` 主数据推导。生成工作底稿时自动冻结资产负债项目的期末汇率、加拿大资本发生日或可复核历史账期对应的中间价、利润表和现金流量表期间发生额覆盖的每月全部有效交易日中间价算术平均，以及现金及现金等价物期初、当月期初和期末的对应时点汇率。利润表和现金流量表发生额按“各月原币发生额 × 当月平均汇率”逐月折算后累计；现金流量表汇率变动影响由折算后的期末现金减期初现金及经营、投资、筹资净现金流倒算；未分配利润按已核定的上年末人民币期初余额加逐月折算净利润滚算，存在分红或其他权益变动但缺少逐笔证据时阻断输出，不按期末汇率重估累计余额。有凭证原币字段、同凭证 CAD 银行流水或摘要中明确写出的 CAD 金额时按交易级证据逐笔折算；境内凭证缺少原币字段、但加拿大 ERP 权益账已保留资本发生日和 CAD 金额时，可按唯一直接投资关系生成汇总但仍逐条保留汇率来源的抵销凭证；两种路径都不得据人民币账面成本反推 CAD 金额。投资权益合并凭证借记加拿大实收资本/资本公积、贷记境内长期股权投资，折算差额计入其他综合收益；差额为负时按损失记 OCI 借方。

当前自动抵销只覆盖两类：母公司长期股权投资与子公司实收资本/资本公积，以及合并主体之间的客户/供应商往来。内部销售与未实现利润、内部长期资产、收益/股利分配、内部现金流、并购日处理和递延所得税均延期，不得作为当前生成或发布阻断。抵销分录按总账日记账结构组织为凭证头和借贷行，借贷必须平衡且落到批次冻结来源中的规范 `lineCode`。投资匹配行关联真实 `FinanceVoucherItem`；往来匹配以期末 `FinanceAuxiliaryBalance` 为事实，避免把历史已结清发生额重复抵销。本方和对方事实连同实体快照写入 `FinanceConsolidationMatchGroup` + `FinanceConsolidationMatchSource`，独立保存 1:1、1:N、N:1 或 N:N 来源组、分配金额、指纹、规则版本与差额。

往来匹配只消费已通过真实 FK 绑定集团 `Company` 的期末辅助余额，按公司对比较双方尚未结清的应收应付；只有双方净额方向相反且已经折算到有证据的人民币列报口径时才生成草稿。投资匹配按批次冻结的每一条直接持股关系归集投资方长期股权投资与被投资方实收资本/资本公积的全部凭证明细，形成保留 1:1、1:N、N:1 或 N:N 原始证据的关系组；未标关联公司的投资凭证只有在法律持股链和被投资方权益证据共同留下唯一候选时才归组，不依据摘要猜测主体。历史 `aggregateCnyMirror` 映射值最多用于识别被投资公司，不得按投资方人民币总额比例改写被投资方原币来源。有冻结的资本发生日与中间价证据时，系统先生成投资与权益抵销凭证，按实际出资折算实收资本和资本公积、逐笔冲销投资方 1511，折算差额进其他综合收益；持股比例只触发独立的少数股东分配事项。未找到一方事实、多个候选、报表项目未映射、历史汇率未处理或同币种金额有差异时只保留待复核组及全部来源事实，不生成虚假分录，也不按报表总差额自动配平。生成结果不得写回单体账。

标准自动匹配由版本化合并规则驱动。集团科目详情中的“合并规则”是唯一维护入口，只标记是否进入自动规则、对方公司辅助、默认取数和集团报表折算口径，不再要求财务重复选择“集团内应收/应付/收入/费用”：方向由科目类别和余额方向确定，实际集团内部属性由凭证或辅助余额中已绑定集团 `Company` 的对方公司确定。规则集定义匹配方式、金额口径、差额处理和优先级，但不再单设规则汇总页；运行结果进入“凭证明细 / 合并明细”只读追溯，不把运行结果反写成规则。规则之外的历史底稿、固定历史人民币金额、列报重分类和已证明尾差同样使用“集团凭证”；集团凭证内部按集团调整、内部抵销、列报重分类、少数股东分配区分凭证类别，并按人工编制或规则生成区分来源，其中少数股东分配只由冻结持股比例和批次来源自动生成，不开放人工选择。不存在平行的“调整结果”模型、审批接口或结果行；任何影响合并输出的金额都必须先落为 `FinanceConsolidationEntry`，并在“合并明细”可见。集团凭证号统一采用 `YYYY-MM-合-NNNN`，由所属合并批次的会计月份连续分配；来源类型、生成方式和内部指纹不得混入外显凭证号。历史集团调整归属首次生效期间的批次；资产负债表集团调整在该批次内由凭证计入，批准后在更晚期间作为余额承接，不在同一期间重复叠加，也不再依赖 `FinanceVoucher`。集团凭证显式记录业务日期、借贷行、原币、人民币金额、对方主体、来源说明和复核状态，不得写回任何单体账。合并工作底稿追溯已进入批次的凭证及其来源、汇率、差额和处置结论，并承担本期结果的确认与锁定；“合并明细”不再提供集团凭证维护或复核入口。集团科目复核使用 `finance.ledger.approve`；集团凭证的批次确认属于合并报表责任，使用 `finance.statements.approve`，两项权限不得互相替代。

外币货币性项目在单体账期末重估产生的汇兑损益属于主体账事实；源财务软件漏记时，本系统只能形成 posting level 10 的主体调整、保留待回写状态和源账回写证据，不能作为内部抵销或集团层调整消化。境外经营财务报表从功能货币折算为人民币产生的外币报表折算差额属于集团列报事实，使用 posting level 30 的集团层调整且不得写回单体账。两者在凭证类型、复核证据和过账层级上必须分开。

加拿大公司设立时实收资本为 CAD 100,000，境内对应支付 CNY 505,056，因此历史折算率固定为 `5.05056 CNY/CAD`，以后期间不得按期末汇率重估。该事实通过丰华生物 2019-05-31 的 `Workspace 合并`单体凭证追溯：借记 `1511 长期股权投资` CNY 505,056，贷记 `224101 其他应付款-单位` CNY 505,056，并将贷方往来对象绑定集团公司丰华制药；凭证下显示“匹配：加拿大公司实收资本”，结构化证据保留 CAD 原币金额、历史折算率、人民币金额和权益行类型。该凭证发生在当前 active ERP 余额基准以前，法定报表在基准期及以后作为持久总账叠加项消费，不改写 ERP 年度余额快照。只有缺少可追溯投资凭证时，系统才允许从境外公司最早可用资本期初余额回退到期初日及此前七日内的历史牌价；已有明确匹配的投资凭证不得再使用该兜底事实。

合并抵销不改变各法律主体的当期纳税义务：纯应收应付余额抵销不生成所得税分录；内部收入成本或未实现利润抵销仍保留卖方依法确认的当期所得税，并在合并层按暂时性差异单独评估递延所得税。递延所得税模型作为对应合并凭证的关联税务影响保留；当前自动范围仅有往来余额和投资权益，因此不把缺少税效作为发布阻断，后续启用内部交易和未实现利润规则时必须同步启用税效复核。

`FinanceConsolidationBatch` 是合并事实根，按母公司、期间、周期类型和版本冻结 `OwnershipInterest` 范围、个别三表 payload、汇率及应用、控制结论、凭证匹配组和合并凭证。`revision` 是每次草稿写入和生命周期操作的 CAS 令牌。新批次正常生命周期为 `draft → locked → published`：确认工作底稿时校验所有来源和凭证、批准草稿凭证、锁定批次并生成不可变正式报表。历史 `submitted/reviewed` 状态继续允许 `reviewed → locked`，仅用于兼容既有批次，不再暴露为新页面阶段。草稿可按当前 `revision` 直接删除；锁定、发布后只能新建版本。

合并输出分为工作底稿预览和正式快照。预览读取当前批次冻结的单体三表并应用尚未冲回的系统/人工草稿凭证，让确认人看到即将冻结的完整结果；任何实体缺少 ERP 本位币主数据时直接阻断。锁定成功时，草稿凭证批准、状态迁移、批次事件和唯一 `FinanceConsolidationOutputSnapshot` 在同一事务写入。快照保存输入/输出 SHA-256、计算版本、完整三表正文和生成时间，数据库禁止更新或删除；任何范围、来源、汇率或凭证变化都必须进入新批次版本。

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
| `POST /api/modules/finance/ledger/asset-adjustments` | 独立调整，不改写正常计算政策 |
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
