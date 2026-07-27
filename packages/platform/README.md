# @workspace/platform

Workspace 主体包。这里聚合平台模块和业务包注册，生成导航、入口卡片和后续资源注册。

当前职责：

- 汇总 `workspacePackages`
- 生成 `MODULES`
- 从各 package 的 `resourceDefs` 派生资源注册、资源 key 列表和最大角色 fallback
- 从模块注册的 `lifecycleStatus` 派生模块生命周期提示
- 提供 `getAccessibleModules`、`getSubModules`、`getEmptyMessage`
- 提供登录后的 Portal、L1 模块首页、AppShell、跨页导航、用户菜单和审计日志 UI 壳
- 提供 `SessionUser` 等登录态平台契约类型
- 提供审计日志字段标签与值格式化工具；具体业务审计弹窗留在各业务包
- 提供 `@workspace/platform/hooks` 的跨模块平台 hook，例如 `useCompanyOptions`
- 提供 `@workspace/platform/server/company-directory` 作为公司主数据的共享只读查询、编码解析和缓存 seam；公司 CRUD 仍由 HR 业务域负责
- 提供 `@workspace/platform/server/permission-subjects` 作为 Settings、Docs、Work 共用的 RBAC 主体投影，不由 HR 反向承载平台授权能力
- 提供 `@workspace/platform/calendar` 作为中国法定节假日与调休工作日查询契约；Core 只负责无事实的日期展示，HR、Work、Finance 等业务包通过该入口判断工作日、节假日和补班日
- 提供 `@workspace/platform/completion-date-policy` 作为跨业务完成状态与计划/实际日期契约；项目、计划和任务统一使用 canonical date fields，并共享未来实际日期、完成后实际结束、日期顺序和 UI 可编辑状态规则
- 提供 `@workspace/platform/contracts/business-temporal` 作为跨业务有效时间 Contract；统一业务日期、半开期间计算、对象 policy 登记和 runtime adapter 形状，各业务域继续拥有自己的 source of truth、validator、事务和 UI 组合
- 提供 `@workspace/platform/workflow-category-registry` 作为流程业务分类的唯一注册表；workflow-eligible business action 必须声明合法的 `workflowCategoryKey`，设置、台账和收件箱不得另建映射
- 提供 `packages/platform/workflow-management-resources.ts` 作为流程管理授权的唯一投影 interface；它生成 workflow root/category/action capability，并把授权资源反向解析为 effective business action 集合
- 提供 `packages/platform/api-registry.ts` 作为 API Contract Registry，从 module registry 的 `apiGuards` 与 `apiRoutes` 派生 protected/public/dev/disabled API 契约
- 提供 `@workspace/platform/server/api` 作为 API route 通用请求解析与字段校验 helper；旧 `lib/schemas.ts` 已删除
- 提供 `@workspace/platform/server/domain-validation` 作为业务包 domain command/validator 的轻量结果契约；API schema 校验请求形状，domain validator 校验业务规则，service 只消费已验证 command
- 提供 module registry 与 API Contract Registry，供 `scripts/arch/domain-validation.ts` 推导业务 API root 并执行 domain validation ratchet；新增业务写入口必须走 `API schema -> domain command/validator -> service write/audit`
- 提供 `@workspace/platform/server/auth` 作为认证和平台权限检查契约；旧 `lib/auth.ts` 聚合 hub 已删除，低层 token 实现暂留 `lib/auth/token.ts`
- 提供 `@workspace/platform/permissions` 作为 RBAC 资源/角色常量与角色标准化 helper
- 提供 `@workspace/platform/server/with-auth` 作为 API route 认证包装器；旧 `lib/with-auth.ts` 已删除
- 提供 `@workspace/platform/server/crud-factory` 作为字段级 CRUD route helper 和 domain CRUD facade 契约；旧 `lib/crud*.ts` 兼容入口已删除
- 提供 `@workspace/platform/server/delete-guard` 作为删除和归档最低规则契约；归档必须显式声明引用已检查、确无引用或按聚合生命周期保留，缺失声明直接拒绝；`setNull/cascade` 引用必须同时提供清理实现，并在同一事务中完成引用检查/清理、审计快照和删除/归档/停用
- 提供 `@workspace/platform/server/prisma` 作为单库 Prisma runtime 契约；旧 `lib/prisma.ts` 已删除并由 Level 2 ratchet 禁止恢复
- 提供 `@workspace/platform/server/history` 作为 EditHistory 审计快照契约；历史策略统一声明在 `packages/platform/server/history-policy-registry.ts`
- 提供 `@workspace/platform/server/relation-registry` 和 `@workspace/platform/server/reference-options` 作为 Relation Catalog、FK 搜索、校验、权限和引用候选契约；带对象可见性或额外参数的 selector 语义仍通过业务包 `server/fk-registry.ts` adapter 注入
- 提供 `@workspace/platform/server/mutation-impact` 作为变更影响的递归规划和执行契约；业务 service 提供同一事务、业务 adapter、root commit 和审计上下文，Platform 不反向依赖业务 service
- 提供 `@workspace/platform/server/mutation-impact-ledger` 作为变更批次/影响明细审计契约；root 与关联 effect 必须和真实写入共用调用方事务
- 提供 Approval engine 的三阶段 ActionContract 重验与一次性批准 capability；正式写入 capability 绑定 request id、claimed version 和 businessActionKey，只有 engine 抢占 `committing` 后可签发，direct command 不得复用审批 bypass
- 提供 `@workspace/platform/server/resolve-fk` 作为 registry 驱动的 FK 快照显示名解析契约，展示解析优先使用 `entityType + field`，再用 `Any + field` 兜底，避免裸字段名跨实体误解析
- 提供 `@workspace/platform/server/workspace-analysis-source-registry` 作为经营分析轻代码的数据源登记契约；业务域登记稳定 `sourceKey + version`、字段口径/敏感级、支持空间、授权、可信 scope query、字段投影和硬限额，模板不得长期保存内部 URL、响应路径或分页机制
- 提供 `@workspace/platform/server/workspace-analysis-definition-compiler`、`workspace-analysis-source-directory` 与 `workspace-analysis-source-rpc`，分别负责严格 v3 DSL 编译、显式 provider 组合和跨 deploy unit 的签名 discovery/execute；业务权限仍由 source owner 每次按 requester + target scope 判定
- 提供 `workspace-analysis-execution-plan`、`workspace-analysis-source-executor` 与 `workspace-analysis-runtime`，把 scoped discovery 结果绑定为不可序列化的授权执行计划，由 source owner 分页、投影并重新授权，再在服务端聚合为不含原始业务行的 render DTO

