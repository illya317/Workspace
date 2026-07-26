# Business Temporal Contract

Owner: Architecture / Platform / Data

本 Contract 统一回答三件事：什么业务事实需要时间生命周期、数据应采用哪种存储形态、前端应选择哪种时间视图。代码入口是 `@workspace/platform/contracts/business-temporal`。

这里使用 **Business Temporal**，不使用裸 `Lifecycle`。仓库内 `Lifecycle` 已用于模块启停、关系删除、Action 归档等语义；业务有效时间不能与这些状态机混在一起。

## 四个必须分开的维度

| 维度 | 回答的问题 | 典型字段 |
|---|---|---|
| 有效时间 valid time | 这条事实在业务上何时成立？ | `validFrom`, `validToExclusive`, `effectiveOn` |
| 记录时间 transaction time | 系统在什么时候、由谁知道或修改了它？ | `recordedAt`, `createdAt`, `editedAt`, `recordedBy` |
| 记录状态 record state | 草稿、待批、确认、取消、冲销，或旧数据无法判定？ | `draft`, `pending`, `confirmed`, `cancelled`, `reversed`, `unknown` |
| 对象生命周期 | 对象可用、停用、归档、删除？ | `isArchived`, Relation / Action lifecycle policy |

`EditHistory` 解决“谁在何时改了什么”，不能代替业务有效期间；审批状态也不能推导某日的业务事实。`temporalState`（过去、当前、待生效）与 `recordState`（草稿、确认、取消等）必须分别返回和展示。

## 先判定是否需要生命周期

对每个聚合依次回答：

1. 同一对象在不同 `asOf` 业务日，权威答案是否可能不同？
2. 过去答案是否需要参与工资、权限、归属、合同义务、报表重算或合规举证？
3. 是否允许预先登记未来变化？
4. 更正过去事实时，是否必须保留原先版本及更正原因？
5. 下游是否需要稳定引用某一历史版本，而不只是查看审计 diff？

第 1 题为否，通常只需当前表加审计。第 1 题为是，或第 2–5 题任一为是，必须登记 Business Temporal policy，不能等到“以后需要历史”再补字段。

常见反例：描述、缓存、搜索索引、可重建统计、纯 UI 偏好通常不需要有效时间；不要为所有表机械增加开始/结束日期。

## 五种存储形态

| `storage` | 适用条件 | 数据设计 | 默认 UI |
|---|---|---|---|
| `current` | 只关心当前值，旧值仅供审计 | 单行当前态 + optimistic `version` + EditHistory | 当前详情 + 审计抽屉 |
| `date-enabled` | 对象身份稳定，只控制可用期间 | 当前主表带开放期间；期间不表达属性版本 | 状态标签 + 启停/计划日期 |
| `effective-version` | 同一业务事实按日期切片，历史/未来均是权威数据 | 一条业务身份，多条不重叠有效版本 | 基准日 + 当前/待生效/历史 + 时间线 |
| `revision` | 内容需要起草、评审、发布、回看版本 | 稳定 header + 不可变 revision + published pointer | 已发布版本 + 版本列表/diff/发布动作 |
| `event-projection` | 不可变事件足以完整重建状态，顺序和冲正本身是业务事实 | append-only event ledger + 可重建 projection | 事件账本 + 状态投影 + 冲正/重放诊断 |

选择顺序是从左到右逐级证明，而不是默认上最复杂形态：

- “有开始/结束日期”不等于 `effective-version`；会议室可用期可能只是 `date-enabled`。
- “有事件日志”不等于 `event-projection`；事件缺少 before/source、普通更新能绕过、投影不能重建时，它只是补充日志。
- 合同正文版本通常是 `revision`，履约起止可能是 `date-enabled` 或 `effective-version`；一个聚合可以组合两种形态，但每类事实只能有一个 source of truth。
- 只有在确实需要回答“业务日 X 当时，在系统记录时间 Y 所知的答案”时才增加双时间维度。普通审计需求不升级为 bitemporal。

### 成熟 ERP 设计核验

本 Contract 不是从当前表结构反推出来的补丁，而是与主流 ERP 的公开有效期语义逐项核验：

