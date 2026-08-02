# Finance Cost 模块架构说明

## 1. 数据分层

生命周期状态：`workspace-owned`。成本模块使用 Workspace 本地资料、历史 Excel 导入和本地数据库表；不再通过 ERP/ERPNext API 取数。标准生产成本、库存成本和业务单据事实后续按 Workspace 自有生产模块口径扩展。

### raw JSON
- 位置：本地资料库中的成本分析原始 Excel 导出目录（例如 `<本地资料库>/成本分析/json/raw`）
- 用途：保留 Excel 原始结构，用于审计、排查、重新转换
- **不直接进业务 UI，不导入 DB**

### normalized JSON
- 位置：本地资料库中的成本分析归一化目录（例如 `<本地资料库>/成本分析/json/normalized`）
- 用途：作为导入 DB 的中间数据，保留了原始 sheet/row 追溯信息
- **不是最终 DB schema**，需要 agent 判断哪些是事实字段、哪些是计算字段

### DB
只保存：
- 原始业务事实（人工录入值）
- 关联关系（importId → FinanceDataImport）
- 源文件追溯信息（sourceFile / sourceSheet / sourceRow）
- 必要的导入记录（FinanceDataImport）

不保存：
- 小计、合计、百分比、同比、环比
- Excel 里由其他列算出来的金额
- 纯 UI 展示字段
- 可以稳定通过服务层实时计算出来的字段

### Service 计算层
- 位置：`packages/finance/server/cost/`
- 负责：汇总金额、成本率、毛利、单位成本、趋势、分组统计

### 数据来源原则

Production 与 Cost 按 Workspace 的租户经营范围联动，不在源码文档中固定具体公司或车间。可用财务事实必须由运行态数据和来源 FK 证明，不能由文档台账替代。

成本构成表的叶子值必须保留来源追溯，制造费用小计和成本单价由 Service 计算。只有完成租户内来源范围确认、FK 建立和合计对账后，系统才可把总账、工资、资产、库存或生产事实用于成本计算；不得跨公司借用事实填补缺口。

## 2. Schema 说明

| Model | 说明 |
|-------|------|
| `FinanceDataImport` | 导入批次记录，关联各事实表 |
| `FinanceShipment` | 发货事实：客户、产品、数量、金额、回款 |
| `FinanceSalesSalary` | 业务员工资事实：基本工资、提成、实发 |
| `FinanceCostStructureRow` | 产品粒度成本构成事实：`productId`、可选入库报单 FK、状态/名称快照、工时、各叶子成本金额、入库数量 |
| `FinanceCostAnalysisRow` | 成本分析指标行：表名、行标签、指标键、数值 |
| `FinanceWorkshopReport` | 历史车间报表归档事实；不维护独立财务页面，但为已拥有 `finance.cost.read` 的轻代码分析提供完整分页只读源 |
| `WorkspaceAnalysisTemplate` | 个人、部门或项目空间拥有的受控经营分析 DSL；属于业务配置，不属于租户设置或 Git 源码 |
| `WorkspaceAnalysisTemplateRevision` | 每次草稿保存或发布、回滚、放弃、归档、恢复形成的完整不可变模板快照与生命周期审计事实 |

## 3. 计算字段在哪里算

| 指标 | 计算位置 |
|------|---------|
| 未回款 | `shipments.ts`: `amount - receivedAmount` |
| 回款率 | `shipments.ts`: `receivedAmount / amount` |
| 发货分析 | `shipment-analytics.ts`: 按客户、业务员、存货、存货+规格汇总数量/发货额/回款额，提供趋势、排行、上年同期、当期发货额第一产品/业务员/客户和来源粒度覆盖 |
| 毛利 | `summary.ts`: `shipments.totalAmount - costStructure.totalAmount` |
| 毛利率 | `summary.ts`: `grossProfit / shipments.totalAmount` |
| 单位成本 | `cost-structure.ts`: `totalAmount / totalQuantity` |
| 产品成本横表 | `cost-structure-products.ts`: 直接投影产品粒度事实，并计算制造费用小计与产品成本单价 |
| 排行 | 各 service 汇总后排序 |

## 4. 导入脚本