Platform 可以读取业务包的注册信息，但不能直接 import 业务页面或业务 service。业务包需要认证和权限时依赖 `@workspace/platform/server/auth` 或 `@workspace/platform/server/with-auth`，需要 RBAC 常量或角色标准化时依赖 `@workspace/platform/permissions`，需要 API route 通用请求解析时依赖 `@workspace/platform/server/api`，需要 domain validator 结果契约时依赖 `@workspace/platform/server/domain-validation`，需要通用 CRUD helper 时依赖 `@workspace/platform/server/crud-factory` 并在本领域封装，需要自定义删除事务时依赖 `@workspace/platform/server/delete-guard`，需要数据库访问时依赖 `@workspace/platform/server/prisma`，需要审计快照时依赖 `@workspace/platform/server/history`，需要 FK 候选或校验时依赖 `@workspace/platform/server/relation-registry` / `@workspace/platform/server/reference-options`，需要 FK 快照显示名时依赖 `@workspace/platform/server/resolve-fk`；不要恢复 app-root `@/lib/auth` 聚合 hub、`lib/with-auth.ts`、`@/lib/crud*` 兼容入口，也不要直接依赖 app-root `@/lib/permissions`、`@/lib/prisma`、`@/lib/history`、`@/lib/resolve-fk` 或 generated Prisma client。

