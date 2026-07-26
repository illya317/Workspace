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

## 工作空间轻代码读取模型

External owner 登记 `external.customers`、`external.suppliers` 及对应的 `external.customer-roles`、`external.supplier-roles` 子读模型，完整沿用客户、供应商 GET 的公开稳定标量 DTO，并把公开 `roles` 数组规范化为一主体一角色关系行。每次发现和执行仍重验对应的 `external.customers.read` 或 `external.suppliers.read`；角色子源先由原列表服务按当前账号权限过滤主体与角色，不建立第二套可见范围。轻代码不再叠加“可分析字段”权限；字段敏感级只是元数据，导出策略只约束独立导出链路。

客户和供应商主数据没有可信的个人、部门或项目归属外键，因此三类空间中的 source 都明确为 `workspace`：它表示当前账号在原业务页面可见的全公司主数据，不能被页面或 Agent 描述成目标部门/项目自己的往来数据。写入、凭证、搜索候选和下拉片段不是独立分析事实。

## 数据模型

`Party`、`ExternalPartyProfile` 与 `ExternalPartyRole` 共同构成外部往来角色聚合：

- `Party` 是 Platform 提供的中立法定身份事实源，只保存主体类型、名称、证件号码和法定代表人等跨业务公共资料；External 通过 Party Directory Interface 使用它，不拥有第二份主体表。
- `ExternalPartyProfile` 一对一保存 External 专属的 `relatedPartyType`；该字段不进入 Company 或 OwnershipInterest。
- `ExternalPartyRole.category` 固定为 `customer` 或 `supplier`，由 route 注入，客户端不能改变；同一主体可以同时拥有两个角色，但同一角色只能有一条。
- `subjectType` 固定为 `organization` 或 `individual`，表单展示为“单位 / 个人”。
- `relatedPartyType` 是财务披露口径的关系性质，默认 `unrelated`；它与客户/供应商角色、单位/个人主体类型、可配置业务分类相互独立。
- `code + category` 在角色表唯一；客户和供应商可使用相同编码而互不冲突。这里的编码是 T1 全局角色编码，来源 ERP 的公司内编码必须进入后续公司/来源映射，不能直接占用该唯一键。
- 分类、联系、地址、银行、开票、结算、信用和启停字段属于角色资料，避免同一主体作为客户与供应商时相互覆盖。
- 单位展示简称、全称、统一代码、法定代表人、税率和开票信息；个人展示姓名和证件号码。统一代码或个人证件号码是主体必填身份字段。
- 两个 L2 返回相同的主体 `id`，并按当前角色扁平投影角色字段；`roles` 只说明当前用户有权读取的角色，不能借一个 L2 泄露另一个 L2 的业务关系。
- 身份字段统一去除首尾空白并转大写，以 `subjectType + identityNumber` 做数据库唯一键；历史缺失或重复数据必须人工复核，迁移不会静默补值或合并。
- 页面人工新建仍要求统一代码或个人证件号。缺少法定身份的历史档案使用带 `TEMP-` 前缀的全局唯一临时身份编码，明确表示待补正式代码；不能把来源业务编码原值冒充法定身份。
- `ExternalPartySourceMapping` 保存角色在具体公司和来源系统中的稳定键、源编码、源名称、文件/Sheet/行号及原始字段。公司内 ERP 编码只进入该映射，角色的全局编码使用命名空间编码。
- 名称默认只用于来源映射。客户与供应商两份受治理档案中，正式全称完全一致、两侧各自唯一时，可先合并为一个临时身份主体并挂双角色；简称相同、正式全称不同或任一侧多候选时保持分开，等待正式身份复核。
- Party 使用统一的 `version / editedBy / editedAt` 做并发保护和独立身份历史；更新和删除都要求 `If-Match` 版本。删除最后一个客户/供应商角色只删除 External role/profile，不删除 Party；Party 被 Company 或 OwnershipInterest 复用时，法定身份修改还需要 `party.identity.update`。

## 历史 ERP 主数据导入

`scripts/import/import-external-party-master.mjs` 是客户/供应商档案进入 External 的唯一维护入口。脚本默认 dry-run，只有 `--execute` 才写库；必须显式提供公司编码和两份源文件路径。导入按 `companyId + sourceSystem + sourceKey` 幂等更新，不依赖本机固定目录。

```bash
node --import tsx scripts/import/import-external-party-master.mjs \
  --company-code=04 \
  --customer-file=/path/to/客户档案.XLS \
  --supplier-file=/path/to/供应商档案.XLS
```

dry-run 输出实际数据库名、两份源文件 SHA-256、发货行数和当前主数据基线。写入模式必须把这些值原样作为 `--expected-database`、`--customer-sha256`、`--supplier-sha256`、`--expected-shipment-rows`、`--expected-customer-roles`、`--expected-supplier-roles` 和 `--expected-source-mappings` 传回；任一项漂移即停止。首次向空的生产 External 导入时再加 `--require-empty-master`，作为第二重空库保护。