- [Oracle Fusion Cloud HCM Date Effectivity](https://docs.oracle.com/en/cloud/saas/human-resources/faucf/using-common-features-for-hcm.pdf) 明确区分 date-effective 与 date-enabled：前者保存物理历史记录并支持未来变化、as-of 查询和 effective sequence；后者只有可用起止，属性更新仍覆盖当前值。对应本 Contract 的 `effective-version` 与 `date-enabled`。
- [Microsoft Dynamics 365 Finance Date effectivity](https://learn.microsoft.com/en-us/dynamics365/fin-ops-core/dev-itpro/dev-tools/date-effectivity) 同时提供 Current、AsOfDate、AsOfDateRange 查询，以及 CreateNewTimePeriod、Correction、EffectiveBased 写入模式。对应本 Contract 把普通变化、历史纠错和 effective-based 写入拆成不同命令。
- [SAP S/4HANA Business Partner Role](https://help.sap.com/docs/SAP_S4HANA_CLOUD/f86dc2eb1f8b48c880a7607213104b27/981e51b7ed7349c693d54587acf3b2a4.html) 把角色可用期作为独立事实，期限到期后自动停用；[Business Partner Relationship Validities](https://help.sap.com/docs/SAP_S4HANA_CLOUD/f86dc2eb1f8b48c880a7607213104b27/55e4bab7d2ba4ed999da41038e22c2e0.html?version=Latest) 还按关系类别声明“可有空洞但不得重叠”等 time constraint。对应本 Contract 的 `date-enabled` 角色期间与按槽位 overlap/gap policy。
- [SAP Business Partner Change History](https://help.sap.com/docs/SAP_S4HANA_ON-PREMISE/74b0b157c81944ffaac6ebc07245b9dc/db663b5856de0846e10000000a441470.html) 证明 change documents 适合回答字段审计，但与关系/角色 validity 是两类数据；这也是本 Contract 明确禁止用 `EditHistory` 替代 valid time 的原因。

对 Oracle 文档中 correction 可覆盖既有物理记录的做法，本项目采用更严格的合规口径：关键法定事实、合同、组织和协议纠错仍追加 superseding record，并记录 reason、actor、transaction time；只有 registration 显式选择 `audited-overwrite` 的低风险事实才允许原地纠错。

## 命令，不是通用 CRUD

生命周期写入必须表达业务意图，不能把所有语义压进一个 `PATCH status/date` 或通用 `DELETE`：

| 命令语义 | 结果 | 最低要求 |
|---|---|---|
| `schedule / insert-effective` | 从生效日 D 创建新期间，并按 policy 关闭或保留相邻期间 | effective date、影响预览、expected revision、幂等键 |
| `correct` | 修正已记录切片，不表达一次新的业务变化 | 独立权限、reason、expected revision、transaction-time 审计 |
| `end-date` | 从 D 起不再可用，但保留此前事实 | 终止原因、D-1 / D 边界预览、下游影响检查 |
| `cancel-future` | 取消尚未开始的计划变化 | 显式 cancelled provenance；不得静默物理删除 |
| `supersede / reverse / void` | 用新 revision 或 event 替代、冲正原事实 | append-only 链接到原记录并可追踪原因 |
| `purge-draft` | 清除从未生效、从未被下游引用的草稿身份 | 极高权限、引用证明；不出现在普通删除按钮中 |

权限至少拆分为：读当前、读历史、登记变化、纠错、终止、取消未来变化、purge。UI 是否显示入口与服务端授权必须消费同一 ActionContract，不能因为能看当前值就默认能改历史。

## 有效期间标准

Platform 计算统一使用半开区间：

```text
[validFrom, validToExclusive)
```

它使相邻期间 `[2026-01-01, 2026-08-01)` 与 `[2026-08-01, ∞)` 天然不重叠。用户表单和现有 HR 数据仍可展示包含式结束日 `validThrough`；必须通过 Contract 的转换函数进入计算，不能在业务包散落 `D + 1` / `D - 1`。

硬规则：

- 业务日是公历年份 `0001`–`9999` 内的合法 `YYYY-MM-DD`，不是 UTC 时间戳，也不是浏览器本地“今天”。
- 服务端从 `workspaceBusinessDate` 取得租户业务日，并在 DTO 中返回同一个 `asOfDate`。
- 纯函数和 adapter 必须显式接收 `asOf`，不得内部读取当前时间。
- 开放结束使用 `null`，不使用 `9999-12-31` 等高日期哨兵；包含式结束日的最大可转换值是 `9999-12-30`。
- `validFrom < validToExclusive`；同日多次变化只有 policy 声明 `sequenced` 且存在稳定序号时才允许。
- overlap/gap 规则按业务槽位约束。例如员工可有并行岗位，但同一时点工作占比必须为 100%，且必须且只能有一个主岗。

## Effective-version 表模板

新建有效版本表时，至少包含以下逻辑字段；字段名可按领域调整，语义不能变化：

```text
id                    immutable row identity
tenant/scope key      tenant or legal scope
aggregateId           stable business identity
validFrom             inclusive business date
validToExclusive      exclusive business date, null means open-ended
effectiveSequence     only when same-day sequencing is allowed
recordState           draft/pending/confirmed/cancelled/...
sourceChangeId        the command/change set that produced the row
version               optimistic concurrency token
createdAt/createdBy   transaction-time provenance
editedAt/editedBy     correction provenance when policy permits overwrite
```

数据库和 service 必须共同保证：

- 业务 key + 有效期间/槽位不出现非法 overlap。
- 关闭旧期间、创建新期间、写业务变更记录和审计在同一事务完成。
- commit 使用 expected revision；可重试入口使用 idempotency key。
- 未来变化的取消有显式 provenance，不通过物理删除来假装从未发生。
- 历史更正使用独立 correction command，要求原因；普通字段 CRUD 不得绕过期间 invariant。
- current 状态由 `asOf` 查询推导；`isCurrent`/`isActive` 若保留只能作为可重建投影，不能成为第二事实源。

若数据库暂时只能保存包含式 `startDate/endDate`，领域 adapter 负责转换，并将 registration 标记为 `partial`。不要为了统一外观伪造未知历史；迁移前事实无法还原时，明确记录 `unknown` / baseline provenance。

## Revision 与 Event 表补充

Revision 采用稳定 header 与不可变 revision 分表。已发布 revision 不原地覆盖；新修改创建下一 revision，通过明确发布动作切换 pointer。有效日期与 revision 号是不同维度，不能用 revision number 代替有效期间。

Event-projection 只有满足以下条件才可登记：

- event append-only，带 aggregate、event type、payload version、effective time、recorded time、sequence、actor、idempotency key；
- 冲正/替代也是新事件，不修改或删除旧事件；
- projection 可以只靠事件从空库重建，并有 replay 测试；
- 所有业务写入口都经过同一 command seam。

不满足任一条件，选择 `effective-version` 并把事件表标为 `supplementaryRecords`。

## 领域登记与 Interface

每个已接入聚合在所属业务包登记：

- 稳定 `key`、owner module、aggregate；
- `storage` 与 future/same-day/overlap/gap/correction/deletion policy；
- 唯一 `sourceOfTruth` 和补充记录；
- `maturity: implemented | partial | planned` 及未闭环说明。

Platform 只提供类型、日期/期间算法与 catalog builder，不维护一份冒充实现进度的全局静态清单。全局 catalog 只有在多个领域 adapter 已被运行时消费并有 coverage 后再聚合。

领域 runtime 的窄 Interface 是：

```text
execute(subject, command, preview|commit)
getState(subject, { asOf, knownAt? })
getTimeline(subject, { from?, toExclusive? })
```

`execute(commit)` 必须组合现有 ActionContract / domain validator / service transaction，不是第二套写入口。`preview` 与 `commit` 必须复用同一纯投影和 invariant；提交额外要求 revision、幂等和授权。

## 前端选配

前端只组合现有 Core/Platform Surface，不新增 Business Temporal 专属 Core kind。

| 数据形态 | 必选 | 按需选配 |
|---|---|---|
| current | 当前详情、审计入口 | 归档状态、恢复动作 |
| date-enabled | 可用状态、起止日期 | 待启用分组、日历视图 |
| effective-version | 服务端 `asOfDate`、`temporalState`、当前/待生效/历史三态 | 基准日选择器、时间线、变更预览、差异对比 |
| revision | 当前发布版、revision 列表、发布状态 | diff、审批、回滚为新 revision |
| event-projection | 业务状态与事件账本分区 | replay/投影健康诊断、冲正链 |

UI 硬规则：

- 待生效不是历史；至少显示“当前、待生效、历史”，异常期间单独显示“日期异常”。
- `recordState` 和 `temporalState` 使用不同字段、不同标签，不能合并成一个 `status`。
- 页面展示、候选过滤和保存前校验使用同一个服务端 `asOfDate`；不得用 `new Date().toISOString()` 判断业务当前态。
- 编辑生效日时实时预览被关闭、创建、取消的期间及下游影响；commit 前仍由服务端重新校验。
- 基准日、tab、筛选、选中记录属于同页状态，按项目规则用 state + history API，不做整页导航。
- 默认视图保持克制：普通 current 对象不展示时间轴；只有 policy 需要时才出现基准日或版本控件。

## 项目当前接入状态

### 完成判定与成熟度

生命周期改造的工程完成条件是：目标聚合已经选择唯一事实源和存储模板，登记明确的写命令与 UI 能力，在线写入不能绕过领域 seam，schema/migration 与模块文档同步，并且全局 registry 与受保护模型检查通过。`npm run business-temporal:check` 是这组条件的常驻门禁；当前 catalog 固定覆盖 15 个登记项、23 个受保护模型，且没有 `planned` 登记。

`maturity: partial` 不表示目标聚合仍可继续走普通 CRUD，也不能用来跳过门禁。它表示登记备注中仍存在可命名的兼容来源、租户历史基线、批量导入、独立权限或运行时 adapter/UI coverage 缺口；这些缺口没有关闭前不得改成 `implemented`。因此“工程改造完成”和“所有租户历史已被人工确认”是两个不同结论：前者由代码、migration、UI 和检查证明，后者必须由每个环境的只读 preflight 与受控数据发布证明。

租户级 preflight 只输出到私有审计目录，不把人员、合同或主体明细提交到源码。发现歧义时保持 fail closed：允许发布不重写该批历史事实的兼容代码，但任何会消费、回填或收紧这些事实的数据 migration 必须先完成对应人工决策单。

| 聚合 | 当前判断 | 状态 |
|---|---|---|
| HR Employment | `Employment` 包含式期间为事实源；`isActive` 是 legacy fallback/投影 | `effective-version`, partial |
| HR EDP assignment | `EDP` 包含式期间为事实源；允许并行任职并校验总占比/主岗 | `effective-version`, partial |
| HR EmployeeLifecycleEvent | 事件缺完整 before/source，未来取消仍会删除 projection row，不能 replay | supplementary log，不是 event-projection |
| Department / Position / 汇报关系 | 稳定 anchor + append-only effective version + `OrganizationStructureChange` 命令台账；当前字段仅作业务日缓存 | `effective-version`, partial；主 HR 入口已接入，旧编码/Platform 兼容写入口待关闭 |
| Work 项目成员 | 稳定 membership identity + 受控终结的有效版本 + 不可变 `ProjectMembershipChange`；旧行终结前的完整 `sourceBefore` 固化在命令台账 | `effective-version`, partial；写命令已收口并可重建原始期间，历史兼容读取仍保留 |
| 岗位说明书 | 稳定说明书 anchor + immutable `PositionDescriptionRevision` + revision 责任节点 | `revision`, partial；旧资料以未知历史基线迁入 |
| EmploymentAgreement | 稳定协议 anchor + 不重叠 term + immutable revision + 幂等命令台账 | `effective-version` + `revision`, partial；legacy `Employment.contracts` 只作待核对来源 |
| Administration Contract | 稳定合同 anchor + immutable `ContractRevision` + 签署/履约/归档 typed state events | `revision` + event，partial；现有状态字段只作当前投影 |
| External Party 法定事实 | `PartyLegalFactRevision` 是 append-only 事实源，Party / Company 同名字段是当前投影 | `revision`, partial；线上 External 与 Capital 公司写入已走同一 Platform seam |
| External Party Role | 稳定 role anchor + `ExternalPartyRolePeriod` 可用期；`isActive` 只作当前投影 | `date-enabled`, partial；正式 ERP 导入在 handler 接入前 fail closed |
| Capital ownership | `ShareCapitalEvent` 是账本；`OwnershipInterest` 是可从空库重建的带 generation/provenance 投影 | `event-projection`, partial；人工直写投影已关闭 |

HR adapter 位于 `packages/hr/server/domain/employee-business-temporal.ts`。Employment 的创建、删除及 `isActive/joinDate/leaveDate` 修改，EDP 的创建、修改、删除与员工详情整组保存，均已从公开 route、ActionContract 和 UI 中关闭；Employee、Employment、EDP、EmployeeProject 也不允许通过通用审计恢复重建。结构变化只允许进入员工“生命周期”命令。Employment 仍保留办公地点、人员类型、职级、职务、离职原因与备注的当前资料修正；EDP 在 reason + expected revision 的历史纠错命令完成前保持只读。详情、合同归属和合同筛选统一按租户业务日选择 current → 最近 upcoming → 最近 past 的雇佣期间；多条 current 或仅有非法期间时，隐式合同归属写入失败关闭。

该 employee adapter 仍有意标记为 `partial`：未来变化的取消仍会物理删除部分 EDP projection row，事件 payload 缺少完整 effect manifest、before/source 与幂等键，Employment 资料修正也没有显式 correction reason 和调用方 expected revision，`EmployeeLifecycleEvent` 因而不能从空库重放。项目成员已独立迁到受控 command seam，不再属于这个缺口；成员期间行可以被命令终结或标记 superseded，但不可变命令台账会保存终结前完整快照和新版本引用，不能把期间行本身误称为 append-only。员工身份没有独立 draft 状态，所以在线 hard delete API 已移除；离职必须走生命周期，账号停用必须走独立账号管理，二者不能互相代替。这些缺口必须在后续迁移中显式关闭，不能通过改名宣称已完成。

权限主体投影已改为按同一租户业务日过滤 Employment 与 EDP，不再直接把 raw `Employment.isActive` 或全部历史/未来岗位当作当前授权事实。其他报表、搜索和组织归属读取仍需按迁移顺序逐项盘点。

HR/Work 交界的项目成员权限也必须同时满足：账号关联员工存在当前 Employment，且 `EmployeeProject.startDate/endDate` 覆盖同一业务日。项目创建者的自然特权，以及由 position / department scoped grant 派生的主体，也必须分别要求当前 Employment 与当前 EDP。离职事件从生效日 D 起关闭这些自然权限，但保留历史成员记录；显式用户授权与账号停用仍是独立安全动作。

## 项目盘点后的目标矩阵

生命周期是“业务事实”的属性，不是整张表的统一开关。同一个聚合可以有稳定 anchor、有效期间、revision 和事件，但每类事实只能有一个 source of truth。

| 当前对象 / 事实 | 目标形态 | 判断与迁移重点 |
|---|---|---|
| `Employee`、`Party`、`Company` 的身份 anchor | `current` | 保留稳定 ID、版本和技术审计；人员离职或企业停用不删除身份。 |
| `Employment`、`EDP` | `effective-version` | 已接入但仍为 partial；补历史纠错、取消 provenance、幂等、数据库期间约束。 |
| `EmployeeProject` 项目成员可用性 | `effective-version`，partial | membership identity、角色与期间已一起版本化；受控终结保留完整 `sourceBefore`，幂等 ledger、expected revision、Serializable transaction、非重叠数据库约束和 history UI 已落地。 |
| `Department`、`Position`、`PositionReportOverride` 的名称、归属、上级和汇报规则 | `effective-version`，partial | 已使用稳定 anchor + 类型化不可变版本、幂等命令台账、expected sequence、Serializable 写入与延期 overlap 约束；主 HR UI 返回 as-of/current/upcoming/history，旧编码与 Platform 兼容写入口关闭后再标记 implemented。 |
| `DepartmentManagerEmployee` | 不应成为独立事实源 | 只保存 `Department.managerPositionId`；负责人姓名从该岗位在业务日有效的 EDP 占有人派生。迁移在 drop 前证明旧表每一条人员映射都能由现有权威推导，任何潜在丢失都失败关闭并保留旧表；旧兼容表缺行不反向削弱既有负责人岗位事实。 |
| `PositionDescription` | `revision`，partial | 已拆稳定 header、immutable revision 与 revision-scoped 责任节点；存量仅建立来源明确的现状基线，不伪造迁移前历史。 |
| `Employment.contracts` JSON | 稳定协议 anchor + effective term + revision，partial | `EmploymentAgreement` / Term / Revision / Change 已落地；旧 JSON 不按数组下标自动伪造身份，交由 preflight/import 显式核对。 |
| Administration `Contract` | anchor + `revision` + typed state event，partial | 正文、签署、履约、归档已分轴；所有命令要求幂等键，修订与事件 append-only，旧状态字段只作投影。 |
| Party / Company 法定名称、法人、证件和登记事实 | `revision` + current projection，partial | External 与 Capital 共用 Platform legal-fact seam；当前字段只作投影/cache，旧 ERP execute 路径 fail closed。 |
| `ExternalPartyRole` 客户/供应商可用性 | `date-enabled`，partial | 可用期独立于法定事实；支持 current/as-of/upcoming/history、纠错、取消未来和终止，禁止直接改 `isActive`。 |
| `ShareCapitalEvent` → `OwnershipInterest` | `event-projection`，partial | 已补 source/closed event、projection run、generation、projector version、ledger hash 与 rebuild；投影 run 受发行公司 FK 保护。 |
| Library 文档、Finance 政策版本 | `revision` | 延续已有 header + version/revision 形态，不再叠加通用 lifecycle history。 |
| 联系方式、备注、普通字典与可重建索引 | `current` | 默认只做 version + EditHistory；消费交易若需留痕，应保存交易快照。 |

`ApprovalEvent` 等流程事件只回答“审批如何流转”，不能与上述业务有效时间线合并；`EditHistory` 只回答“系统里谁改了什么”。两者都不是万能历史表。

## 迁移顺序

1. 盘点所有日期字段、current flag、history/event 表、定时任务和下游 current 查询。
2. 对每个聚合确定唯一事实源、存储形态和 policy；不确定的登记为 planned，不先改 schema。
3. 做数据 preflight：非法日期、重叠、空洞、同日多条、stale current flag、孤儿版本。
4. 建表/加字段与约束，保留来源标记；未知历史不伪造。
5. 先让 read adapter 支持显式 `asOf`，再迁写入 command；关闭能绕过 invariant 的字段 CRUD。
6. 迁移权限、组织归属、报表、候选搜索等下游，禁止继续读取 raw current flag。
7. 加 overlap/concurrency/idempotency/replay（如适用）测试后再收紧数据库约束。
8. 最后移除 legacy flag/helper 和兼容写入口；破坏式变化通过迁移解决，不污染公开 Contract。

每个批次只迁一个可验证的聚合。Schema-bearing 变更必须遵守 `schema-governance.md`，同步 migration、generated client、数据检查与模块文档。

HR Employment / EDP 批次在任何环境发布前必须执行 `npm run hr:temporal:preflight -- --as-of YYYY-MM-DD`。该命令在 PostgreSQL `REPEATABLE READ READ ONLY` 事务中扫描 Employment、EDP 与离职会联动的 EmployeeProject：统一按 Platform Contract 校验包含式期间，报告非法/倒置边界、无法转换为半开区间的高日期哨兵，以及当前项目成员缺少当前 Employment。开放结束必须保存为 `null`，不能用 `9999-12-31` 伪装。发现问题返回 1、运行错误返回 2；命令只报告，不修复或伪造历史。报告必须进入私有数据发布证据，不能把租户明细提交到源码。

## 检查基线

至少覆盖：非法/闰年日期、开始/结束边界、相邻期间不重叠、future 分类、open end、overlap/gap policy、同日变化、并发 revision、preview/commit 一致性、取消/冲正 provenance，以及 DTO 的统一 `asOfDate`。

定向测试后按 `docs/engineering/checks.md` 串行运行 `check:changed`、`docs:check` 和适用 scope。涉及 Prisma 时再增加 data/schema gate；不要在纯 Contract 阶段生成或改写 Prisma。