`guardedDelete` 直接调用时不声明 `deleteMode` 会默认禁删；`crud-factory` 为兼容存量字段级删除会显式沿用 hard delete 默认，新增 CRUD 配置应主动填写 `deleteMode`、`deleteReferences` 或 `onBeforeDeleteScope`。

## Workspace Analysis Source Registry

经营分析的“轻代码”是受控 JSON DSL，不是 JavaScript/SQL 运行环境。Platform 只拥有登记、验证和执行编排接口；各业务域拥有自己的数据源 registration、字段业务含义和 transport adapter。登记项必须固定版本；`sourceKey` 第一段等于 owner module 规范化后的 deploy unit（camelCase 会转 kebab-case），并与真实 GET API contract 的 owner、resource、actions、runtime enforcement 和 projection 一致。

业务域的直接 GET registration 可以包含内部 GET 路径、响应路径、强制 scope query、字段投影和分页机械信息，但这些 transport 细节只能存在于受版本管理的代码登记簿。若 owner 需要从获授权对象派生有界读模型，必须登记运行时白名单内的显式 `ownerDerived` adapter：固化 JSON 分段使用 `partitionedSnapshot`，完整关系分页使用 `boundedRelationSnapshot`；二者都只引用原 GET 作为授权合同，不得伪造 rowsPath、totalPath 或 query transport，也不得声明 `workspace.api` v2 的 `directRows` 等价迁移。Workspace 模板未来只保存 `sourceKey + sourceVersion + parameters`；空间 ID/类型由运行时可信上下文注入，模板参数不得覆盖。字段只通过登记的 canonical key 进入筛选、分组、聚合和明细；每个公开行 DTO 字段必须分类为可分析字段、规范化子源或具名排除，不能静默漏列。

轻代码不增加第二套数据权限。source discovery 和 execute 都继承原业务 GET 的精确 action，并复用 owner 的对象可见性 service；source 的运行态开关同样只复用 `authorization.resourceKey`，由 `isResourceEnabled` 统一合并资源、L2/runtime parent 和所属 L1 状态，关闭上级模块后不能由 root/admin 的 RBAC 快路径重新放行。原业务读取允许看到的稳定标量字段，包括敏感字段、内部 ID、版本和记录时间，都可被模板查询。`sensitivity` 只用于提示、审计和未来脱敏展示，`exportPolicy` 只在独立导出链路生效，二者都不拦截当前只读分析。空间绑定只描述数据口径：`target` 强制目标空间，`viewer` 沿用当前查看人可见对象，`workspace` 明确表示全公司数据，后者不得伪装为部门或项目归集。

“全部业务数据”由 `npm run workspace-analysis-sources:check` 做闭环，不依赖人工记忆白名单。检查会扫描真实 route 文件中的受保护业务 GET，并要求每个接口只能是：至少一个可执行的版本化 source、能由已登记事实重算的 derived 视图，或带具名理由的 exclusion；新增 GET 未分类、子 sourceKey 悬空、source adapter 没有真实受保护 GET、派生项引用不存在的 source 都会失败。只允许排除文件/导出、候选搜索、账号权限配置、递归分析、通用审批控制记录、没有有界批量读模型的单对象详情，以及尚未形成稳定业务口径的复合 DTO；“敏感”或“内部字段”本身不是排除理由。

不是数据集的 GET 不会为了“数量齐全”伪装进目录：文件/附件/下载/预览流、密钥和客户端凭证、搜索/联想/下拉选项、空间权限与账号偏好控制面、递归模板/runtime API、无批量边界的单条详情，以及尚未规范化的动态/嵌套结构都会明确排除或先拆成子读模型。写接口永远不能登记。

当前已落登记、严格 v3 结构/语义编译、scoped discovery 和服务端执行 foundation。编译器按精确版本校验参数、字段、筛选、聚合、分组、表格和 source 行/组预算；可执行计划只接受 directory 为当前 requester + target 签发的精确 source binding，不能拿全量 catalog 自行拼装。source owner 在每次执行前重新授权，按登记 adapter 分页、投影 canonical fields，并对单源行数、字节、页数和超时 fail closed；统一 runtime 顺序执行最多 4 个 source，强制全局 10,000 行、10 MiB、40 页、12 秒、500 个表格行和 60 个图表分组，只返回 render DTO 与脱敏执行元数据，不返回原始业务行。导出策略仍只在后续导出链路生效。

