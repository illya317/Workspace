# Admin Route Shell

`app/(modules)/settings/admin/` is a Next.js route shell only.

- `page.tsx` authenticates with `requireAdminManageAccess()`; root users and resource-level grant/configure managers may enter, while individual admin APIs and permission writes remain server-authorized.
- Public route: `/settings/admin`.
- UI implementation lives in `packages/settings/ui/admin/`.
- Agent 的 `/agent` L1 面向会话；root admin 在这里维护全局智能体动作上限。
- root admin 在“编码管理” tab 通过统一的条件分支、组成部分和独立流水作用域维护模板；系统 baseline 只读可复制，每条分支显示完整示例。编码对象由后端只读登记，在模板详情顶部的“关联编码对象”卡片区新增关系或换绑兼容模板。业务字段值仍归各业务主数据，页面只调用 Settings system-config，规则解析、Adapter 和原子流水位于 Platform。
- root admin 在“数据关系” tab 只读查看当前 PostgreSQL Schema 的数据表、字段和 FK；该页面不提供业务数据浏览、DDL 或字段修改能力。
- 管理后台不承载通知生产、发送或订阅配置；通知类型、自动触发和实际发送渠道必须作为同一个 Platform contract 对外呈现。
- 个人通知订阅位于 `/settings/account?tab=subscriptions`；只有存在运行中的生产者和真实渠道时才能订阅，投递前仍按通知 `resourceKey` 复核接收人的 `read` 权限。
- Permission/auth logic lives in `packages/platform/server/auth` and `packages/platform/server/rbac`.
- Do not add `components/`, `hooks/`, `lib/`, or client UI implementation under this route.
