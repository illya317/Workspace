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
- 提供审计日志字段标签与值格式化工具
- 提供 `@workspace/platform/hooks` 的跨模块平台 hook，例如 `useCompanyOptions`
- 提供 `packages/platform/api-registry.ts` 作为 API Contract Registry，从 module registry 的 `apiGuards` 与 `apiRoutes` 派生 protected/public/dev/disabled API 契约
- 提供 `@workspace/platform/server/api` 作为 API route 通用请求解析与字段校验 helper；旧 `lib/schemas.ts` 已删除
- 提供 `@workspace/platform/server/domain-validation` 作为业务包 domain command/validator 的轻量结果契约；API schema 校验请求形状，domain validator 校验业务规则，service 只消费已验证 command
- 提供 module registry 与 API Contract Registry，供 `scripts/arch/domain-validation.ts` 推导业务 API root 并执行 domain validation ratchet；新增业务写入口必须走 `API schema -> domain command/validator -> service write/audit`
- 提供 `@workspace/platform/server/auth` 作为认证和平台权限检查契约；旧 `lib/auth.ts` 聚合 hub 已删除，低层 token 实现暂留 `lib/auth/token.ts`
- 提供 `@workspace/platform/permissions` 作为 RBAC 资源/角色常量与角色标准化 helper
- 提供 `@workspace/platform/server/with-auth` 作为 API route 认证包装器；旧 `lib/with-auth.ts` 已删除
- 提供 `@workspace/platform/server/crud-factory` 作为字段级 CRUD route helper 和 domain CRUD facade 契约；旧 `lib/crud*.ts` 兼容入口已删除
- 提供 `@workspace/platform/server/delete-guard` 作为删除最低规则契约；删除前必须证明 ID 合法、目标存在、状态允许、引用策略明确，并在同一事务中完成引用清理、审计快照和删除/归档/停用
- 提供 `@workspace/platform/server/prisma` 作为单库 Prisma runtime 契约；旧 `lib/prisma.ts` 已删除并由 Level 2 ratchet 禁止恢复
- 提供 `@workspace/platform/server/history` 作为 EditHistory 审计快照契约；历史策略统一声明在 `packages/platform/server/history-policy-registry.ts`
- 提供 `@workspace/platform/server/fk-registry` 和 `@workspace/platform/server/reference-options` 作为 FK 搜索、校验、权限、生命周期和引用候选契约；带对象可见性或额外参数的业务语义通过业务包 `server/fk-registry.ts` adapter 注入
- 提供 `@workspace/platform/server/resolve-fk` 作为 registry 驱动的 FK 快照显示名解析契约，展示解析优先使用 `entityType + field`，再用 `Any + field` 兜底，避免裸字段名跨实体误解析

Platform 可以读取业务包的注册信息，但不能直接 import 业务页面或业务 service。业务包需要认证和权限时依赖 `@workspace/platform/server/auth` 或 `@workspace/platform/server/with-auth`，需要 RBAC 常量或角色标准化时依赖 `@workspace/platform/permissions`，需要 API route 通用请求解析时依赖 `@workspace/platform/server/api`，需要 domain validator 结果契约时依赖 `@workspace/platform/server/domain-validation`，需要通用 CRUD helper 时依赖 `@workspace/platform/server/crud-factory` 并在本领域封装，需要自定义删除事务时依赖 `@workspace/platform/server/delete-guard`，需要数据库访问时依赖 `@workspace/platform/server/prisma`，需要审计快照时依赖 `@workspace/platform/server/history`，需要 FK 候选或校验时依赖 `@workspace/platform/server/fk-registry` / `@workspace/platform/server/reference-options`，需要 FK 快照显示名时依赖 `@workspace/platform/server/resolve-fk`；不要恢复 app-root `@/lib/auth` 聚合 hub、`lib/with-auth.ts`、`@/lib/crud*` 兼容入口，也不要直接依赖 app-root `@/lib/permissions`、`@/lib/prisma`、`@/lib/history`、`@/lib/resolve-fk` 或 generated Prisma client。

`guardedDelete` 直接调用时不声明 `deleteMode` 会默认禁删；`crud-factory` 为兼容存量字段级删除会显式沿用 hard delete 默认，新增 CRUD 配置应主动填写 `deleteMode`、`deleteReferences` 或 `onBeforeDeleteScope`。

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
npm run lint:history-policy
npx tsx scripts/check/check-history-policy-registry.ts
```

这个检查会失败于未注册的标准 `snapshotHistory` / `ensureEditHistoryBaseline` 字面量实体、未注册的 `entityType + modelKey` CRUD config、restore policy 未剥离 `id` 的配置，也会失败于绕过 `@workspace/platform/server/history` 直接写 `EditHistory` 的模块代码；`lint:changed` 会自动执行它。
