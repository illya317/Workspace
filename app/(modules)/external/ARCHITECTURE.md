# 外部关系 — 架构文档

## 定位

外部关系维护客户和供应商主数据。客户/供应商是往来角色，单位/个人是主体类型：自然人客户在客户表维护，自然人供应商在供应商表维护，不建立独立个人往来入口。两个角色复用同一个 `ExternalParty` 事实表和写入规则，但通过固定页面、API 前缀和 RBAC 资源保持权限独立。投资人关系仍归资本证券。

## 路由与包边界

```text
app/(modules)/external/
  customers/             # 客户主数据页面壳
  suppliers/             # 供应商主数据页面壳

app/api/modules/external/
  customers/             # GET / POST / PATCH / DELETE
  suppliers/             # GET / POST / PATCH / DELETE

packages/external/
  ui/ExternalPartyClient.tsx     # 客户/供应商共享的列表与录入交互
  server/external-parties.ts     # 查询、版本、审计与落库
  server/domain/*                # 业务字段与命令校验
  types/*                        # DTO 与 category 契约
```

页面和 API route 只承担鉴权、请求形状和挂载；真实 UI、domain validator 与 Prisma 写入均在 `packages/external`。

## 数据模型

`ExternalParty` 是人工录入的外部往来主体事实表：

- `category` 固定为 `customer` 或 `supplier`，由 route 注入，客户端不能改变。
- `subjectType` 固定为 `organization` 或 `individual`，表单展示为“单位 / 个人”。
- `relatedPartyType` 是财务披露口径的关系性质，默认 `unrelated`；它与客户/供应商角色、单位/个人主体类型、可配置业务分类相互独立。
- `code + category` 唯一；客户和供应商可使用相同编码而互不冲突。
- 单位和个人共用名称、分类、联系、地址、银行、结算、信用和启停字段。
- 单位展示简称、全称、统一社会信用代码、法定代表人、税率和开票信息；个人展示姓名和证件号码。
- `version / editedBy / editedAt` 用于并发保护和编辑历史；更新和删除都要求 `If-Match` 版本。

## 写入链路

```text
CreateSurface / 编辑弹窗
  -> route Zod schema
  -> external-party domain command
  -> direct BusinessAction adapter
  -> service transaction / Prisma / EditHistory
```

新增和更新在 service 中显式检查同类别编码重复。更新保存前建立历史基线并在成功后写快照；删除走 `guardedDelete`，验证类别、版本、记录存在性和审计策略。

## 权限

| 资源 | action | 页面/API 含义 |
|---|---|---|
| `external.customers` | `entry/read/create/update/delete` | 客户列表与客户主数据 CRUD |
| `external.suppliers` | `entry/read/create/update/delete` | 供应商列表与供应商主数据 CRUD |

页面按钮按对应 resource action 显示，API 再由 module registry contract 和 guard 校验。两个资源不共享写权限。

## UI 约定

两个页面均使用 Core `PageSurface` 和标准 split `BodySurface`：左侧 `SelectorSurface` 是往来目录，右侧复用同一组表单 section 直接展示和编辑所选记录，移动端由 Core 切换为抽屉。新增继续使用 Toolbar 触发的 Modal `CreateSurface`。主体类型、关系性质和状态使用标准下拉；业务分类保留为可配置文本，不与关联方判断混用。

关系性质按《企业会计准则第 36 号——关联方披露》收敛为：非关联方、集团内、合营/联营、控制或重大影响投资方、关键管理人员关联方、其他关联方。大客户、核心供应商、渠道、地区等经营分组只进入 `classification`，不得据此自动判断关联方。详细持股/控制链仍归资本证券，External 只保存 Finance 分析所需的关系口径。
