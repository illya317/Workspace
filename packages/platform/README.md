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
- 提供 `@workspace/platform/server/api` 作为 API route 通用请求解析与字段校验 helper；旧 `lib/schemas.ts` 的 `parseJson` 只保留兼容 re-export
- 提供 `@workspace/platform/server/auth` 作为认证和平台权限检查契约；旧 `lib/auth.ts` 聚合 hub 已删除，低层 token 实现暂留 `lib/auth/token.ts`
- 提供 `@workspace/platform/server/crud-factory` 作为字段级 CRUD route helper 和 domain CRUD facade 契约；旧 `lib/crud-factory.ts` 只保留兼容 re-export
- 提供 `@workspace/platform/server/prisma` 作为单库 Prisma runtime 契约；旧 `lib/prisma.ts` 只保留兼容 re-export
- 提供 `@workspace/platform/server/history` 作为 EditHistory 审计快照契约；旧 `lib/history.ts` 只保留兼容 re-export
- 提供 `@workspace/platform/server/resolve-fk` 作为 FK 快照显示名解析契约；旧 `lib/resolve-fk.ts` 只保留兼容 re-export

Platform 可以读取业务包的注册信息，但不能直接 import 业务页面或业务 service。业务包需要认证和权限时依赖 `@workspace/platform/server/auth`，需要 API route 通用请求解析时依赖 `@workspace/platform/server/api`，需要通用 CRUD helper 时依赖 `@workspace/platform/server/crud-factory` 并在本领域封装，需要数据库访问时依赖 `@workspace/platform/server/prisma`，需要审计快照时依赖 `@workspace/platform/server/history`，需要 FK 快照显示名时依赖 `@workspace/platform/server/resolve-fk`；不要恢复 app-root `@/lib/auth` 聚合 hub，也不要直接依赖 app-root `@/lib/crud`、`@/lib/prisma`、`@/lib/history`、`@/lib/resolve-fk` 或 generated Prisma client。
