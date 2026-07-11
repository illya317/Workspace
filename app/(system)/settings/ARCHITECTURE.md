# Settings Route Shell

`app/(system)/settings` is a Next.js route shell for Platform settings.

## Ownership

| Concern | Location |
| --- | --- |
| Route auth and shell mount | `app/(system)/settings/**/page.tsx` |
| Settings UI | `packages/platform/ui/settings/*` |
| Platform auth | `packages/platform/server/auth` |
| Account preferences API | `app/api/settings/account/**` -> `packages/platform/server/account.ts` / `packages/platform/server/user-preferences.ts` |
| Core UI declaration registry display | `packages/core/ui/registry/component-registry.ts` and `packages/core/showcase/UiComponentsShowcase.tsx`（mounted at `/settings/ui`）|

## Rules

- Keep `app/(system)/settings/**/page.tsx` limited to authentication, authorization, and mounting Platform settings pages.
- Do not add route-local components, hooks, or helper files under `app/(system)/settings`.
- Settings screens, modals, and governance UI belong in `packages/platform/ui/settings`.
- `/settings/account` owns account profile fields, common departments, desktop portal slots, personal API access, and inbox layout. These preferences must persist through `app/api/settings/account/**` and Platform server helpers; UI candidates for portal L1/L2 slots must be filtered by the user's visible resources, and the API must normalize saved slots against the same visibility boundary.

## Permission Contract

| Resource | Action | UI placement / icon |
| --- | --- | --- |
| `settings.account` | `entry/read` | 登录用户默认可进入个人设置；个人资料、常用部门、桌面入口和 inbox 偏好只写当前 session 用户，不显示全局维护 action。 |
| `settings.account.apiAccess` | `revise` | 个人 API Key 的申请、重置和覆盖都用 `revise`；复制接入信息用 UI-only `copy`。 |
| `settings.admin` | `grant` | 权限矩阵和空间权限入口使用 action registry 的 `permission-organization`；空间授权仍由对应空间 scoped `grant` 最终验权。 |
| `settings.admin` | `configure` | 模块启停、系统配置和流程策略保存属于配置；恢复默认是 UI-only `reset`，不是 `delete`。 |
| `settings.admin.workflow*` | `configure` | 流程 root、分类和单流程授权；只控制流程设置/台账范围，不授予业务提交、审批或转授权。 |
| `settings.admin` | `audit` | 权限台账和流程台账只读审计数据，不提供写入按钮。 |
| `settings.api` | `read/export` | Open API 控制台读取和未来导出归 `settings.api`。 |
| `settings.api.manage` | `create/update/revise/grant` | 创建 Client 用 `add`；Client 元数据维护预留 `update`；轮换 secret 用 `revise`；保存 Scope 授权用 `permission-organization`。 |
| `settings.ui` | `entry/read` | Core UI 注册表浏览页面，没有服务端写接口。 |
