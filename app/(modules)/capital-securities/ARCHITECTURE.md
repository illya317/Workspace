# 资本证券 — 架构文档

## Scope

资本证券承载投资人关系、注册资本流水、治理架构、法律公司角色与集团控制关系。治理架构不建独立组织表，继续使用 `Department.hierarchyKind = "G"` 作为组织单元事实源；稳定法定主体由共享 `Party` 保存，历史名称写入 `PartyNameHistory`，内部公司角色使用 `Company`，且 `Company.partyId` 一对一指向受治理 Party。股权唯一事实源是 `ShareCapitalEvent + ShareCapitalTransaction/ShareCapitalSnapshotPosition`；`OwnershipInterest` 只是账本生成的有效期投影，不能直接写入。`sourceEventId` 记录打开期间的事件，`closedByEventId` 记录关闭期间的事件，`projectionRunId + projectionGeneration` 指向 `OwnershipProjectionRun` 重建回执。旧投影在 expand migration 后允许这些字段为空，只有按发行主体完成受控重建后才具备完整 provenance；不得用 migration 猜测或补造来源。

## Route Shell

```text
app/(modules)/capital-securities/
├── page.tsx
├── investors/
└── governance/
```

页面 shell 只做路由鉴权、AppShell 挂载与模块 UI 引入；业务 UI 位于 `packages/capital-securities/ui`。

## Server Boundary

- 治理架构 API：`/api/modules/capitalSecurities/governance/organizations`
- 公司信息 API：`/api/modules/capitalSecurities/governance/companies`
- 股权关系只读 API：`/api/modules/capitalSecurities/governance/ownership-interests`
- 股东主体候选 API：`/api/modules/capitalSecurities/governance/ownership-parties`（只返回中立身份与遮罩证件号，不返回客户/供应商角色资料）
- 投资人关系查询 API：`/api/modules/capitalSecurities/investors`（公司 + 基准日 -> 当前股东名册、注册资本交易流水和逐轮股权结构表）
- 股权结构表导出 API：`/api/modules/capitalSecurities/investors/export`（与页面共用同一按日计算服务）
- 股权投影唯一写服务：`rebuildOwnershipProjection({ issuerCompanyId, ... })`。服务在同一事务中获取发行主体 advisory lock，载入完整事件账本，计算 projector-input SHA-256，调用 `deriveOwnershipPeriods`，整体替换该发行主体的 `OwnershipInterest` 并写入新一代 `OwnershipProjectionRun`。未来事件追加/确认命令必须调用这条服务，不得另写投影表。
- 组织单元服务：`@workspace/platform/server/organization-units`
- 组织单元写入：`Department`、`EditHistory`；负责人姓名只从 `managerPositionId` 对应的当前 Employment + EDP 占有人派生。
- 岗位、岗位说明书、员工任职仍由 HR 维护，治理架构只读取岗位摘要。
- HR 的 `/api/modules/hr/roster/companies` 仅保留公司候选 GET 适配；公司角色写入进入资本证券 service，股权写入只进入股权事件账本。

## Permissions

- L1：`capitalSecurities`
- 投资人关系：`capitalSecurities.investors`
- 治理架构：`capitalSecurities.governance`
- 治理架构 API：`read` 可读，`create` 可新建 G 组织，`update` 可编辑 G 组织基础信息。
- `create/update` 覆盖治理组织和公司角色资料；法定名称、当前法人及 `OwnershipInterest` 不开放直接写入。
- 投资人关系和集团股权都是只读业务投影，开放 `entry/read/grant`；名称、法人和股权事实通过受治理的历史导入或后续事件录入能力维护。

前端动作位置和图标约定：

- `capitalSecurities.governance.create`：左侧 G 线组织树 command，使用 `add` 图标，创建当前选中组织的下级或顶层 G 组织。
- `capitalSecurities.governance.update`：右侧组织详情面板保存按钮，使用 `save` 图标；岗位摘要只读，跳转 HR 维护岗位。
- `capitalSecurities.investors`：按公司和基准日查询、导出股权结构表；股权结构图可下载当前投影的关系 CSV。页面展示来源可追溯的注册资本事件与交易，不渲染新建、编辑或删除动作。

## 工作空间轻代码读取模型

