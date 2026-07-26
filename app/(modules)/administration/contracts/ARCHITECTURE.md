# Contracts 合同管理模块架构

## 路由入口

| 页面 | 路由 | 组件 |
|------|------|------|
| 合同管理 | `/administration/contracts` | `app/(modules)/administration/contracts/page.tsx` → `ContractsClient.tsx` |

## 页面结构

ContractsClient 渲染主列表 + 详情工作区，支持筛选、分页和块内新增/编辑：

| 组件 | 说明 |
|------|------|
| SelectorSurface | 左侧合同列表；主标题为合同名称，小字为签署对方 |
| ContractFilters | 筛选条件（公司、状态、日期等） |
| contract-form | 合同表单字段与分段声明 |
| ContractPagination | 分页组件 |

页面统一使用 Core `createMasterDetailBody`：左侧 `master` 是合同选择列表，右侧 `detail` 承载新增或编辑 block；桌面折叠状态、toolbar 折叠按钮和移动端列表到详情推进都由 PageSurface 持有。新增合同声明 block `CreateSurface`，由 PageSurface 派生 toolbar `+`；新增和编辑均按基本信息、签约主体、履行与归档、内容与备注分段展示。合同类型为必填下拉，文件位置与合同类型均使用列表接口返回的真实去重选项；状态固定为未盖章、执行中、已终止、已结束，旧“已失效”在表单中归入“已结束”。删除动作位于左侧合同项，编辑通过选择合同进入右侧 block。

## 核心组件链

```
page.tsx
  └─ ContractsClient.tsx
       ├─ ContractFilters.tsx      — 筛选栏
       ├─ SelectorSurface           — 名称 + 签署对方列表
       ├─ contract-form.ts          — 表单字段/分段声明
       ├─ createMasterDetailBody    — 主列表 + 详情工作区
       └─ ContractPagination.tsx    — 分页
```

## 数据流

1. **useContracts.ts** 提供加载/搜索/分页/CRUD hook
2. **ContractsClient** 消费 hook，渲染筛选 + 主列表 + 右侧新增/编辑 block
3. **API** `app/api/modules/administration/contracts/` 和 `app/api/modules/hr/roster/contracts/` 提供合同 CRUD

## API 规范

| 端点 | 说明 |
|------|------|
| `GET /api/modules/administration/contracts` | 合同列表（支持筛选、分页） |
| `GET /api/modules/administration/contracts/export` | 下载全部匹配合同 CSV（忽略分页） |
| `GET /api/modules/administration/contracts/reference-options` | 按姓名/工号搜索经办人员工，包含离职员工 |
| `POST /api/modules/administration/internal/library-source` | HMAC 内部接口，向 Library 提供当前合同台账 XLSX 快照 |
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

`Contract.handlerEmployeeId` 是经办人的唯一业务字段，通过 `ContractHandlerEmployee` 关系关联 `Employee.id`；页面和导出只展示关联员工姓名，不接受经办人自由文本。关系允许为空，员工离职后继续保留历史合同引用，删除仍被合同引用的员工会由数据库 `Restrict` 和 Relation Policy 阻断。

合同经办人选择器使用 Administration 自有的 relation key `administration.contracts.handler.employee` 和本模块 reference-options API，不借用 HR API 权限。候选项包含在职与离职员工并显示生命周期状态；写入时 domain validator 以 `lifecycleScope: all` 校验真实 Employee FK，因此历史合同可以继续关联离职员工。

写入接口统一由 Administration typed command 承载：route 只适配 Zod 输入和当前用户，package service 调用 domain validator 后写入。合同硬删通过 Platform `guardedDelete` 完成目标存在性、生命周期、乐观并发和删除前历史快照；当前模型没有入向业务引用，因此显式声明 `referencePolicy: "none"`。

## 生命周期标记

状态：`workspace-owned`。当前合同台账是行政/人事轻流程，不作为采购、销售、应收应付合同单据引擎使用。

Library 的 `contract-ledger` 权威来源复用本模块 `loadContractExportRecords + renderContractsCsv` 的同一导出口径，再由 Administration Adapter 封装 XLSX、固定资料身份、截止日和完整度证据。Library 不直接查询 `Contract`，避免列表、导出和资料快照出现三套字段与状态解释。
