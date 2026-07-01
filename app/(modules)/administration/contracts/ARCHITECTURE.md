# Contracts 合同管理模块架构

## 路由入口

| 页面 | 路由 | 组件 |
|------|------|------|
| 合同管理 | `/administration/contracts` | `app/(modules)/administration/contracts/page.tsx` → `ContractsClient.tsx` |

## 页面结构

ContractsClient 渲染合同列表，支持筛选、分页、弹窗编辑：

| 组件 | 说明 |
|------|------|
| ContractsTable | 合同表格展示 |
| ContractFilters | 筛选条件（公司、状态、日期等） |
| ContractModal | 新增/编辑合同弹窗 |
| ContractPagination | 分页组件 |

## 核心组件链

```
page.tsx
  └─ ContractsClient.tsx
       ├─ ContractFilters.tsx      — 筛选栏
       ├─ ContractsTable.tsx        — 表格
       │    └─ ContractModal.tsx    — 编辑弹窗
       └─ ContractPagination.tsx    — 分页
```

## 数据流

1. **useContracts.ts** 提供加载/搜索/分页/CRUD hook
2. **ContractsClient** 消费 hook，渲染筛选 + 表格 + 弹窗
3. **API** `app/api/modules/administration/contracts/` 和 `app/api/modules/hr/roster/contracts/` 提供合同 CRUD

## API 规范

| 端点 | 说明 |
|------|------|
| `GET /api/modules/administration/contracts` | 合同列表（支持筛选、分页） |
| `POST /api/modules/administration/contracts` | 创建合同 |
| `PATCH /api/modules/administration/contracts/[id]` | 更新合同 |
| `DELETE /api/modules/administration/contracts/[id]` | 删除合同 |
| `GET /api/modules/hr/roster/contracts` | HR 模块内嵌合同列表 |

## 权限标准

- 页面入口：`requireResourceAccess("administration.contracts")`
- GET：`administration.contracts.access`
- POST：`administration.contracts.create`
- PATCH：`administration.contracts.write`
- DELETE：`administration.contracts.delete`

合同数据关联 Employee 和 Company，通过 employeeId + companyId 外键关联。

## 生命周期标记

状态：`workspace-owned`。当前合同台账是行政/人事轻流程，不作为采购、销售、应收应付合同单据引擎使用。
