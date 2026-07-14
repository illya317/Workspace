# 外部关系 — 架构文档

## 定位

外部关系维护客户和供应商主数据。客户/供应商是往来角色，单位/个人是主体类型：自然人客户在客户入口维护，自然人供应商在供应商入口维护，不建立独立个人往来入口。法定主体只保存一份，客户和供应商角色通过固定页面、API 前缀和 RBAC 资源保持操作权限独立。投资人关系仍归资本证券。

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
  server/external-parties.ts     # BusinessAction adapter 与公开写入口
  server/external-party-service.ts # 角色投影、版本、审计与落库
  server/domain/*                # 业务字段与命令校验
  types/*                        # DTO 与 category 契约
```

页面和 API route 只承担鉴权、请求形状和挂载；真实 UI、domain validator 与 Prisma 写入均在 `packages/external`。

## 数据模型

`ExternalParty` 与 `ExternalPartyRole` 共同构成外部往来主体聚合：

- `ExternalParty` 只保存主体类型、关系性质、名称、证件号码和法定代表人等跨角色公共身份资料。
- `ExternalPartyRole.category` 固定为 `customer` 或 `supplier`，由 route 注入，客户端不能改变；同一主体可以同时拥有两个角色，但同一角色只能有一条。
- `subjectType` 固定为 `organization` 或 `individual`，表单展示为“单位 / 个人”。
- `relatedPartyType` 是财务披露口径的关系性质，默认 `unrelated`；它与客户/供应商角色、单位/个人主体类型、可配置业务分类相互独立。
- `code + category` 在角色表唯一；客户和供应商可使用相同编码而互不冲突。这里的编码是 T1 全局角色编码，来源 ERP 的公司内编码必须进入后续公司/来源映射，不能直接占用该唯一键。
- 分类、联系、地址、银行、开票、结算、信用和启停字段属于角色资料，避免同一主体作为客户与供应商时相互覆盖。
- 单位展示简称、全称、统一社会信用代码、法定代表人、税率和开票信息；个人展示姓名和证件号码。
- 两个 L2 返回相同的主体 `id`，并按当前角色扁平投影角色字段；`roles` 只说明当前用户有权读取的角色，不能借一个 L2 泄露另一个 L2 的业务关系。
- 非空证件号码统一去除首尾空白并转大写，以 `subjectType + identityNumber` 做数据库唯一键；历史重复数据必须人工复核，迁移不会静默合并。
- 主体聚合使用统一的 `version / editedBy / editedAt` 做并发保护和编辑历史；更新和删除都要求 `If-Match` 版本，历史快照包含全部角色。

## 写入链路

```text
右侧 CreateSurface / detail 编辑区
  -> route Zod schema
  -> external-party domain command
  -> direct BusinessAction adapter
  -> service transaction / Prisma / EditHistory
```

新增和更新在 service 中显式检查同角色编码重复。创建时可以通过明确的主体 ID，或唯一且非空的证件号码，给已有主体增加第二角色；名称不作为静默自动合并依据。更新保存前建立聚合历史基线并在成功后写包含全部角色的快照。删除页面记录的语义是移除当前角色：存在另一角色时保留主体并递增聚合版本，移除最后一个角色时才硬删主体。

## 权限

| 资源 | action | 页面/API 含义 |
|---|---|---|
| `external.customers` | `entry/read/create/update/delete` | 客户列表与客户主数据 CRUD |
| `external.suppliers` | `entry/read/create/update/delete` | 供应商列表与供应商主数据 CRUD |

页面按钮按对应 resource action 显示，API 再由 module registry contract 和 guard 校验。两个资源的角色写权限互不共享；角色列表和 `roles` 元数据按 read 权限过滤。公共主体字段属于同一聚合，从任一入口修改都会同步反映到另一角色页面，因此双角色主体只有在用户同时具备客户和供应商 update 权限时才允许修改公共字段；当前角色自己的分类、联系、结算等资料仍只要求当前 L2 update 权限。

## UI 约定

两个页面均使用 Core `PageSurface` 和标准 split `BodySurface`：左侧 `SelectorSurface` 是往来目录，右侧复用同一组表单 section 直接展示和编辑所选记录，移动端由 Core 切换为抽屉。新增与 HR 岗位/部门一致，由 Toolbar 触发右侧 block `CreateSurface` 并暂时替换当前详情，取消或保存后恢复详情。用户有另一 L2 read 权限时，新增表单提供可搜索的“关联已有主体”，选择后锁定公共身份字段，只补录当前角色字段。主体类型、关系性质和状态使用标准下拉；业务分类保留为可配置文本，不与关联方判断混用。

关系性质按《企业会计准则第 36 号——关联方披露》收敛为：非关联方、集团内、合营/联营、控制或重大影响投资方、关键管理人员关联方、其他关联方。大客户、核心供应商、渠道、地区等经营分组只进入 `classification`，不得据此自动判断关联方。详细持股/控制链仍归资本证券，External 只保存 Finance 分析所需的关系口径。
