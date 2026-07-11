# 外部关系 — 架构文档

## 定位

管理客户、供应商等外部利益相关方信息；投资人关系已迁入资本证券。

## 目录

```text
app/(modules)/external/
  page.tsx                 # L1 首页，ModuleHome 展示子模块卡片
  ARCHITECTURE.md          # 本文件

app/(modules)/external/customers/
  page.tsx                 # 服务端组件，AppShell + CustomersClient

app/(modules)/external/suppliers/
  page.tsx                 # 服务端组件，AppShell + SuppliersClient

packages/external/
  module.ts                # 从 Platform module registry 读取外部关系 moduleDefinition
  types/index.ts           # 共享类型：Customer, Supplier
  ui/*                     # 客户、供应商占位页面 UI
```

## 数据模型（待建）

建议在 `prisma/models/` 新增 `external.prisma`：

```prisma
model Customer { ... }
model Supplier { ... }
```

## 权限

| 资源 | 状态 | 支持 action | 说明 |
|---|---|---|---|
| `external` | container | `entry`, `read`, `grant` | 外部关系 L1 入口 |
| `external.customers` | planned | `entry`, `read`, `grant` | 客户管理占位页 |
| `external.suppliers` | planned | `entry`, `read`, `grant` | 供应商管理占位页 |

页面入口使用 registry route guard：

- `/external`：`requireRouteAccess("/external")`
- `/external/customers`：`requireRouteAccess("/external/customers")`
- `/external/suppliers`：`requireRouteAccess("/external/suppliers")`

当前没有客户/供应商业务 API、记录写入、导入导出或流程动作，因此不开放 `create` / `update` / `delete` / `import` / `export` 等业务 action。后续接入 CRM、合同或供应商资料台账时，再按真实 API 和按钮位置补 resource action；新增记录入口应放在对应列表/分组工具栏，单条编辑入口应贴近具体客户/供应商记录。

当前前端只展示空状态，不渲染 toolbar command 或权限动作图标；不要在业务 API 和记录模型落地前预留新建、编辑、删除或导出按钮。

## 状态

骨架已搭好，当前仅为空状态页面；暂无业务 API、写入动作或工具栏操作。

## 生命周期标记

客户和供应商为 `workspace-analysis`。外部事实来源仍可来自 CRM、合同台账、用友或人工导入，Workspace 负责跟进记录、评级、资料归档和分析。
