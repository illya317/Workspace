# 资本证券 — 架构文档

## Scope

资本证券承载投资人关系、治理架构与资本事务入口。v1 不建独立组织表，治理架构继续使用 `Department.hierarchyKind = "G"` 作为组织单元事实源。

## Route Shell

```text
app/(modules)/capital-securities/
├── page.tsx
├── investors/
└── governance/
```

页面 shell 只做路由鉴权、AppShell 挂载与模块 UI 引入；业务 UI 位于 `packages/capital-securities/ui`。

## Server Boundary

- 治理架构 API：`/api/modules/capitalSecurities/governance/organizations`
- 组织单元服务：`@workspace/platform/server/organization-units`
- 组织单元写入：`Department`、`DepartmentManagerEmployee`、`EditHistory`
- 岗位、岗位说明书、员工任职仍由 HR 维护，治理架构只读取岗位摘要。

## Permissions

- L1：`capitalSecurities`
- 投资人关系：`capitalSecurities.investors`
- 治理架构：`capitalSecurities.governance`
- 治理架构 API：`read` 可读，`create` 可新建 G 组织，`update` 可编辑 G 组织基础信息。
- 投资人关系当前是 planned/page-only 入口，只开放 `entry/read/grant`，暂无独立业务 API。

前端动作位置和图标约定：

- `capitalSecurities.governance.create`：左侧 G 线组织树 command，使用 `add` 图标，创建当前选中组织的下级或顶层 G 组织。
- `capitalSecurities.governance.update`：右侧组织详情面板保存按钮，使用 `save` 图标；岗位摘要只读，跳转 HR 维护岗位。
- `capitalSecurities.investors`：当前仅为空状态页面，不渲染新建、编辑、删除或导出图标。

## Notes

治理架构负责 G 线组织维护；HR 组织架构对 G 组织只读，但 HR 部门岗位模式仍可维护 G 组织下岗位、岗位说明书和任职关系。
