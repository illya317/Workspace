# 外部关系 — 架构文档

## 定位

外部关系维护客户、供应商和关联方名录。客户/供应商是往来角色，单位/个人是主体类型：自然人客户在客户入口维护，自然人供应商在供应商入口维护，不建立独立个人往来入口。关联方不是第三种往来角色：人工项从现有客户/供应商 Party FK 登记，系统项从公司、股权、HR 与财务事实实时投影；关联方入口不能自由创建法定主体。法定主体只保存一份，客户和供应商角色通过固定页面、API 前缀和 RBAC 资源保持操作权限独立。投资人关系及详细持股控制链仍归资本证券。

## 路由与包边界

```text
app/(modules)/external/
  customers/             # 客户主数据页面壳
  suppliers/             # 供应商主数据页面壳
  related-parties/       # 关联方名录页面壳

app/api/modules/external/
  customers/             # GET / POST / PATCH / DELETE
  suppliers/             # GET / POST / PATCH / DELETE
  related-parties/       # GET 名录/候选，POST 登记，DELETE 取消人工维护的关联方

packages/external/
  ui/ExternalPartyClient.tsx     # 客户/供应商共享的列表与录入交互
  server/external-parties.ts     # BusinessAction adapter 与公开写入口
  server/external-party-service.ts # 角色投影、版本、审计与落库
  server/related-parties.ts # 关联方名录、候选查询与登记写入
  server/domain/*                # 业务字段与命令校验
  types/*                        # DTO 与 category 契约
```

页面和 API route 只承担鉴权、请求形状和挂载；真实 UI、domain validator 与 Prisma 写入均在 `packages/external`。

## 工作空间轻代码读取模型

External owner 登记 `external.customers`、`external.suppliers`、`external.related-parties` 及客户/供应商对应的角色子读模型。客户和供应商源完整沿用各自 GET 的公开稳定标量 DTO，并把公开 `roles` 数组规范化为一主体一角色关系行；关联方源只公开主体身份和关系性质，不公开往来角色的联系、银行、信用或结算字段。每次发现和执行都重验对应 L2 的 read 权限，不建立第二套可见范围。轻代码不再叠加“可分析字段”权限；字段敏感级只是元数据，导出策略只约束独立导出链路。

客户和供应商主数据没有可信的个人、部门或项目归属外键，因此三类空间中的 source 都明确为 `workspace`：它表示当前账号在原业务页面可见的全公司主数据，不能被页面或 Agent 描述成目标部门/项目自己的往来数据。写入、凭证、搜索候选和下拉片段不是独立分析事实。

## 数据模型

`Party`、`ExternalPartyProfile` 与 `ExternalPartyRole` 共同构成外部往来角色聚合：

- `Party` 是 Platform 提供的中立法定身份事实源，只保存主体类型、名称、证件号码和法定代表人等跨业务公共资料；External 通过 Party Directory Interface 使用它，不拥有第二份主体表。
- `ExternalPartyProfile` 一对一保存 External 专属的 `relatedPartyType`；该字段不进入 Company 或 OwnershipInterest。
- `ExternalPartyRole.category` 固定为 `customer` 或 `supplier`，由 route 注入，客户端不能改变；同一主体可以同时拥有两个角色，但同一角色只能有一条。
- `subjectType` 固定为 `organization` 或 `individual`，表单展示为“单位 / 个人”。
- `relatedPartyType` 是财务披露口径的关系性质，默认 `unrelated`；它与客户/供应商角色、单位/个人主体类型、可配置业务分类相互独立。
- “关联方”L2 把人工登记的 `relatedPartyType != unrelated` Party 与系统默认项合并为统一条目，并按基准日投影法定名称、统一代码和法定代表人；不会返回客户/供应商角色的联系人、银行、信用或结算资料。
- 系统默认项不复制事实：有效内部 `Company` 投影为“集团内”，集团公司股东及股东的股东按两层 confirmed `OwnershipInterest` 投影为“重大影响”，HR 在职 `personnelType=核心人员` 且已有 `FinanceAuxiliaryMember.linkedEmployeeId` FK 的员工投影为“管理人员”。管理人员条目以 Employee 为身份，不创建个人 Party；跨公司、账套的多条辅助核算记录通过 FK 合并为一个员工条目，重名时 fail closed。
- 新增关联方只能从当前账号可读取、尚未人工登记且不属于系统默认项的客户/供应商 Party FK 中选择；候选接口只返回共享主体身份、可见往来角色和 Party 版本，不返回角色编码、联系人、银行、信用或结算字段。保存时 API 再次校验主体仍属于可见往来名单，通过 Party 乐观锁更新 `ExternalPartyProfile.relatedPartyType` 并记录 Party 历史快照。
- 系统默认项由 Company、资本证券台账、HR 和财务辅助核算事实实时维护，不能在 External 取消。其余人工维护项可通过 DELETE 把 `relatedPartyType` 恢复为 `unrelated`；Party、客户/供应商角色、来源映射和历史快照均保留。
- `code + category` 在角色表唯一；客户和供应商可使用相同编码而互不冲突。这里的编码是 T1 全局角色编码，来源 ERP 的公司内编码必须进入后续公司/来源映射，不能直接占用该唯一键。
- 分类、联系、地址、银行、开票、结算和信用字段属于角色当前资料，避免同一主体作为客户与供应商时相互覆盖；角色启停由独立可用期间表达。
- 单位展示简称、全称、统一代码、法定代表人、税率和开票信息；个人展示姓名和证件号码。统一代码或个人证件号码是主体必填身份字段。
- 两个 L2 返回相同的主体 `id`，并按当前角色扁平投影角色字段；`roles` 只说明当前用户有权读取的角色，不能借一个 L2 泄露另一个 L2 的业务关系。
- 身份字段统一去除首尾空白并转大写，以 `subjectType + identityNumber` 做数据库唯一键；历史缺失或重复数据必须人工复核，迁移不会静默补值或合并。
- 页面人工新建仍要求统一代码或个人证件号。缺少法定身份的历史档案使用带 `TEMP-` 前缀的全局唯一临时身份编码，明确表示待补正式代码；不能把来源业务编码原值冒充法定身份。
- `ExternalPartySourceMapping` 保存角色在具体公司和来源系统中的稳定键、源编码、源名称、文件/Sheet/行号及原始字段。公司内 ERP 编码只进入该映射，角色的全局编码使用命名空间编码。
- 名称默认只用于来源映射。客户与供应商两份受治理档案中，正式全称完全一致、两侧各自唯一时，可先合并为一个临时身份主体并挂双角色；简称相同、正式全称不同或任一侧多候选时保持分开，等待正式身份复核。
- Party 使用统一的 `version / editedBy / editedAt` 做并发保护和独立身份历史；更新和停用都要求 `If-Match` 版本。停用客户/供应商角色只追加结束期间，不删除 External role、来源映射、profile 或 Party；Party 被 Company 或 OwnershipInterest 复用时，法定身份修改还需要 `party.identity.update`。

