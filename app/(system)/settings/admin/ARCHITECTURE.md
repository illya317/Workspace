# Admin Route Shell

`app/(system)/settings/admin/` is a Next.js route shell only.

- `page.tsx` authenticates with `requireAdminManageAccess()`; root users and resource-level grant/configure managers may enter, while individual admin APIs and permission writes remain server-authorized.
- Public route: `/settings/admin`.
- UI implementation lives in `packages/platform/ui/admin/`.
- Agent 没有独立 L1 管理页面；root admin 在这里维护全局智能体动作上限。
- 数据质量工作台是 Platform 治理能力，不归属 HR 分析；领域通过签名内部 Provider 返回规则与异常，Platform 负责批次、去重、自动关闭和通知投递。
- Permission/auth logic lives in `packages/platform/server/auth` and `packages/platform/server/rbac`.
- Do not add `components/`, `hooks/`, `lib/`, or client UI implementation under this route.
