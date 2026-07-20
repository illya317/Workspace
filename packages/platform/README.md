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

Platform 可以读取业务包的注册信息，但不能直接 import 业务页面或业务 service。业务包需要认证和权限时依赖 `@workspace/platform/server/auth` 或 `@workspace/platform/server/with-auth`，需要 RBAC 常量或角色标准化时依赖 `@workspace/platform/permissions`，需要 API route 通用请求解析时依赖 `@workspace/platform/server/api`，需要 domain validator 结果契约时依赖 `@workspace/platform/server/domain-validation`，需要通用 CRUD helper 时依赖 `@workspace/platform/server/crud-factory` 并在本领域封装，需要自定义删除事务时依赖 `@workspace/platform/server/delete-guard`，需要数据库访问时依赖 `@workspace/platform/server/prisma`，需要审计快照时依赖 `@workspace/platform/server/history`，需要 FK 候选或校验时依赖 `@workspace/platform/server/relation-registry` / `@workspace/platform/server/reference-options`，需要 FK 快照显示名时依赖 `@workspace/platform/server/resolve-fk`；不要恢复 app-root `@/lib/auth` 聚合 hub、`lib/with-auth.ts`、`@/lib/crud*` 兼容入口，也不要直接依赖 app-root `@/lib/permissions`、`@/lib/prisma`、`@/lib/history`、`@/lib/resolve-fk` 或 generated Prisma client。

`guardedDelete` 直接调用时不声明 `deleteMode` 会默认禁删；`crud-factory` 为兼容存量字段级删除会显式沿用 hard delete 默认，新增 CRUD 配置应主动填写 `deleteMode`、`deleteReferences` 或 `onBeforeDeleteScope`。

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