```bash
node scripts/import/normalize-finance-cost-structure-workbooks.mjs --out-dir <normalized>/cost-structure <25年.xls> <26年.xls>
node --import tsx scripts/import/import-finance-cost-json.mjs --dry-run
node --import tsx scripts/import/import-finance-cost-json.mjs --dry-run --profile=shipments
node --import tsx scripts/import/import-finance-cost-json.mjs --profile=shipments
node --import tsx scripts/import/import-finance-cost-json.mjs --dry-run --profile=shipments --replace-profile
node --import tsx scripts/import/import-finance-cost-json.mjs --profile=shipments --replace-profile
node --import tsx scripts/import/import-finance-cost-json.mjs
```

逻辑：
1. 遍历 `normalized/` 下各 profile 目录
2. 按 profile 解析 JSON，只提取事实字段
3. 原始 JSON 保留在文件存储；数据库只记录来源路径、checksum 和结构化事实字段
4. 同 profile/year/sourceFile 重复导入时，在一个数据库事务内替换旧批次及其明细（Cascade）
5. 可用 `--profile=<profile>` 只校验或替换指定主题；发货导入中，只有当“回款金额”为空且“未回款金额”与发货金额完全一致时，才把空值归零并计入批次 warning
6. 当一整套年度源文件需要取代旧批次时，先用 `--dry-run --profile=<profile> --replace-profile` 核对删除/新增范围；正式执行时会在同一事务内删除该 profile 的全部旧批次并写入新批次，任一步失败均整体回滚

## 5. API 权限规则

| 端点 | 权限守卫 |
|------|---------|
| GET /api/modules/finance/cost/* | `finance.cost.read` |
| GET /api/modules/finance/cost/workshop-reports | `finance.cost.read`；完整分页读取历史车间归档事实，可按 `importId` 精确筛选 |
| GET /api/modules/finance/cost/operational-analytics/shipments* | 页面会话要求 scoped `read`；使用个人 API Key 时额外要求同资源的 `apiUse`，Service 再校验个人本人或具体部门 scope |
| GET /api/modules/finance/cost/operational-analytics/spaces/*/sources/discover | scoped `read`；`keyword` 必填并分页返回摘要，`selected=sourceKey@version` 最多展开 4 个完整定义；API Key 额外要求 `apiUse` |
| GET /api/modules/finance/cost/operational-analytics/spaces/*/templates/contract | scoped `configure`；返回创建、修订、预览和生命周期请求的 JSON Schema、当前空间精确路径与示例；API Key 额外要求 `apiUse` |
| GET /api/modules/finance/cost/operational-analytics/spaces/*/templates | scoped `read`；普通目录只返回 active 的正式修订；有 scoped `configure` 时同一响应额外携带不含 DSL 的草稿/归档管理摘要 |
| POST /api/modules/finance/cost/operational-analytics/spaces/*/templates | scoped `configure`；标准 API 直接创建 v3 `workspace.sources` 草稿，目标空间只能来自 path；API Key 额外要求 `apiUse`，保存前重新编译并授权全部 source |
| GET/PUT /api/modules/finance/cost/operational-analytics/spaces/*/templates/* | scoped `configure`；GET 读取当前可编辑草稿头与完整 DSL，PUT 用 `expectedRevision` CAS 修订草稿；API Key 额外要求 `apiUse` |
| GET /api/modules/finance/cost/operational-analytics/spaces/*/templates/*/lifecycle | scoped `configure`；分页读取不可变版本摘要和服务端授权的生命周期动作 |
| POST /api/modules/finance/cost/operational-analytics/spaces/*/templates/*/runtime | 非写入的 scoped `read`；请求体只接受精确 `revision + filterValues`，API Key 额外要求 `apiUse`，每个 source owner 重新执行原业务读取与对象可见性守卫 |
| POST /api/modules/finance/cost/operational-analytics/spaces/*/templates/*/preview | scoped `configure`；只预览指定不可变修订，仍按当前用户/空间重新授权全部 source，不改变正式版本 |
| POST /api/modules/finance/cost/operational-analytics/spaces/*/templates/*/lifecycle | scoped `configure`；发布、copy-forward 回滚、放弃草稿、归档、恢复均要求 `expectedRevision` CAS 并在一个事务内追加审计修订 |
| GET/PUT /api/modules/finance/cost/operational-analytics/spaces/*/permissions | 具体空间的 `grant`，由标准空间权限 Service 执行 |
| POST /api/agent + proposal confirm | 通用 API 薄壳：模型只发现/读取上述标准 contract，并把 mutation 冻结为 proposal；确认后以原 method/path/query/body 调用同一业务 API，不存在 Finance Agent adapter |
| POST /api/modules/finance/cost/imports | `finance.cost.import`（当前返回“请使用导入脚本”） |
| DELETE /api/modules/finance/cost/imports/[id] | `finance.cost.delete` |

