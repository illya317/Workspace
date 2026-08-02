# 导入主数据引用治理

导入边界的默认规则是：**源字段如果表达数据库中已经存在的业务主数据，正式事实必须保存该主数据的外键。** 公司名、公司编码、部门名、项目名、科目名、产品名等源值可以作为审计原文保留，但不能代替 FK 参与运行时关联、权限、汇总或状态判断。

这条规则覆盖网页上传、API import、离线脚本和私有 data release。导入 Adapter 负责解析外部值；业务 Module 只接收已解析的内部身份。外部原文与内部身份之间只有一个受治理 seam，不能在页面、route 或各 service 中重复写名称匹配。

## 三种允许的落库形态

| 形态 | 何时使用 | 数据库要求 |
|---|---|---|
| `foreign_key` | 源文件直接提供稳定内部 ID，或导入前已完成权威映射 | 正式列必须是 Prisma `@relation` 的 `fields` FK；导入时验证目标存在和可用 |
| `raw_with_fk` | 需要保留外部名称、编码或原始标签用于审计 | 同一事实必须另有真实 FK；raw/code/name 只作快照，运行时不得用它重新关联 |
| source snapshot | 不可变来源证据、解析失败记录或待人工映射队列 | 必须明确属于 source/evidence/pending 模型；一旦进入 owned active fact，必须解析 FK |

禁止新增“验证过的字符串所以等同 FK”这种公开协议。即使同一张表已经关联目标主表，raw 字段也必须由**同语义**的 companion FK 承担身份；例如来源公司与目标公司是两个事实，不能拿目标公司的 FK 为来源公司编码免责。

公司身份统一保存 `Company.id`；`Company.code` 只作为导入查找键和来源快照，前端名称统一读取 `Company.party.name`（简称）。写入同时提供公司 ID 与编码时必须一致；只提供其中一个时，由数据库约束补齐另一个；不存在或冲突时拒绝写入，不允许硬编码别名兜底。

子表能从父事实唯一继承身份时，不重复保存公司/部门等字段。例如预算公司身份只在 `FinanceBudgetVersion.companyId` 保存，预算行通过 `versionId` 继承；部门预算行另存 `departmentId`，研发预算行另存 `projectId`，科目统一存 `accountId`。

## 每次导入前必须完成的检查

1. 列出源文件全部业务字段，不只看准备写入的几列。
2. 在 Prisma schema 与主数据目录中查找同语义实体。优先检查 `Company`、`Department`、`Employee`、`Position`、`Project`、`Party`、`Product`、`InventoryItem`、`InventoryWarehouse`、`FinanceAccount`。
3. 已存在主数据时，定义稳定查找键、歧义规则、生命周期要求和目标 FK。名称匹配只能作为一次性解析手段，零命中或多命中必须整批失败；绝不能把未命中的值临时指向一个“看起来接近”的 ID。
4. 主数据不存在时，先判断它是否应该成为新主表；不能为了赶导入把名称直接塞进正式事实。确属外部证据的，进入 source/pending 模型并保留待映射状态。
5. 在 `ops/data-release-reference-contracts.mjs` 登记每个受控 handler 的源字段、lookup、目标列和 disposition。
6. 导入器在同一事务内重新读取目标主数据、写 FK、写 raw snapshot，并保证重放幂等。不得自动创建禁用占位主数据掩盖未解析引用。
7. 私有 manifest 的只读结果断言至少检查行数、FK 非空数和孤儿数；孤儿数必须为 `0`。

## Gate

`npm run import-reference:check` 同时检查两层：

- 所有 schemaVersion 2 data-release handler 必须有引用契约；`foreign_key` / `raw_with_fk` 的 destination 必须确实是 Prisma FK；不得新增 legacy semantic-key 例外。
- 扫描 Prisma 中主数据语义明显的 `*CompanyId/Code/Name`、`*DepartmentId/Name`、`*AccountId/Code/Name` 等字段，并校验 raw 字段的 companion FK 语义。未解析候选记录在 `scripts/check/import-reference-legacy-baseline.json`，只能减少；当前 baseline 已清零。
- 极少数不可变来源证据必须在 gate 内逐字段登记 companion FK 与原因。目前仅有 `FinanceStatementSourcePackage.parsedCompanyName`（公司身份由 `companyId` 承担）和 `FinanceGroupAccount.originLocalAccountCode`（年度科目记录并不唯一，公司身份由 `originCompanyId` 承担）。这不是运行时身份，也不能复制为新的例外。

该 gate 已进入 `check:contracts`、`check:changed`、`check:data` 和 CI。修改导入 handler、Prisma 关系或 migration 时都必须通过。

公司名称、公司编码和其他租户实例值直接写进源码的风险由现有 `npm run company:check` 负责；它从私有 tenant profile 提取禁用信号并对存量做独立 ratchet。`company:check` 管“值是否硬编码”，本 gate 管“数据库身份是否用 FK”，两者不能互相替代。

## 2026-07-30 全项目收口结果

首次静态扫描得到的 77 个候选是治理入口，不是 77 个都应机械加 FK。按实际数据库逐项判定后，正式事实已经补齐 Company、Department、Employee、Position、Product、Party、FinanceAccount 等引用；40 个公司编码字段均有 `Company.id` companion FK，现存 320,515 条公司编码记录的缺失 FK 为 0。数据库触发器持续校验公司 ID/编码一致性。

账号身份已删除无 FK 的 `User.employeeId` 副本，统一以 `Employee.userId -> User.id` 表达。资产卡片等前端只展示 Company 主档简称，不再把公司编码或历史文本当显示名称。

`Employment.currentCompany` 中可由 Company/Party 主档唯一命中的简称直接绑定；历史错误文本只能通过私有、带目标简称和理由的 reviewed override 纠正。已确认的 override 会同时规范化 `currentCompany` 与 `companyId`，避免留下“文本仍错、FK 已改”的双重事实；未确认项必须 hold，不得为了填满 FK 而指向任意其他公司。

完整机器检查以 `scripts/check/import-reference-legacy-baseline.json` 为准；baseline 当前为空。今后新增主数据样式 scalar、缺少同语义 FK、未登记 data-release 引用契约或新增无理由 snapshot 都会使 gate 失败。