### 角色可用性生命周期

`ExternalPartyRole` 是稳定角色锚点，`ExternalPartyRolePeriod` 是唯一可用性事实源。期间使用包含式 `validFrom / validThrough`，由 Platform Contract 转换为半开区间计算；当前、待生效和历史状态都按服务端 `asOfDate` 推导。`ExternalPartyRole.isActive` 只保留为当前租户业务日的兼容缓存，不参与 as-of 权威判断。

期间表不可更新、不可删除。登记期间追加 `schedule`，终止当前期间追加 `end-date` 修订，取消未来期间追加 `cancel-future`，历史纠错追加带 `supersedesId` 的 `correct` 修订。所有在线命令在 Serializable 事务中锁定 Party，要求 `If-Match` 和 `Idempotency-Key`，并由同一领域投影检查有效日期和重叠。

迁移只建立“迁移时现状基线”：启用角色以迁移观察日作为最早已知有效日，更早历史保持未知；停用角色记录 `unknown` 基线但不推断历史结束日。旧 ERP 导入直写已关闭，但新的受治理导入 handler 尚未接入角色期间命令，因此该 registration 暂标记为 `partial`。

### 法定事实生命周期

`Party` 和 `Company` 继续作为稳定身份/角色锚点，但其法定名称、证件、法定代表人、注册资本、注册地址和注册日期字段只是兼容当前投影，不再是历史事实源。唯一权威事实源是 append-only `PartyLegalFactRevision`：每个修订保存完整法律事实快照、业务生效日、修订号、命令类型、记录状态、操作者、幂等键和来源。普通变化与未来计划追加 `change`，历史纠错追加带 `supersedesId` 的 `correction`，取消尚未生效计划追加 `cancel-future`；已落库修订由数据库 trigger 禁止更新或删除。

External 列表和详情按服务端 `asOfDate` 从修订台账选择最新有效快照，并返回当前、待生效、历史和取消/被替代状态。`CompanyRegistryChange` 保留为工商原始证据，可通过 `sourceRegistryChangeId` 导航到产生修订的来源，但其自由文本前后值不再直接充当 Party/Company 当前事实。迁移会为所有现有 Party 建立“现状基线”，明确标注迁移前历史未知，不从无法验证的工商文本伪造期间。

当前 registration 标记为 `partial`：External 在线创建/更新与 Capital 公司治理已进入统一 `recordPartyLegalFactInTransaction` seam，旧 External ERP 导入直写也已 fail closed；待受治理批量导入 handler 与独立 correction 权限接入后，才能标记 `implemented`。

## 历史 ERP 主数据导入

`scripts/import/import-external-party-master.mjs` 只保留为旧 ERP 档案的只读解析、哈希和基线预检工具，不再是维护入口。其 `--execute` 已 fail closed，禁止继续绕过法定事实与角色期间事实源直写 Party、Company 或 ExternalPartyRole。

```bash
node --import tsx scripts/import/import-external-party-master.mjs \
  --company-code=04 \
  --customer-file=/path/to/客户档案.XLS \
  --supplier-file=/path/to/供应商档案.XLS
```

