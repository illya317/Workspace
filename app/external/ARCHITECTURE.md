# 外部关系 — 架构文档

## 定位

管理客户、投资人、供应商等外部利益相关方信息。

## 目录

```text
app/external/
  page.tsx                 # L1 首页，ModuleHome 展示子模块卡片
  ARCHITECTURE.md          # 本文件

app/external/customers/
  page.tsx                 # 服务端组件，AppShell + CustomersClient

app/external/investors/
  page.tsx                 # 服务端组件，AppShell + InvestorsClient

app/external/suppliers/
  page.tsx                 # 服务端组件，AppShell + SuppliersClient

packages/external/
  module.ts                # 从 Platform module registry 读取外部关系 moduleDefinition
  types/index.ts           # 共享类型：Customer, Investor, Supplier
  ui/*                     # 客户、投资人、供应商占位页面 UI
```

## 数据模型（待建）

建议在 `prisma/models/` 新增 `external.prisma`：

```prisma
model Customer { ... }
model Investor { ... }
model Supplier { ... }
```

## 权限

- `/external`：`requireResourceAccess("external")`
- `/external/investors`：`requireResourceAccess("external.investor")`
- `/external/customers`：`requireResourceAccess("external.customer")`
- `/external/suppliers`：`requireResourceAccess("external.supplier")`

## 状态

骨架已搭好，Client 组件预留了 state + toolbar 占位，待接 API/service。

## 生命周期标记

投资人关系为 `workspace-owned`；客户和供应商为 `workspace-analysis`。外部事实来源仍可来自 CRM、合同台账、用友或人工导入，Workspace 负责跟进记录、评级、资料归档和分析。
