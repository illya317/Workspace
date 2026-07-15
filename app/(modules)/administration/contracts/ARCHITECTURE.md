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

动作位置：新增合同声明 modal `CreateSurface`，由 PageSurface 派生 toolbar `+`；弹窗按基本信息、签约主体、履行与归档、内容与备注分段展示。合同类型为必填下拉，文件位置与合同类型均使用列表接口返回的真实去重选项；状态固定为未盖章、执行中、已终止、已结束，旧“已失效”在表单中归入“已结束”。已有合同的编辑/删除只出现在对应行的行级动作，编辑弹窗内提交统一使用保存动作。

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
| `GET /api/modules/administration/contracts/export` | 下载全部匹配合同 CSV（忽略分页） |
| `POST /api/modules/administration/contracts` | 创建合同 |
| `PATCH /api/modules/administration/contracts/[id]` | 更新合同 |
| `DELETE /api/modules/administration/contracts/[id]` | 删除合同；必须通过 `If-Match` 提交当前版本 |
| `GET /api/modules/hr/roster/contracts` | HR 模块内嵌合同列表 |

## 权限标准

- 页面入口：`requireRouteAccess("/administration/contracts")`
- GET：`administration.contracts.read`
- POST：`administration.contracts.create`
- PATCH：`administration.contracts.update`
- DELETE：`administration.contracts.delete`
- 导出：`administration.contracts.export`

API route 的资源和动作统一由 API contract 的 `resourceKey + requiredActions` 推导并在 gateway 执行，不再维护重复的 route-local guard。

当前 `Contract` 只通过 `editedBy` 关联操作账号，不含 Employee/Company 入向业务引用。

写入接口统一由 Administration typed command 承载：route 只适配 Zod 输入和当前用户，package service 调用 domain validator 后写入。合同硬删通过 Platform `guardedDelete` 完成目标存在性、生命周期、乐观并发和删除前历史快照；当前模型没有入向业务引用，因此显式声明 `referencePolicy: "none"`。

## 生命周期标记

状态：`workspace-owned`。当前合同台账是行政/人事轻流程，不作为采购、销售、应收应付合同单据引擎使用。
