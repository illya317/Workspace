# 资本证券 — 架构文档

## Scope

资本证券承载投资人关系、被投企业组合、注册资本流水、治理架构、法律公司角色与集团控制关系。投资企业是 Capital Securities 的 L2：这里维护投前至退出的业务档案、治理事项、尽调问题、合同义务和投后观察，不复制公司、主体或股权事实。治理架构不建独立组织表，继续使用 `Department.hierarchyKind = "G"` 作为组织单元事实源；稳定法定主体由共享 `Party` 保存，历史名称写入 `PartyNameHistory`，内部公司角色使用 `Company`，且 `Company.partyId` 一对一指向受治理 Party。股权唯一事实源是 `ShareCapitalEvent + ShareCapitalTransaction/ShareCapitalSnapshotPosition`；`OwnershipInterest` 只是账本生成的有效期投影，不能直接写入。`sourceEventId` 记录打开期间的事件，`closedByEventId` 记录关闭期间的事件，`projectionRunId + projectionGeneration` 指向 `OwnershipProjectionRun` 重建回执。旧投影在 expand migration 后允许这些字段为空，只有按发行主体完成受控重建后才具备完整 provenance；不得用 migration 猜测或补造来源。

## Route Shell

```text
app/(modules)/capital-securities/
├── page.tsx
├── investors/
├── investments/
├── market-intelligence/
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
- 股东关系资料保存 API：`PUT /api/modules/capitalSecurities/investors/shareholder-profiles`（按发行主体 + 股东 Party 维护联系人、关系负责人和沟通资料，不修改股本账本）
- 投资人尽调台账 API：`POST/PATCH/DELETE /api/modules/capitalSecurities/investors/due-diligence[/:id]`（一行一位外部尽调参与人；删除语义为软归档）
- 投资企业工作台 API：`GET/POST/PUT /api/modules/capitalSecurities/investments`；子资源 `POST/PUT .../records` 分别维护股东会、尽调问题、合同义务和投后监控。该 API 暂沿用 Capital Securities 已登记的 camel-case 模块基址，随模块整体迁移时统一切换。
- 投资企业资料 API：`POST .../documents` 只保存稳定 `LibraryDocument.documentUid` 链接；原文件、不可变版本、OCR、chunk 和向量均由 Library owner 通过签名内部协议处理。`POST .../search` 只在当前企业已链接的精确文档 UID 集合内做语义召回，并返回逐字片段及 locator。
- 市场情报 API：`GET /api/modules/capitalSecurities/market-intelligence`。服务端 provider 聚合 AKShare/AKTools 的公开数据接口，支持固定指数/大宗商品/汇率目录和最多 8 只浏览器自选 A/H/美股；`catalog=stocks&q=...` 在服务端搜索每日更新的 A股、港股和美股上市证券目录，只下发有界命中结果。同一响应归一化报价与可用历史日线，股票额外组合最新财务摘要、公开披露日程和个股新闻，按数据集分级缓存并在单一数据集失败时降级。页面不能直接依赖上游字段名或 URL。
- 股权投影唯一写服务：`rebuildOwnershipProjection({ issuerCompanyId, ... })`。服务在同一事务中获取发行主体 advisory lock，载入完整事件账本，计算 projector-input SHA-256，调用 `deriveOwnershipPeriods`，整体替换该发行主体的 `OwnershipInterest` 并写入新一代 `OwnershipProjectionRun`。未来事件追加/确认命令必须调用这条服务，不得另写投影表。
- 组织单元服务：`@workspace/platform/server/organization-units`
- 组织单元写入：`Department`、`EditHistory`；负责人姓名只从 `managerPositionId` 对应的当前 Employment + EDP 占有人派生。
- 岗位、岗位说明书、员工任职仍由 HR 维护，治理架构只读取岗位摘要。
- HR 的 `/api/modules/hr/roster/companies` 仅保留公司候选 GET 适配；公司角色写入进入资本证券 service，股权写入只进入股权事件账本。

## Permissions

- L1：`capitalSecurities`
- 投资人关系：`capitalSecurities.investors`（`read` 查询股权与尽调资料，`create/update/delete` 分别控制尽调新增、资料编辑和尽调记录软归档）
- 投资企业：`capitalSecurities.investments`（`read` 查看组合档案和已链接资料分析；`create/update` 维护投资档案及业务记录；`import` 独立控制文件上传和分析入库）
- 市场情报：`capitalSecurities.marketIntelligence`（`entry/read`；只读目录与行情聚合）
- 治理架构：`capitalSecurities.governance`
- 治理架构 API：`read` 可读，`create` 可新建 G 组织，`update` 可编辑 G 组织基础信息。
- `create/update` 覆盖治理组织和公司角色资料；法定名称、当前法人及 `OwnershipInterest` 不开放直接写入。
- 投资人关系和集团股权都是只读业务投影，开放 `entry/read/grant`；名称、法人和股权事实通过受治理的历史导入或后续事件录入能力维护。

前端动作位置和图标约定：

- `capitalSecurities.governance.create`：左侧 G 线组织树 command，使用 `add` 图标，创建当前选中组织的下级或顶层 G 组织。
- `capitalSecurities.governance.update`：右侧组织详情面板保存按钮，使用 `save` 图标；岗位摘要只读，跳转 HR 维护岗位。
- `capitalSecurities.investors`：按公司和基准日查询、导出股权结构表；股权结构图可下载当前画布的 PDF。注册资本、持股比例、估值和股权活动期间仍是来源可追溯的只读账本投影。页面只允许编辑独立的股东关系资料，并允许新增、编辑或软归档尽调参与人记录；这些写入不得覆盖任何股权事件或 `OwnershipInterest` 投影。
- `capitalSecurities.investments`：沿用投资人关系的左侧主体列表、右侧页签与表格视觉语言；业务事实分为投资概览、股东会、尽调资料、相关合同、投后监控和智能资料。新增使用页面 CreateSurface block；记录编辑和资料上传替换右侧详情区为字段区块，保留企业上下文，不使用业务弹窗。模型提取和语义检索永远显示来源定位，用户复核后才把内容写成正式业务记录。

## 工作空间轻代码读取模型

Capital Securities owner 将治理和投资人两个受保护 GET 的公开读模型拆为 17 个版本化 source：公司、集团持股、治理组织与岗位，以及投资公司、股东、股本事件/交易、融资轮次/出资、CapTable 轮次/持仓和股权结构图节点/边。组织说明、负责人、岗位管理关系等嵌套数组也都作为 child source 登记；股东候选接口只是 lookup，不另当事实源。

这些公司治理事实没有个人、部门或项目归属外键，三类空间均明确为 `workspace`，并分别继承原接口的 `capitalSecurities.governance.read` 或 `capitalSecurities.investors.read`。敏感级不会阻止原本有权查看的账号做分析；文件导出、写入和主体候选片段仍不进入读模型。

## Notes

投资企业档案以 `Company` 为稳定主体，一家公司最多一个 `InvestmentEnterpriseProfile`。投资概览覆盖投资状态/阶段、行业、投资与退出日期、投资金额、最新估值、负责人、投资逻辑、关键风险、退出计划和下次复核日期；股东会记录议案与决议执行，尽调记录问题、责任人与整改闭环，合同记录期限、金额和关键义务，投后监控记录 KPI、估值和退出信号。结构化记录保留独立版本号和编辑审计，不用上传文档内容反向覆盖。

智能资料只保存 `InvestmentEnterpriseDocumentLink -> LibraryDocument.documentUid` 的跨模块引用。上传先在 Capital 建立待处理链接，再由 Library 创建不可变资料版本并执行原有文本抽取/OCR；向量索引固定为 `Qwen/Qwen3-Embedding-0.6B`、1024 维、归一化向量。模型或运行时不可用时状态必须明确降级为 unavailable/warning，不允许伪造摘要或检索命中；后续重试仍围绕同一稳定资料 UID 和版本运行。

市场情报初稿提供指数、大宗商品、汇率和 A/H/美股的受保护目录与轮询行情。用户可按市场和代码增加任意股票；订阅清单只存当前浏览器的 `localStorage`，不形成跨用户或跨设备业务记录。A股代码表、港股行情目录及 Nasdaq Trader 美国上市证券目录在服务端合并去重，以 24 小时 TTL 原子持久化；正常页面访问会预热，过期时先返回上次成功目录并在后台刷新，浏览器只按关键词获取最多 80 条命中，不下载上万条目录。股票、指数和大宗商品 provider 最多抓取约 10 年原始日线以支持长周期聚合，API 只下发受控窗口：日 K 最近 1 年、周 K 最近 3 年、月 K 最近 5 年、季 K 与年 K 最近 10 年。汇率优先使用中国银行公开数据中的央行中间价，缺失时退到同日中行折算价，并保留实际交易日；当前不生成汇率 K 线。周/月/季/年 OHLCV 均从同一日线事实按“首日开盘、区间最高/最低、末日收盘、成交量求和”确定性聚合；不创建第二份行情事实。股票追踪同时组合 MA5/10/20/30、最新财务摘要、A 股当前报告期预约披露、港/美股未来 14 天公开财报日历和最近个股新闻。K 线只消费 provider 返回的真实开高低收与成交量，不用收盘价伪造缺失字段；均线由 Core `VisualizationSurface chart.visual.kind="candlestick"` 对当前周期的收盘序列复算。桌面通过 `createMasterDetailBody` 左侧保留股票、指数、大宗商品和汇率的统一自选，右侧用少量关键指标卡片及详情区展示行情；移动端先展示同一自选列表，选择后全屏推进详情，顶部按证券终端格式完整列出品类、市场、代码、币种、最新价、涨跌幅、涨跌额、开高低、昨收、成交量和行情时间，再接 K 线，股票继续显示财报和资讯。移动端隐藏桌面逐周期明细表。财报提醒是页面内可见日程，不在 GET 请求中产生通知副作用；若需要后台定时、通知铃铛或跨设备共享，必须另建受审计的服务端订阅模型、幂等调度任务和已登记业务通知类型。

`MARKET_INTELLIGENCE_AKTOOLS_BASE_URL` 未配置或上游不可用时，页面保留固定目录和订阅并明确显示降级状态，不返回伪造行情、财务或资讯。即时行情内存缓存 90 秒，个股新闻缓存 5 分钟，财务与披露日历缓存 6 小时；股票、指数和大宗商品原始日线额外缓存 30 分钟，三地股票目录缓存 24 小时，并以原子 JSON 文件持久化到 `MARKET_INTELLIGENCE_CACHE_DIR`，未显式配置时使用 `WORKSPACE_CONFIG_DIR/cache/capital-securities/market-intelligence`。缓存只保存公开 provider 响应，文件名或固定目录版本均受大小和条数约束，不进入源码或业务数据库。上游公开日历覆盖差异必须直接显示为“暂无日程”，不能用历史周期推测未来日期。开源适配器不代表获得上游行情或资讯再分发许可。

治理架构页面通过 Core TabBar 分为“治理组织 / 集团股权 / 公司信息”。“公司信息”维护公司角色资料、公司财务本位币和当前集团的合并母公司标记；本位币写入唯一的 `FinanceCompanyCurrencyPolicy.currencyId` FK，并与集团科目共同引用 `FinanceCurrencyCatalog`，不得在 `Company` 再复制币种字段或维护第二份自由文本目录，同一租户最多保留一个合并母公司。切换母公司时服务在同一事务中撤销旧标记并保留公司编辑历史。法定全称和当前法人是历史事实的当前投影，只读展示。“集团股权”读取由统一账本生成的 `OwnershipInterest`，页面不提供新增、编辑或删除。历史表同时展示来源/关闭事件与投影代次；旧行未重建时明确显示“历史投影（待重建）”。每段投影保存有效期、状态与来源引用，供关系图、治理页面和财务合并消费；需要纠错时修改或补充上游股权事件并整体重放投影，不能修补下游期间。

内部公司不是第二份法定主体：公司目录、HR 公司候选和资本证券页面都从 `Company -> Party` 读取名称与身份。人工新增公司可以把尚无 Company 角色的既有 Party 提升为内部公司；数据发布必须先解析或建立 Party，再创建 Company。相同公司编码指向不同 Party、或同一 Party 被绑定到不同公司编码时必须停止，不能靠覆盖名称合并。

工商证据只把股东变化和法定代表人变化写入 `CompanyRegistryChange`，在公司信息页随主体展示；董事长、普通董事、监事、经理及地址、经营范围等不进入当前审定投影。投资人/股东名单同时拆成 `CompanyRegistryOwnershipParticipant` 前后快照并关联 `Party`；未匹配主体保留原名并标记为待认领，原始文本始终保留用于审计。公司法定名称沿革写入 `PartyNameHistory`，名称起始日未知时保留 `effectiveFrom = null + datePrecision = unknown`，不得杜撰日期；`Party.fullName` 与 `Party.legalRepresentative` 只是基准日当前值缓存。

CapTable、股东分组、主体名称沿革、股权事件账本及治理历史属于租户业务数据，必须通过私有数据发布协议进入运行态；源码只保留通用投影器和关系图，不保存清单、payload、公司名称、日期、比例或结果台账。

投资人关系页面分为“股权情况 / 股权结构表 / 股权结构图 / 尽调情况”四页签。“股权情况”按股东展示当前法定主体、股本口径、联系人、关系负责人、沟通偏好和备注，并保留该股东参与的资本流水；其中法定主体与股本口径只读，联系与关系资料可按权限编辑。“股权结构表”按轮次展示注册资本、持股比例、定价依据、实际出资及推导估值；“股权结构图”的主角公司来自租户配置 `finance.referenceCompanyCode`，并从基准日有效关系递归展开。下载把当前画布合成为带标题和基准日的 A3 横向 PDF，不把私有源文件作为协议。布局只依据关系和比例，不判断公司名称或编码。“尽调情况”按外部参与人维护所属投资机构、日期、方式、尽调类型、状态、内部对接人、NDA、资料室权限、重点问题和后续事项；潜在投资人可以不关联现有股东 Party，已有关联时保存稳定 FK 和当时的机构名称快照。

股东分组不是 `Party` 的固有属性，而是特定发行主体在特定期间的展示与分析语义。`ShareholderGroup` 保存发行主体下的稳定分组，`ShareholderGroupMembership` 保存有效期间、确认状态、排序和来源；分组比例始终由成员在同一基准日的注册资本余额汇总。图形布局只消费通用节点、边、分组和有效期投影，不在源码中列举租户分组台账。

股权结构表不是独立持久化表，也不持久化手工比例或估值。正常事件只使用注册资本流向：增资/设立为 `null → 股东`，转让为 `转出方 → 转入方`，减资/回购为 `股东 → null`。`confirmation_snapshot` 是同一账本中的受限校准事件，只允许在建立首个基准、历史金额断档或恢复完整基准时使用；`party_list_only` 明确表示只知道名单，之后不得继续定量交易，直到出现 `complete` 确认快照。服务按 `issuerCompanyId + asOf` 重放事件，生成各期余额、比例、Captable 和 `OwnershipInterest` 有效期投影。增资估值按“本轮出资合计 ÷ 本轮新增认缴资本 × 投前/投后注册资本”计算，二手转让按“交易对价 ÷ 转让认缴资本 × 当轮注册资本”计算隐含估值；任一交易缺少有效对价时，整轮不生成估值。`confirmed` 事件改变正式口径；`pending` 事件只生成预期投影。证件号码和主体类型保留在 `Party` 主数据中；投资人关系 DTO 只下发主体类型与掩码后的证件标识，不下发完整证件号码。