RBAC 资源：
- `finance.cost` — 成本管理总权限
- `finance.operationalAnalytics` — 个人、部门、项目主页的经营分析能力；`read` 仅查询，`configure` 维护该空间的分析模板，`export` 仅外发文件，`apiUse` 仅外部 API 使用，四者互不替代。个人本人自然拥有 `read/configure`；部门成员按标准空间权限自然拥有 `read`，部门负责人自然拥有 `configure`；能够进入已启用项目空间的项目成员自然拥有 `read`，项目 `configure` 与其他分析人员权限仍使用派生资源的显式 scoped 授权。项目没有权威销售归集关系时不能创建销售模板，也不得用部门数据冒充项目数据。

父资源 `finance` 的 `entry/read/delete` 可按继承规则覆盖成本资源。成本模块当前不是通用 CRUD：发货、成本构成、成本分析、工资和历史车间报表均为导入后的查询模型；写入入口收口在导入脚本和导入历史清理。车间工分没有独立页面，只通过同一 `finance.cost.read` 下的完整分页只读接口与轻代码 source 查询，不增加字段级读取许可。

经营分析模板使用版本化 JSON DSL。新写入只接受 v3 `workspace.sources`：模板保存稳定的 `sourceKey + sourceVersion + parameters`、筛选器和 render blocks，不保存内部 URL、响应路径或 transport pagination。历史 v1/v2 在底层读取权限可于目录阶段证明时仍可读取和渲染；依赖 service-delegated 对象可见性的 URL 型 v2 会暂时隐藏并要求迁移，避免把内部路径先发给无底层权限的浏览器。正常页面会话、个人 API Key 和内置 Agent 复用同一标准 API command seam；Agent 只增加短期委托、双主体 gateway 权限复核与提案确认，不拥有 Finance 领域 adapter 或私有写入 schema。分析 source 不接受写方法、导出型接口、外网、JavaScript、SQL 或文件路径。工具栏固定保留空间侧栏折叠、Agent 新建入口和模板切换，其他筛选及全部正文由当前模板声明；配置者额外只有一个“版本与发布”入口。草稿、已发布、有草稿和已归档状态在模板选择与版本弹层中明确显示，页面不暴露代码编辑器。销售经营分析只在空间存在销售事实时作为系统预置出现；非销售空间无模板时展示真正的空画布。

source registry foundation 当前由 Finance owner 登记 60 个版本化 source，其中成本/发货有 6 个：`finance.shipments@1` 是个人目标绑定的销售发货源，运行时把目标用户作为可信 `scopeId` 交给现有 service-delegated 归属校验；`finance.cost.shipments@1`、`finance.cost.analysis@1`、`finance.cost.structure@1`、`finance.cost.sales-salary@1`、`finance.cost.workshop-reports@1` 则忠实表达原成本接口的全公司读取口径，在个人、部门、项目空间都只继承 `finance.cost.read`，不伪造部门或项目归集。五类成本事实都可按 `importId` 精确筛选；批次头由 `finance.cost.imports@1` 提供，因此 `/imports/[id]` 的 `take:5` 数组只保留页面预览语义，coverage 由六个完整分页源派生，不会把样本伪装成全量。成本构成公开的产品对象等价展开为 `productMasterCode` 与 `productMasterName`，不要求额外 Inventory 权限。`unreceivedAmount` 暂不登记，因为明细 DTO 对未知回款存在把 null 当零的旧派生差异；除此之外，公开 DTO 的稳定标量，包括 `importId`、来源文件/Sheet/行号、内部主键、状态和创建/更新时间，都可进入 canonical field projection。工资、车间人员与工分等 `restricted` 字段也可供已拥有原业务读取权限的账号分析。