dry-run 输出实际数据库名、两份源文件 SHA-256、发货行数和当前主数据基线，只用于构造与复核后续受治理的数据发布证据。源 XLS 不进入 Git、standalone 或租户配置。

新的正式导入 handler 必须逐主体调用 Party legal-fact seam，并逐角色调用 role lifecycle seam：法定字段追加 `PartyLegalFactRevision`，角色身份稳定保存，首个或后续可用期间追加 `ExternalPartyRolePeriod`，来源证据写入 `ExternalPartySourceMapping`。整个批次仍需以 `companyId + sourceSystem + sourceKey` 幂等，但不能恢复旧脚本中的 Party/Role 直接 create/update/delete。该 handler 尚未落地前，ERP 档案只允许 dry-run，不允许生产写入。

## 写入链路

```text
右侧 CreateSurface / detail 编辑区
  -> route Zod schema
  -> external-party domain command
  -> direct BusinessAction adapter
  -> service transaction / Prisma / EditHistory
```

新增和更新在 service 中显式检查同角色编码重复。创建时可以通过明确的主体 ID，或唯一且非空的证件号码，给已有主体增加第二角色；名称不作为静默自动合并依据。更新保存前建立聚合历史基线并在成功后写包含全部角色的快照。普通更新不接受 `isActive`；创建会同时建立首个角色期间。DELETE 的语义是从请求业务日起结束角色期间，不能删除角色、`ExternalPartyProfile`、`ExternalPartySourceMapping` 或 Party。Party 的最终生命周期不归 External 页面所有。

涉及公共法定字段的在线保存还必须提供 `Idempotency-Key`、Party `If-Match` 与 `legalFactRevision`。domain validator 先分离角色资料与法定事实，service 在 Serializable 事务内锁定 Party、追加修订、重算基准日投影，并同步刷新 Party/Company 缓存字段；角色字段仍在同一外部主体事务内更新。未来生效日不会覆盖历史修订，重试命中同一幂等键时返回既有修订。

## 权限

| 资源 | action | 页面/API 含义 |
|---|---|---|
| `external.customers` | `entry/read/create/update/delete` | 客户列表、当前资料、期间登记与角色停用；delete 权限只授权 end-date |
| `external.suppliers` | `entry/read/create/update/delete` | 供应商列表、当前资料、期间登记与角色停用；delete 权限只授权 end-date |
| `external.relatedParties` | `entry/read/create/delete` | 查看关联方名录；create 仅允许把可读取的客户/供应商 Party FK 登记为关联方；delete 仅取消人工维护标记，不授予角色资料写权限，系统配置项受服务端保护 |

页面按钮按对应 resource action 显示，API 再由 module registry contract 和 guard 校验。两个资源的角色写权限互不共享；角色列表和 `roles` 元数据按 read 权限过滤。公共主体字段属于同一聚合，从任一入口修改都会同步反映到另一角色页面，因此双角色主体只有在用户同时具备客户和供应商 update 权限时才允许修改公共字段；当前角色自己的分类、联系、结算等资料仍只要求当前 L2 update 权限。期间登记、更正和取消未来目前共用 update，终止使用 delete；独立 correction/cancel 权限仍是 registration 保持 `partial` 的缺口。

## UI 约定

客户和供应商页面均使用 Core `PageSurface` 和标准 split `BodySurface`：左侧 `SelectorSurface` 是往来目录，右侧复用同一组表单 section 直接展示和编辑所选记录，移动端由 Core 切换为抽屉。新增与 HR 岗位/部门一致，由 Toolbar 触发右侧 block `CreateSurface` 并暂时替换当前详情，取消或保存后恢复详情。用户有另一 L2 read 权限时，新增表单提供可搜索的“关联已有主体”，选择后锁定公共身份字段，只补录当前角色字段。主体类型与关系性质使用标准下拉；业务分类保留为可配置文本，不与关联方判断混用。

关联方页面使用标准表格，提供关系性质、关键词和基准日筛选；新增区只包含“客户/供应商 FK”和“关系性质”，不提供自由主体录入。列表展示“系统配置 / 人工维护”，只有具备 delete 权限的人工维护项显示“取消关联方”；取消确认会明确客户、供应商和主体资料继续保留。它只承担“谁是关联方”的名录与登记职责；关联交易金额和凭证追溯仍归 Finance。

页面 Toolbar 提供基准日选择器；详情在普通资料表单后分别组合角色 `availability` 和法定事实 `effective-period` 视图，分开展示 temporal state 与 record state。角色生命周期表单提供登记期间、更正和取消待生效；停用动作从当前基准日起追加结束修订。公共法定字段发生变化时可选择生效日并填写原因，页面提交最新 `legalFactRevision` 和新的幂等键。两条时间线互不混成一个状态。

关系性质按《企业会计准则第 36 号——关联方披露》收敛为：非关联方、集团内、合营/联营、控制或重大影响投资方、关键管理人员关联方、其他关联方。大客户、核心供应商、渠道、地区等经营分组只进入 `classification`，不得据此自动判断关联方。详细持股/控制链仍归资本证券，External 只保存 Finance 分析所需的关系口径。
