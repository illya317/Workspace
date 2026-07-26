# Contracts 合同主数据模块架构

## 定位与边界

Administration Contracts 是公司集中维护的合同主数据和台账，不是采购、销售、应收应付单据引擎。P0 负责可信身份、主体、期限、金额、状态、责任归属、保密、归档和数据补全。P1 增加审批完成后的附件包、归档记录和外部审批记录引用；系统不承载审批流程。电子签、条款、义务、付款/开票联动属于后续阶段。

页面入口为 `/administration/contracts`，由 `app/(modules)/administration/contracts/page.tsx` 完成路由鉴权和动作权限预取，再挂载 `ContractsClient`。页面不提供“我的合同”口径；合同采用集中台账，记录访问由保密级别和责任归属控制。

## 页面结构

`ContractsClient` 使用 Core `PageSurface + createPageTabBar + createMasterDetailBody`：

- 同页工作视图：以“合同台账”为父项，手风琴展开待补全、即将到期、已到期；父项本身即全部台账，视图状态不通过路由跳转同步。
- Toolbar：关键词、文件位置、合同类型、合同生命周期状态、页容量和导出。
- 左侧 Selector：合同名称、业务编号或系统标识、签署对方、到期日和生命周期状态。
- 右侧表单：基本信息、责任归属、签约主体、期限与履行、内容与备注、待核验旧值。
- P1 材料包：审批记录引用、合同附件和不可变归档记录以互斥折叠面板呈现。
- 正式记录只显示归档动作；只有 `lifecycleStatus=draft` 的草稿可以硬删除。

`待补全` 是服务端根据事实动态计算的工作队列，不持久化派生总数。典型问题包括缺号、重复号、主体未关联、经办人缺失、状态待确认、旧日期精度不足和机密合同责任归属缺失。

## 数据模型

`Contract.contractUid` 是不可变且唯一的系统身份；`contractNo` 是可空业务编号。新建和修改拒绝重复的非空业务编号，但迁移不会销毁既有重复来源值，重复记录进入待补全队列。

合同类型由 Administration 自有 `ContractCategory` 字典维护。合同通过稳定 FK 关联：

- `owningCompanyId -> Company.id`
- `ownerDepartmentId -> Department.id`
- `partyAId/partyBId -> Party.id`
- `handlerEmployeeId -> Employee.id`

`partyA/partyB` 继续保存合同签署时的名称快照；共享 `Party` 只提供稳定法定主体身份，不以当前主体名称覆盖历史签署文本。

`signedOn/expiresOn` 使用 PostgreSQL `date`。迁移前文本保存在 `legacySignDateRaw/legacyEndDateRaw`，日期精度记录在 `signedOnPrecision/expiresOnPrecision`；只有年份或无法确认到日的来源值不会被强行转换。金额使用 `Decimal(20,2)` 并配套三位 `currencyCode`。

状态拆为三个独立事实：

- `lifecycleStatus`: draft / active / terminated / expired / closed / unknown
- `signatureStatus`: unsigned / signed / unknown
- `performanceStatus`: not_started / in_progress / fulfilled / breached / waived / unknown

旧自由文本状态保存在 `legacyStatusRaw`。归档由 `isArchived + archivedAt + archivedBy` 审计，不把正式合同物理删除。

## API 与写入链路

| 端点 | 动作 |
|---|---|
| `GET /api/modules/administration/contracts` | 列表、筛选和工作视图 |
| `GET /api/modules/administration/contracts/export` | 导出全部匹配且当前用户可见的合同 |
| `GET /api/modules/administration/contracts/reference-options` | Company / Department / Party / Employee 候选项 |
| `POST /api/modules/administration/contracts` | 创建合同 |
| `PATCH /api/modules/administration/contracts/[id]` | 带 `If-Match` 的并发安全更新 |
| `POST /api/modules/administration/contracts/[id]/archive` | 带 `If-Match` 的归档 |
| `DELETE /api/modules/administration/contracts/[id]` | 仅删除带 `If-Match` 的草稿 |
| `GET /api/modules/administration/contracts/[id]/package` | 读取合同附件和归档记录 |
| `POST /api/modules/administration/contracts/[id]/attachments` | 上传附件并追加归档记录 |
| `GET /api/modules/administration/contracts/[id]/attachments/[attachmentUid]/download` | 下载原件或优化版 |
| `POST /api/modules/administration/contracts/[id]/attachments/[attachmentUid]/remove` | 软移除附件并追加记录 |
| `POST /api/modules/administration/contracts/[id]/records` | 新增归档、补充或备注记录 |
| `PUT /api/modules/administration/contracts/[id]/approval-reference` | 带 `If-Match` 登记外部审批记录引用 |
| `POST /api/modules/administration/internal/library-source` | HMAC 内部接口，生成内部级合同台账 XLSX |

所有写入遵守 `Zod schema -> domain validator -> service/Prisma`。Route Handler 只适配参数、当前用户和版本头；domain validator 统一归一金额、日期和 FK；service 在事务内锁定合同、重查记录访问、校验版本、写编辑历史并提交。

## 权限与记录访问

资源为 `administration.contracts`：

- `read/create/update/delete` 使用基础资源动作。
- `archive` 和 `export` 是显式动作；归档 POST 在 API action policy 中要求 `archive`，不会回退为 POST 默认的 `create`。
- 页面、API contract、BusinessAction 和 service 使用同一资源键。

对象访问由 `packages/administration/server/contract-access.ts` 负责：

- 内部级（2）合同遵循普通资源读权限。
- 机密级（3）合同仅系统管理员、合同经办人或归口部门负责人可见和维护。
- 绝密级（4）合同仅系统管理员可见和维护。
- 列表、导出、经营分析、更新、归档和删除复用同一记录范围；无权记录按不存在返回。

Company、Department、Party、Employee 关系均登记在 Platform relation registry，并由 Administration mutation-impact adapter 阻止删除或归档仍被合同引用的主数据。

## 下游适配

Library 的 `contract-ledger` 权威来源复用 `loadContractExportRecords + renderContractsCsv`，仅生成内部级现行合同快照；Library 不直接查询 Contract。经营分析复用受保护的合同 GET，个人视角仍是集中台账，部门视角按 `ownerDepartmentId` 约束，且继续执行合同记录访问规则。

## P1 合同材料包

P1 是审批完成后的归档和记录层，不创建待办、审批节点或审批状态机。`approvalSourceKey + approvalRecordId` 为将来接入外部审批系统预留稳定引用，URL、结果快照、通过日期和同步时间只保存外部事实快照；每次变更同时追加 `ContractRecord(recordType=approval)`。

合同附件保存不可变原件，移除仅做软删除并追加记录。PDF 上传后复用 Platform 的确定性优化原语；该原语由 Library 与 Administration 共同使用，生成线性化/压缩派生文件并校验页数、抽样渲染差异、大小和 SHA-256。只有节省至少 10% 且通过校验时才提供优化版，原件始终保留，避免压缩破坏数字签名或法律证据。

## 迁移

`20260726143000_contract_clm_p0` 创建类型字典和新字段，归一可确认到日的日期、旧状态和十进制金额，并仅在名称唯一匹配时关联 Party/Company。模糊值保留为旧值证据，不伪造法律事实。

`20260726165000_contract_clm_p1_archive_package` 增加审批引用字段、`ContractAttachment` 和追加式 `ContractRecord`，并以约束保证审批引用成对、附件存储事实完整和软移除事实一致。
