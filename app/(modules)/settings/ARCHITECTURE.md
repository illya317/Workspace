# Settings Route Shell

`app/(modules)/settings` is the Next.js route shell for the Settings L1.

## Ownership

| Concern | Location |
| --- | --- |
| Route auth and shell mount | `app/(modules)/settings/**/page.tsx` |
| Settings UI | `packages/settings/ui/settings/*` |
| Platform auth | `packages/platform/server/auth` |
| Account preferences API | `app/api/settings/account/**` -> `packages/platform/server/account.ts` / `packages/platform/server/user-preferences.ts` |
| Notification catalog and personal subscriptions | `packages/platform/server/notifications.ts` + `packages/platform/server/notification-subscriptions.ts`; canonical APIs under `app/api/modules/settings/account/**` |
| Configurable notification definitions, immutable definition lifecycle, channel health and publication facts | `packages/platform/server/notification-publishing.ts` + `packages/platform/server/notification-definition-storage.ts` + `packages/platform/server/notification-publishing-audit-storage.ts` + `packages/platform/server/notification-definition-dsl.ts` + `packages/platform/server/notification-delivery-outbox.ts`; personal APIs under `app/api/modules/settings/notifications/**`, external APIs under `app/api/open/v1/notifications/**` |
| Platform governance | `packages/settings/ui/governance/*`; Core UI declarations come from `packages/core/ui/registry/component-registry.ts` and `packages/core/showcase/UiComponentsShowcase.tsx` |

## Rules

- Keep `app/(modules)/settings/**/page.tsx` limited to authentication, authorization, and mounting `@workspace/settings` pages.
- Do not add route-local components, hooks, or helper files under `app/(modules)/settings`.
- Settings screens and modals belong in `packages/settings/ui/settings`; platform-governance composition belongs in `packages/settings/ui/governance`.
- `/settings/account?tab=subscriptions` must show every registered notification's trigger, recipient rule and delivery mode. Assignment/workflow/governance notifications are mandatory; optional subscriptions are opened by the target event resource's effective `read` permission and rechecked again at delivery time.
- `/settings/api` uses same-page tabs for the capability catalog, Client management, managed WeCom groups, notification definitions, and call logs. Tab changes stay in client state plus the History API; `/settings/api/hr-generated` and `/settings/api/notifications` are retired rather than compatibility pages. The WeCom-group and notification-definition tabs are gated by `settings.notifications`; route adapters may authenticate and translate input, but template compilation, audience resolution, source grants, idempotency and projection writes remain inside the notification-publishing module.
- Managed WeCom groups are discovered only from the Bot runtime, then claimed, named and verified in the “企业微信群” tab. The UI and Agent contracts expose stable `groupKey` / `policyId` only and never accept or return raw `chatId`, provider conversation references or webhook URLs. Unclaimed, unverified or suspended groups and disabled policies remain fail-closed; weekly-report bindings use the fixed `work.weekly-report` adapter.
- Configurable notifications are bounded plain-text messages. General publishing APIs accept only a published `custom.*` definition, bounded usernames, exact flat variables and `Idempotency-Key`; they never execute HTML/scripts, accept external URLs, choose provider addresses, or acquire approval/reject semantics.
- A notification definition key is immutable after creation. Create, draft save, publish and archive append a secret-free `NotificationDefinitionLifecycleEvent` in the same transaction as the head transition; only callers with `settings.notifications.audit` receive the recent lifecycle ledger.
- Project notification rules live in Work. Settings only opts a definition into project supervision with `allowProjectMonitoring` and shows global channel health/delivery audit. Work resolves project facts and RASCI recipients, while Platform owns the Workspace projection and durable WeCom outbox.
- The managed WeCom channel sends only to a bound user private chat through the existing Assistant Bot sidecar. Bot credentials and `WECOM_WORKER_BRIDGE_SECRET` stay in private runtime configuration; no Settings response or UI may expose them.
- Personal subscription writes use `settings.account.read`, are restricted to the authenticated user, and are registered as business actions so Agent proposals use the same API and domain validator as the UI.
- `/settings/account` owns account profile fields, common departments, personalized desktop cards, personal API access, and inbox layout. The default desktop shows at most twelve accessible L1 entries. The personalized desktop shows only its twelve selected card positions; both mobile（4 columns × 3 rows）and desktop（3 columns × 4 rows）share this limit. Card selection advances from L1 to either that module home or one of its L2 entries. Mobile bottom navigation always has three fixed entries（桌面、消息、我的）and two independent user shortcut positions; the “快捷” marker only explains these two configurable positions in settings and must not appear on actual desktop cards. These preferences must persist through `app/api/settings/account/**` and Platform server helpers; UI candidates must be filtered by the user's visible resources, and the API must normalize saved positions against the same visibility boundary while migrating the previous 9+2 shape without mixing shortcuts into cards.

## Permission Contract

| Resource | Action | UI placement / icon |
| --- | --- | --- |
| `settings.account` | `entry/read` | 登录用户默认可进入个人设置；个人资料、常用部门、桌面入口、inbox 偏好和通知订阅只写当前 session 用户。订阅开启还要校验目标通知资源的 `read`。 |
| `settings.account.apiAccess` | `entry/read/revise` | `entry` 控制个人 API Key 登录及 `x-api-key` 调用；`read` 控制查看接入状态；申请、重置和覆盖都用 `revise`；复制接入信息用 UI-only `copy`。登录 route 在 session 建立前公开可达，但凭证通过后仍必须校验 `entry`。 |
| `settings.admin` | `grant` | 权限矩阵和空间权限入口使用 action registry 的 `permission-organization`；空间授权仍由对应空间 scoped `grant` 最终验权。 |
| `settings.admin` | `configure` | 系统配置和流程策略保存属于配置；恢复默认是 UI-only `reset`，不是 `delete`。 |
| `settings.admin.workflow*` | `configure` | 流程 root、分类和单流程授权；只控制流程设置/台账范围，不授予业务提交、审批或转授权。 |
| `settings.admin` | `audit` | 权限台账和流程台账只读审计数据，不提供写入按钮。 |
| `settings.api` | `read/export` | Open API 控制台读取和未来导出归 `settings.api`。 |
| `settings.api.manage` | `create/update/revise/grant` | 创建 Client 用 `add`；Client 元数据维护预留 `update`；轮换 secret 用 `revise`；保存 Scope 授权用 `permission-organization`。 |
| `settings.notifications` | `read/configure/create/apiUse/audit` | `read` 查看已发布定义；`configure` 管理草稿、发布和归档；个人 API 发布同时要求 `create` 与 `apiUse`；`audit` 查看发布与投递事实。全部 action 都是 explicit-only。 |
| `settings.governance` | `entry/read` | 平台治理入口，以及 UI 声明、数据关系和模块分析读取。 |
| `settings.governance` | `configure` | 模块运行启停；数据库结构读取与模块启停当前仍额外限制为 root。 |
| `settings.governance` | `audit` | 运维记录读取；首版只建立空态，后续日志源必须通过受控 API 接入。 |
