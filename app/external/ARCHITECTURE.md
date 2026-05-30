# 外部关系 — 架构文档

## 定位

管理客户、投资人、供应商等外部利益相关方信息。

## 目录

```text
app/external/
  page.tsx                 # L1 首页，ModuleHome 展示子模块卡片
  types.ts                 # 共享类型：Customer, Investor, Supplier
  ARCHITECTURE.md          # 本文件

app/external/customers/
  page.tsx                 # 服务端组件，AppShell + CustomersClient
  CustomersClient.tsx      # 客户列表、新增、搜索

app/external/investors/
  page.tsx                 # 服务端组件，AppShell + InvestorsClient
  InvestorsClient.tsx      # 投资人列表、新增、搜索

app/external/suppliers/
  page.tsx                 # 服务端组件，AppShell + SuppliersClient
  SuppliersClient.tsx      # 供应商列表、新增、搜索
```

## 数据模型（待建）

建议在 `prisma/models/` 新增 `external.prisma`：

```prisma
model Customer { ... }
model Investor { ... }
model Supplier { ... }
```

## 权限

当前无权限限制。后续可添加 `canAccessExternal` 细分。

## 状态

骨架已搭好，Client 组件预留了 state + toolbar 占位，待接 API/service。