生产执行顺序固定为：先通过正式发布入口部署代码和 maintenance migrations，确认新版本健康；再把两份源文件放到 release 目录之外的受控私有路径，从当前 release 先运行上述 dry-run，复核输出后才运行：

```bash
node --import tsx scripts/import/import-external-party-master.mjs \
  --company-code=04 \
  --customer-file=/private/import/客户档案.XLS \
  --supplier-file=/private/import/供应商档案.XLS \
  --expected-database=<dry-run-database> \
  --expected-shipment-rows=<dry-run-shipmentRows> \
  --expected-customer-roles=<dry-run-customerRoles> \
  --expected-supplier-roles=<dry-run-supplierRoles> \
  --expected-source-mappings=<dry-run-sourceMappings> \
  --customer-sha256=<dry-run-customerSha256> \
  --supplier-sha256=<dry-run-supplierSha256> \
  --require-empty-master \
  --execute
```

standalone 发布产物显式携带该导入器、Excel 解析依赖和 Prisma 运行依赖。源 XLS 不进入 Git、standalone 或租户配置；生产数据导入属于部署后的单独受控写入，不与应用切换混成一次不可辨认的动作。

客户、供应商档案各自建角色，源表所有暂未建模字段保存在映射的 `sourceData` 中。单角色临时身份编码分别使用 `TEMP-CUS-<公司>-<源编码>`、`TEMP-SUP-<公司>-<源编码>`；正式全称一对一相同的双角色主体使用 `TEMP-EXT-<公司>-<稳定哈希>`。发货客户先按客户正式名称/简称唯一精确匹配，档案缺失的名称建立最简客户角色，并使用 `TEMP-CUS-<公司>-SHP-<稳定哈希>`。`FinanceShipment.customerName` 始终保留为来源快照，`customerId` 指向实际客户角色。重复执行只更新已有来源映射和档案字段，不重复创建角色，也不会覆盖已换成正式值的身份代码。

## 写入链路

```text
右侧 CreateSurface / detail 编辑区
  -> route Zod schema
  -> external-party domain command
  -> direct BusinessAction adapter
  -> service transaction / Prisma / EditHistory
```

新增和更新在 service 中显式检查同角色编码重复。创建时可以通过明确的主体 ID，或唯一且非空的证件号码，给已有主体增加第二角色；名称不作为静默自动合并依据。更新保存前建立聚合历史基线并在成功后写包含全部角色的快照。删除页面记录的语义始终只是移除当前 External 角色：移除最后一个客户/供应商角色时同步删除 `ExternalPartyProfile`，但继续保留 `Party` 并递增主体版本。Party 的最终生命周期不归 External 页面所有，不能因往来角色清空而删除被内部公司、股权账本或其他领域复用的法定身份。

## 权限

| 资源 | action | 页面/API 含义 |
|---|---|---|
| `external.customers` | `entry/read/create/update/delete` | 客户列表与客户主数据 CRUD |
| `external.suppliers` | `entry/read/create/update/delete` | 供应商列表与供应商主数据 CRUD |

页面按钮按对应 resource action 显示，API 再由 module registry contract 和 guard 校验。两个资源的角色写权限互不共享；角色列表和 `roles` 元数据按 read 权限过滤。公共主体字段属于同一聚合，从任一入口修改都会同步反映到另一角色页面，因此双角色主体只有在用户同时具备客户和供应商 update 权限时才允许修改公共字段；当前角色自己的分类、联系、结算等资料仍只要求当前 L2 update 权限。

## UI 约定

两个页面均使用 Core `PageSurface` 和标准 split `BodySurface`：左侧 `SelectorSurface` 是往来目录，右侧复用同一组表单 section 直接展示和编辑所选记录，移动端由 Core 切换为抽屉。新增与 HR 岗位/部门一致，由 Toolbar 触发右侧 block `CreateSurface` 并暂时替换当前详情，取消或保存后恢复详情。用户有另一 L2 read 权限时，新增表单提供可搜索的“关联已有主体”，选择后锁定公共身份字段，只补录当前角色字段。主体类型、关系性质和状态使用标准下拉；业务分类保留为可配置文本，不与关联方判断混用。

关系性质按《企业会计准则第 36 号——关联方披露》收敛为：非关联方、集团内、合营/联营、控制或重大影响投资方、关键管理人员关联方、其他关联方。大客户、核心供应商、渠道、地区等经营分组只进入 `classification`，不得据此自动判断关联方。详细持股/控制链仍归资本证券，External 只保存 Finance 分析所需的关系口径。