模板 `source.parameters` 会按登记映射下推给 owner；页面动态 `filterValues` 则在 canonical rows 加载后由服务端过滤，不承诺减少源端扫描。同比/环比只使用本次参数范围已加载的数据，不会自动跨 source 补取历史，因此日期参数必须覆盖所需比较期。runtime 的 `onAudit` 目前只是可选、无业务 payload 的回调契约，尚未接入生产持久化 sink，也不含 template/revision 身份。

这套执行 foundation 目前还没有接入生产 template route、数据库保存 parser 或页面 consumer，因此 v3 模板仍不得保存/发布，现有页面继续只运行 v1/v2。开启 v3 时必须把保存校验、revision 读取、执行 route 和 DTO UI 同批接通，不能仅放开 schemaVersion。

存量 `workspace.api` v2 模板只通过 `workspace-analysis-v2-upgrader` 的纯诊断入口评估，不会自动写库。owner 必须在 server-only registration 上显式声明 `migration.workspaceApiV2.equivalence = directRows`、可迁移 canonical 字段和动态路径参数映射；调用方还必须提供已按 requester + target 授权的 resolver，证明旧 path、rowsPath、scope、query、字段和精确 source 版本唯一等价。任一映射项缺失或歧义、v3 编译失败、key 规范化碰撞时，只返回结构化 `needsMigration`，不产生半成品；仅执行上限发生变化时可成功但必须返回 `execution_policy_changed` 提示。成功结果只包含 `sourceKey + sourceVersion + parameters`，不保留 URL、rowsPath、query 或分页机械信息。

各独立 deploy unit 不依赖进程全局 Map 或路由导入副作用。Finance 显式组合本地 Finance provider 与 HR、Work、Inventory、Production、External、Administration、Capital Securities、Library 的 Ed25519 internal RPC；owner 从公钥注册表验签。签名绑定 caller、audience、keyId、一次性 requestId、时间、method/path/query 和 body digest，运行态 caller 必须等于部署器注入的 unit ID；8 个经营分析 owner 只接受 Finance。每个 receiver 用持久 replay ledger 原子消费 requestId。monolith 的共享 HMAC signer 只用于单进程开发/过渡，独立 unit receiver 永不接受它。当前共享 PM2 用户下的密钥文件只构成受信同机进程间的 provenance，不能抵御一个已被攻陷的 unit 读取其他私钥；这一剩余风险不阻断正式单元发布或依赖闭包完整的 Profile promotion，但不能被描述为进程级隔离，后续仍需独立 OS identity/容器与单钥挂载并显式轮换旧密钥。metadata discovery 只返回不含 adapter/path/rowsPath/pagination 的 source definition，execute 请求只携带 requester、可信目标空间、精确 source identity、静态参数、请求字段和剩余预算。每个 owner 在执行时再次确认 requester、目标空间和原业务权限/对象可见性，只返回请求的 canonical fields 及页数/字节数。所有内部 RPC 在 JSON 解析前默认限制为 `2 MiB`；catalog 显式为 `2 MiB`，execute 最多为本次行数据预算加 `64 KiB` 协议包络且行预算硬封顶 `10 MiB`。有效且超限的 `Content-Length` 可提前拒绝，缺失或失真的长度仍由逐 chunk 累加拦截，超限立即取消 reader。可选 provider 按支持的空间类型跳过并有界超时；不可用时保留其他 source 并给出明确 `unavailable`，已引用该 source 的执行则失败。重复 `sourceKey@version` 或 owner/definition 漂移都 fail closed，用户过滤结果不得做跨用户 catalog 缓存。

`finance.shipments@1` 继续只在个人空间强制本人销售归属；Finance 成本事实和没有部门/项目外键的主数据则明确标记为 `workspace`。`hr.employments@1` 在部门空间使用当前有效 EDP 绑定，在个人/项目空间只作为全公司 HR 数据展示。任何未来新增目标归集都必须由 owner 的真实字段/服务证明，不能由模板参数猜测。

