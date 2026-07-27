# Admin Route Shell

`app/(system)/settings/admin/` is a Next.js route shell only.

- `page.tsx` authenticates with `requireAdminManageAccess()`; root users and resource-level grant/configure managers may enter, while individual admin APIs and permission writes remain server-authorized.
- Public route: `/settings/admin`.
- UI implementation lives in `packages/platform/ui/admin/`.
- Agent 没有独立 L1 管理页面；root admin 在这里维护全局智能体动作上限。
- 用户界面称为“提醒规则与运行”；内部 `data-quality` 标识仍是 Platform 的兼容实现名。该能力不归属 HR 分析；领域通过签名内部 Provider 返回规则与异常，Platform 负责批次、去重、自动关闭和通知投递。
- 管理端只配置生产者实际声明的 L2 分流范围；个人订阅独立位于 `/settings/account?tab=subscriptions`，投递前仍按异常的 `resourceKey` 复核接收人的 `read` 权限。
- Permission/auth logic lives in `packages/platform/server/auth` and `packages/platform/server/rbac`.
- Do not add `components/`, `hooks/`, `lib/`, or client UI implementation under this route.