Capital Securities owner 将治理和投资人两个受保护 GET 的公开读模型拆为 17 个版本化 source：公司、集团持股、治理组织与岗位，以及投资公司、股东、股本事件/交易、融资轮次/出资、CapTable 轮次/持仓和股权结构图节点/边。组织说明、负责人、岗位管理关系等嵌套数组也都作为 child source 登记；股东候选接口只是 lookup，不另当事实源。

这些公司治理事实没有个人、部门或项目归属外键，三类空间均明确为 `workspace`，并分别继承原接口的 `capitalSecurities.governance.read` 或 `capitalSecurities.investors.read`。敏感级不会阻止原本有权查看的账号做分析；文件导出、写入和主体候选片段仍不进入读模型。

## Notes

治理架构页面通过 Core TabBar 分为“治理组织 / 集团股权 / 公司信息”。“公司信息”维护公司角色资料及可编辑的公司描述；法定全称和当前法人是历史事实的当前投影，只读展示。“集团股权”读取由统一账本生成的 `OwnershipInterest`，页面不提供新增、编辑或删除。历史表同时展示来源/关闭事件与投影代次；旧行未重建时明确显示“历史投影（待重建）”。每段投影保存有效期、状态与来源引用，供关系图、治理页面和财务合并消费；需要纠错时修改或补充上游股权事件并整体重放投影，不能修补下游期间。

内部公司不是第二份法定主体：公司目录、HR 公司候选和资本证券页面都从 `Company -> Party` 读取名称与身份。人工新增公司可以把尚无 Company 角色的既有 Party 提升为内部公司；数据发布必须先解析或建立 Party，再创建 Company。相同公司编码指向不同 Party、或同一 Party 被绑定到不同公司编码时必须停止，不能靠覆盖名称合并。

工商证据只把股东变化和法定代表人变化写入 `CompanyRegistryChange`，在公司信息页随主体展示；董事长、普通董事、监事、经理及地址、经营范围等不进入当前审定投影。投资人/股东名单同时拆成 `CompanyRegistryOwnershipParticipant` 前后快照并关联 `Party`；未匹配主体保留原名并标记为待认领，原始文本始终保留用于审计。公司法定名称沿革写入 `PartyNameHistory`，名称起始日未知时保留 `effectiveFrom = null + datePrecision = unknown`，不得杜撰日期；`Party.fullName` 与 `Party.legalRepresentative` 只是基准日当前值缓存。

CapTable、股东分组、主体名称沿革、股权事件账本及治理历史属于租户业务数据，必须通过私有数据发布协议进入运行态；源码只保留通用投影器和关系图，不保存清单、payload、公司名称、日期、比例或结果台账。

投资人关系页面分为“股权情况 / 股权结构表 / 股权结构图”三页签。“股权情况”按股东展示当前信息及其参与的资本流水；“股权结构表”按轮次展示注册资本、持股比例、定价依据、实际出资及推导估值；“股权结构图”的主角公司来自租户配置 `finance.referenceCompanyCode`，并从基准日有效关系递归展开。下载只输出关系投影 CSV，不把图片或私有源文件作为协议。布局只依据关系和比例，不判断公司名称或编码。

股东分组不是 `Party` 的固有属性，而是特定发行主体在特定期间的展示与分析语义。`ShareholderGroup` 保存发行主体下的稳定分组，`ShareholderGroupMembership` 保存有效期间、确认状态、排序和来源；分组比例始终由成员在同一基准日的注册资本余额汇总。图形布局只消费通用节点、边、分组和有效期投影，不在源码中列举租户分组台账。

股权结构表不是独立持久化表，也不持久化手工比例或估值。正常事件只使用注册资本流向：增资/设立为 `null → 股东`，转让为 `转出方 → 转入方`，减资/回购为 `股东 → null`。`confirmation_snapshot` 是同一账本中的受限校准事件，只允许在建立首个基准、历史金额断档或恢复完整基准时使用；`party_list_only` 明确表示只知道名单，之后不得继续定量交易，直到出现 `complete` 确认快照。服务按 `issuerCompanyId + asOf` 重放事件，生成各期余额、比例、Captable 和 `OwnershipInterest` 有效期投影。增资估值按“本轮出资合计 ÷ 本轮新增认缴资本 × 投前/投后注册资本”计算，二手转让按“交易对价 ÷ 转让认缴资本 × 当轮注册资本”计算隐含估值；任一交易缺少有效对价时，整轮不生成估值。`confirmed` 事件改变正式口径；`pending` 事件只生成预期投影。证件号码和主体类型保留在 `Party` 主数据中，但不下发到投资人关系展示 DTO。