## Relation Catalog

关系唯一事实源是 `packages/platform/module-registry.ts` 的 `relationRegistrations`。selector 关系声明 key、source、target、nullable 和 permission，并复用 `@workspace/platform/server/relation-targets`；governance 关系还必须声明 usage、semantics、physical、四个 lifecycle policy 和 adapterKey。运行时 planner 从包含 governance-only 声明的完整 Catalog 解析策略，adapter 返回的 policy 只作一致性断言；关系未声明、intent 未分类或二者漂移都会 fail closed。旧 `fk-registry.ts` / `fk-targets.ts` / `fk-registrations.ts` 只保留无逻辑兼容 re-export，不得新增实现。DMMF coverage 通过 `npm run relation-policy:check` 以稳定顺序报告 missing、stale、adapter capability 和数据库 `onDelete` 冲突；全仓默认 report-only，各模块在 `scripts/check/relation-policy-ratchet.json` 独立收紧。Work 试点除模块基线外，强制 `WorkPlan / WorkItem / Project` 的所有物理入向关系均已治理，新增未知入向关系会阻断 gate。

## Mutation Impact

变更影响协议是 `plan -> confirm -> transaction-local re-plan -> execute -> audit`。确认 token 绑定 actor、scope、root、intent、root revision、影响 fingerprint、策略 revision 和过期时间；业务 route 只能把 `impactToken + resolutions` 回传原 mutation service，不能提供通用 ignore，也不能绕到全局 execute endpoint。任何 blocker、过期/篡改 token、策略或对象版本变化都必须 fail closed。业务 adapter 只声明 relation inspect 和允许的 unlink/cascade/transition 操作；root commit、影响操作和成功的 `MutationImpactBatch` / `MutationImpactEffect` 写入必须处于同一 Serializable 业务事务，序列化冲突由统一 helper 使用带抖动的指数退避做有界重试，避免并发冲突形成同步重试风暴。block、首次待确认、stale-confirmation 和执行失败使用独立 attempt 事实写入，保证业务事务回滚后仍可观测；attempt 只保存必要的结果码和脱敏消息。

## History Policy Registry

新增或调整可审计实体时，先维护 `packages/platform/server/history-policy-registry.ts`，再在业务写路径调用 `snapshotHistory` / `ensureEditHistoryBaseline`。每个策略项至少要声明：

- `modelKey`：Prisma client delegate key，避免靠 entityType 字符串推断模型。
- `baseline`：是否在首次编辑前创建 V0 baseline。
- `displayName`：审计列表中的记录展示名。
- `fieldLabels`：实体级字段展示名；实体级优先，全局 `FIELD_LABELS` 只做兜底。
- `restore`：恢复能力必须显式声明；`trackHistory: true` 不代表允许恢复。恢复数据必须剥离快照里的审计字段，支持标准审计字段的实体用当前用户写 `editedBy` / `editedAt` 并递增 `version`，恢复动作本身也要在同一事务里追加新的 `EditHistory` 快照。
- `summarizeChanges`：有业务摘要需求时在策略里挂自定义摘要，页面不要重新手写 snapshot diff。

审计浏览和恢复必须同时校验业务域边界。当前 HR roster 审计入口只允许 `packages/hr/server/audit-entities.ts` 中声明的 HR 实体；如果未来为 Work、Finance 等域开放审计 UI/API，应在对应业务包声明自己的 entity allowlist，并把 read/restore 权限绑定到该域资源，而不是复用 HR route。

维护检查：

```bash
npm run check:history-policy
```

这个静态 contract 检查会失败于未注册的标准 `snapshotHistory` / `ensureEditHistoryBaseline` 字面量实体、未注册的 `entityType + modelKey` CRUD config、restore policy 未剥离 `id` 的配置，也会失败于绕过 `@workspace/platform/server/history` 直接写 `EditHistory` 的模块代码；它由 `check:contracts` 执行，不属于 ESLint。