Registry 负责 `sourceKey + version`、字段口径/敏感级、空间绑定、真实 API contract 一致性、canonical field projection 和限额 contract；v3 编译器强制字段声明的展示、筛选、分组、聚合能力、日期参数顺序及表格/图表预算，但不会把 `sensitivity` 或 `exportPolicy` 当成读取授权。保存前会按请求人与目标空间做 compile-only 校验而不加载业务行；运行时再从当前授权 discovery 建立精确执行计划，由 source owner 按来源受保护 GET 的 `resourceKey + requiredActions + projection + enforcement` 重新授权、分页和投影，并继续沿用原 service 的对象可见范围。统一 runtime 强制单源及全局行数、字节、页数、时间、表格行和图表分组上限，并只返回 render DTO；页面不接收 canonical/raw rows。

`GET /api/modules/finance/cost/operational-analytics/spaces/:targetType/:targetId/sources` 是完整受控目录；外部 Agent 优先使用其 `/discover?keyword=...&page=...&pageSize=...&selected=sourceKey@version` 变体按关键词分页检索，并只展开最多 4 个精确选中定义。`keyword` 在 API 和内置适配器中都为必填，避免模型省略参数后反复拿到无关的首屏。服务先执行该空间的 `read` 判定；API Key 还必须独立通过 `apiUse`，再组合 Finance 本地 catalog 与 8 个远程业务 owner 的签名 internal RPC：Administration、Capital Securities、External、HR、Inventory、Library、Production、Work。完整 discovery 对每个远程 provider 保持 2 秒可选依赖预算，不可用时标记 `unavailable` 并保留其他 owner；模板保存、预览和正式运行只探测定义实际引用的 owner，并给该必要依赖 10 秒冷启动预算，避免无关 owner 或首次 route 编译把有效模板误报为不可用。跨 provider 重复 identity 或非 canonical/外来 owner 定义仍 fail closed。RPC/公开响应都不包含 transport adapter、内部 URL、rowsPath、fieldPaths 或分页机制。

`runFinanceWorkspaceAnalysisRuntime` 已把上述 scoped discovery、不可伪造的 source binding、Finance 本地 owner executor、远程业务 owner executor、服务端聚合、render DTO 和可选的脱敏审计回调串成完整 server seam；API Key 执行同样叠加 `apiUse`。普通 runtime 只从 `WorkspaceAnalysisTemplateRevision` 读取客户端指定且仍由 `publishedRevision` 指向的不可变 v3 正式修订，不读取可变 `Template.code`；草稿保存不会打断普通读者。配置者预览可以读取任一历史修订，但要求当前头 `expectedRevision` 未变化，并重新执行当前空间与每个 source owner 的原始授权。动态页面筛选在 canonical rows 加载后执行，不会下推 owner；同比/环比也只使用 source 参数已覆盖的本次输入范围。外部 Agent 可用个人 API Key 完成“读模板目录/草稿 → 发现 source → POST/PUT 保存草稿 → 预览 → 发布”；内置 Agent 也只能经通用 connector 调用这些相同 API，mutation 先进入 proposal，不再存在领域 adapter。选择虚拟员工时，任何仍依赖单主体 `serviceDelegated` 对象授权的调用都会失败关闭。模板头 revision 是唯一 monotonic CAS；发布、回滚、放弃、归档和恢复都复制完整快照、追加 revision 并保留 actor/time/sourceRevision/reason，不覆盖历史。

运行时会区分“provider 当前不可用”和“provider 正常但 source/version 不存在”：模板引用的 owner provider 不可用返回可重试的 503，未知或失效版本保持 409，不会把基础设施故障误报为模板定义错误。该判定依赖 Registry 强制 `sourceKey` 第一段等于 `ownerModuleKey`。

## 6. UI Tab 对应数据表

`app/(modules)/finance/cost/page.tsx` 只做鉴权、用户预取和挂载 `FinanceShell`/`FinanceCostClient`。成本页面真实 UI、hooks、表格壳和局部组件位于 `packages/finance/ui/cost/*`，其中成本表格必须通过 Core `DataTable` / `Pagination` / `ActionButton` 组合，不得在 route 目录手写表格和分页。

