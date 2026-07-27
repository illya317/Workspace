# Admin Route Shell

`app/(system)/settings/admin/` is a Next.js route shell only.

- `page.tsx` authenticates with `requireAdminManageAccess()`; root users and resource-level grant/configure managers may enter, while individual admin APIs and permission writes remain server-authorized.
- Public route: `/settings/admin`.
- UI implementation lives in `packages/platform/ui/admin/`.
- Agent 没有独立 L1 管理页面；root admin 在这里维护全局智能体动作上限。
- 管理后台不承载通知生产、发送或订阅配置；通知类型、自动触发和实际发送渠道必须作为同一个 Platform contract 对外呈现。
- 个人通知订阅位于 `/settings/account?tab=subscriptions`；只有存在运行中的生产者和真实渠道时才能订阅，投递前仍按通知 `resourceKey` 复核接收人的 `read` 权限。
- Permission/auth logic lives in `packages/platform/server/auth` and `packages/platform/server/rbac`.
- Do not add `components/`, `hooks/`, `lib/`, or client UI implementation under this route.