| Tab | 数据表 | API |
|-----|--------|-----|
| 发货与回款 | `FinanceShipment` | `/api/modules/finance/cost/shipments`、`/api/modules/finance/cost/shipments/analytics` |
| 成本分析 | `FinanceCostAnalysisRow` | `/api/modules/finance/cost/cost-analysis` |
| 成本构成 | `FinanceCostStructureRow` | `/api/modules/finance/cost/cost-structure` |

## 7. 核心原则

> **DB 存事实，Service 算结果，UI 展示结果，source 负责追溯。**

成本构成只导入原始工作簿中名称严格符合 `YY.M[月]` 的月度 Sheet，并且只取每个 Sheet 的第一个连续大表。后续单位成本重复表、年度/累计汇总表和辅助分摊表均不进入 normalized JSON 或数据库。

成本构成数据库与 API 均以来源首表中的一条产品记录为粒度，同时保留 `产成品` 和 `在产品`。数据库保存状态、名称、工时、各叶子成本金额和入库数量；在产品的入库数量允许为空。制造费用小计与成本单价由 Service 层实时计算，数量为空时成本单价也为空。页面按月份倒序、月内按原始行号展示，保留 Excel 中产成品后接在产品的次序。

成本产品身份统一使用 `productId -> InventoryItem.id`；历史名称只有在可库存 SKU 中唯一精确匹配时才回填，简称或歧义名称保持待关联。`receiptReportId -> InventoryReceiptReport.id` 通过该 SKU 的 `productMasterId` 与入库报单产品身份匹配，并要求年月和产品候选唯一；页面展示 SKU 主数据和入库报单联动状态。尚未结构化的关系不得以源码中的业务台账代替，应进入私有治理记录并通过正式 schema 变更闭环。

成本与入库报单的自动匹配使用年月 + 产品，不按来源名称模糊匹配。只有未来明确引入多公司独立账套时，才重新评估导入批次和业务事实是否需要组织维度。

发货明细使用 `customerId -> ExternalPartyRole.id` 关联启用中的客户角色，使用 `productId -> InventoryItem.id` 关联“名称 + 规格型号”唯一确定的可销售成品 SKU；导入原始客户、存货名称和规格继续作为快照展示。历史未唯一匹配时 FK 保持为空并显示“待关联”，不得模糊猜测。

发货和销售工资的销售归属由 `salesChannel` 与 `employeeId` 共同表达：员工销售为 `employee` 并关联 `Employee`；“厂部/厂销/厂家直销”为 `factory_direct` 且不得关联员工；缺失或历史未识别为 `unknown`。`employeeId=null` 本身绝不代表厂家直销，来源姓名保存在 `salespersonName` 供映射审计；员工 FK 使用 `ON DELETE RESTRICT`，历史员工只能停用或离职，不能硬删除导致业务归属丢失。

发货与回款采用同一分析工作台，不再把“同比”拆成独立宽表。统一期间范围同时驱动 KPI、趋势、分组排行、汇总表和明细；分组维度固定为客户、业务员、存货名称、存货名称+规格型号，排序指标固定为发货数量、发货金额、回款金额。上年同期由 Service 根据同一日期范围平移计算，UI 只展示差异，不自行重算。

页面期间类型通过 Core Toolbar micro accordion 提供按周、按月、按季度、按年四种口径，当前不开放自定义日期；后端仍统一接收任意 `dateFrom/dateTo` 事实范围，为后续自定义期间和外部分析保留能力。趋势粒度可选日、月、季度、年。导入行有具体 `date` 时按日事实参与任意范围；只有 `year/month` 而没有具体日期的行，只在查询完整覆盖该月份时纳入，不得按比例摊分到指定日期。API 通过 `coverage.precision` 和月度行数暴露来源粒度。回款金额为空仍表示未知，汇总不得将未知无条件改写为零。

发货明细的业务列名沿用原始表格字段名，其中“发货含税金额本币”在 UI 简写为“发货金额”；`FinanceShipment.amount` 仍只映射“发货含税金额本币”，不得以“开票金额”兜底，`receivedAmount` 对外显示为“回款金额”。
