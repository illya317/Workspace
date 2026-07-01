# 权限矩阵

> 每个资源的 `access` / `write` / `delete` / `admin` 预期行为。后续可转为 Playwright / API 测试。

## 资源清单

| 资源 key | Session 表达 | 动作 |
|----------|--------------|------|
| `hr` | `visibleResourceKeys` / `visibleWriteResourceKeys` | access, write, delete, admin |
| `hr.roster` | `visibleResourceKeys` / `visibleWriteResourceKeys` | access, create, write, delete, archive, revise, admin（组织归档/恢复、审计恢复为独立动作） |
| `hr.roster.generated` | `visibleResourceKeys` / `visibleWriteResourceKeys` | access（查看生成入口/记录）, export, admin |
| `hr.performance` | `visibleResourceKeys` | access, admin（页面入口；数据复用 roster API，无独立写入） |
| `hr.analytics` | `visibleResourceKeys` | access, admin（分析页面；数据由 roster DTO 派生，无独立 API） |
| `finance` | `visibleResourceKeys` / `visibleWriteResourceKeys` | access, write, delete, admin |
| `finance.ledger` | `visibleResourceKeys` / `visibleWriteResourceKeys` | access, create, write, delete, revise, import, export, admin |
| `finance.statementConfig` | `visibleResourceKeys` / `visibleWriteResourceKeys` | access, create, write, delete, admin |
| `finance.statementReview` | `visibleResourceKeys` / `visibleWriteResourceKeys` | access, create, write, approve, admin |
| `finance.statements` | `visibleResourceKeys` | access, admin（只读报表 API） |
| `finance.budget` | `visibleResourceKeys` / `visibleWriteResourceKeys` | access, create, import, approve, admin |
| `finance.analysis` | `visibleResourceKeys` | access, admin（只读分析 API） |
| `finance.cost` | `visibleResourceKeys` / `visibleWriteResourceKeys` | access, delete, import, export, admin |
| `finance.import` | `visibleResourceKeys` / `visibleWriteResourceKeys` | access (preview), import (confirm), export, admin |
| `finance.tax` | `visibleResourceKeys` | access, admin（规划中页面，无业务 API） |
| `finance.treasury` | `visibleResourceKeys` | access, admin（规划中页面，无业务 API） |
| `administration.contracts` | `visibleResourceKeys` / `visibleWriteResourceKeys` | access, create, write, delete, admin |
| `production` | `visibleResourceKeys` / `visibleWriteResourceKeys` | access, create, write, delete, admin |
| `production.qc` | `visibleResourceKeys` / `visibleWriteResourceKeys` | access, create, write, delete, submit, approve, export, admin（批次创建、填写、提交复核、审核和列表导出） |
| `external` | `visibleResourceKeys` | access, admin（占位容器，无业务 API） |
| `external.investors/customers/suppliers` | `visibleResourceKeys` | access, admin（规划中页面，无业务 API） |
| `work` | `visibleResourceKeys` / `visibleWriteResourceKeys` | access（登录用户默认有效，并继承到普通 L2；不包含 capability）, write, delete, admin |
| `work.projects` | `visibleResourceKeys` / `visibleWriteResourceKeys` | access, write, delete, admin（模块门禁，不放大对象范围） |
| `work.projects.createOrg` | `visibleWriteResourceKeys` | write（创建运营委员会项目；独立 capability，`runtimeParentKey=work.projects`） |
| `work.projects.viewAll` | `visibleResourceKeys` | access（独立全量可见资源，`runtimeParentKey=work.projects`） |
| `work.tasks` | `visibleResourceKeys` / `visibleWriteResourceKeys` | delete（登录用户默认有效；访问/编辑/删除列显示为默认规则）, admin |
| `work.meetings` | `visibleResourceKeys` / `visibleWriteResourceKeys` | access, create, write, delete, submit, approve, admin（投票提交/关闭表决拆分） |
| `settings.account` | `visibleResourceKeys` | access（登录用户默认有效） |
| `settings.admin` | `visibleResourceKeys` | access（任意资源管理员默认有效） |
| `settings.api` | `visibleResourceKeys` | access（Open API 控制台读取；不代表外部调用权限） |
| `settings.ui` | `visibleResourceKeys` | access, admin（Core UI 组件库展示页，无服务端 API） |
| `settings.account.apiAccess` | `visibleResourceKeys` | access（个人 API Key 使用能力） |
| `settings.api.manage` | `visibleWriteResourceKeys` | access, create, write, delete, revise, admin（Client 创建、secret 轮换、scope 授权；`runtimeParentKey=settings.api`） |
| `docs` | `visibleResourceKeys` | access（登录用户默认有效，并继承到普通 L2；不包含 capability） |
| `docs.company` / `docs.expense` | `visibleResourceKeys` | access, admin（静态文档页，无业务 API） |
| `library.basicInfo` | `visibleResourceKeys` / `visibleWriteResourceKeys` | access, write, archive, import, export, admin（资料元数据编辑、软归档、扫描/生成入库、下载导出） |
| `agent` | `visibleResourceKeys` | access |

## 页面 Guard

页面入口统一调用 `requireRouteAccess("<href>")`，由 registry 将 route 解析到 L1/L2 resource，再检查 RBAC 与 runtime enabled/disabled。页面不得直接手写 resource key 作为主门禁。

| 页面 | 权限检查 | 无权限行为 |
|------|---------|-----------|
| `/portal` | 无（入口页） | — |
| `/hr` | `requireResourceAccess("hr")` | redirect `/portal` |
| `/hr/roster` | `requireResourceAccess("hr.roster")` | redirect `/portal` |
| `/hr/performance` | `requireResourceAccess("hr.performance")` | redirect `/portal` |
| `/hr/analytics` | `requireResourceAccess("hr.analytics")` | redirect `/portal` |
| `/finance` | `requireResourceAccess("finance")` | redirect `/portal` |
| `/finance/ledger` | `requireResourceAccess("finance.ledger")` | redirect `/portal` |
| `/finance/statement-config` | `requireResourceAccess("finance.statementConfig")` | redirect `/portal` |
| `/finance/statement-review` | `requireResourceAccess("finance.statementReview")` | redirect `/portal` |
| `/finance/statements` | `requireResourceAccess("finance.statements")` | redirect `/portal` |
| `/finance/budget` | `requireResourceAccess("finance.budget")` | redirect `/portal` |
| `/finance/analysis` | `requireResourceAccess("finance.analysis")` | redirect `/portal` |
| `/finance/cost` | `requireResourceAccess("finance.cost")` | redirect `/portal` |
| `/finance/import` | `requireResourceAccess("finance.import")` | redirect `/portal` |
| `/administration` | `requireResourceAccess("administration")` | redirect `/portal` |
| `/administration/contracts` | `requireResourceAccess("administration.contracts")` | redirect `/portal` |
| `/production` | `requireResourceAccess("production")` | redirect `/portal` |
| `/production/qc` | `requireResourceAccess("production.qc")` | redirect `/portal` |
| `/work` | `requireResourceAccess("work")` + module enabled | redirect `/portal` 或模块未启用页 |
| `/work/projects` | `requireResourceAccess("work.projects")` + module enabled + 项目对象级过滤 | redirect `/portal` 或模块未启用页 |
| `/work/tasks` | `requireResourceAccess("work.tasks")` + module enabled | redirect `/portal` 或模块未启用页 |
| `/work/meetings` | `requireResourceAccess("work.meetings")` + module enabled + 会议对象级过滤 | redirect `/portal` 或模块未启用页 |
| `/docs` | `requireResourceAccess("docs")` | redirect `/portal` |
| `/settings/account` | `requireRouteAccess("/settings/account")` | redirect `/portal` |
| `/settings/admin` | `requireRouteAccess("/settings/admin")` | redirect `/portal` |
| `/settings/api` | `requireRouteAccess("/settings/api")` | redirect `/portal` |
| `/settings/api/hr-generated` | `requireRouteAccess("/settings/api/hr-generated")` | redirect `/portal` |

## API Guard

| API | 方法 | 所需权限 |
|-----|------|---------|
| `/api/modules/hr/roster/*` | GET | `hr.roster.access` |
| `/api/modules/hr/roster/*` | POST/PUT/PATCH | `hr.roster.write` |
| `/api/modules/hr/roster/*` | DELETE | `hr.roster.delete` |
| `/api/modules/finance/ledger/accounts*` | GET | `finance.ledger.access` |
| `/api/modules/finance/ledger/accounts` | POST | `finance.ledger.access` + `finance.ledger.create` |
| `/api/modules/finance/ledger/accounts/[id]` | PUT | `finance.ledger.write` |
| `/api/modules/finance/ledger/accounts*` | DELETE | `finance.ledger.delete` |
| `/api/modules/finance/ledger/vouchers*` | GET | `finance.ledger.access` |
| `/api/modules/finance/ledger/vouchers` | POST | `finance.ledger.access` + `finance.ledger.create` |
| `/api/modules/finance/ledger/vouchers/[id]` | PUT | `finance.ledger.write` |
| `/api/modules/finance/ledger/vouchers*` | DELETE | `finance.ledger.delete` |
| `/api/modules/finance/ledger/balances` | GET | `finance.ledger.access` |
| `/api/modules/finance/ledger/balances` | POST | `finance.ledger.access` + `finance.ledger.revise` |
| `/api/modules/finance/ledger/balances/reconcile` | POST | `finance.ledger.access` + `finance.ledger.import` |
| `/api/modules/finance/ledger/periods*` | GET | `finance.ledger.access` |
| `/api/modules/finance/ledger/periods` | POST | `finance.ledger.access` + `finance.ledger.create` |
| `/api/modules/finance/ledger/periods/[id]` | PUT/DELETE | `finance.ledger.write/delete` |
| `/api/modules/finance/ledger/init` | POST | `finance.ledger.access` + `finance.ledger.create` |
| `/api/modules/hr/roster/departments/[id]/archive` | POST | `hr.roster.access` + `hr.roster.archive` |
| `/api/modules/hr/roster/positions/[id]/archive` | POST | `hr.roster.access` + `hr.roster.archive` |
| `/api/modules/hr/roster/audit-log/restore` | POST | `hr.roster.access` + `hr.roster.revise` |
| `/api/modules/finance/ledger/reclass-rules` | GET | `finance.ledger.access` |
| `/api/modules/finance/ledger/reclass-rules` | PUT | `finance.ledger.access` + `finance.ledger.revise` |
| `/api/modules/finance/ledger/reclass-rules/[id]` | DELETE | `finance.ledger.access` + `finance.ledger.revise` |
| `/api/modules/finance/ledger/reclass-results` | GET | `finance.ledger.access` |
| `/api/modules/finance/ledger/reclass-results` | POST | `finance.ledger.access` + `finance.ledger.revise` |
| `/api/modules/finance/ledger/reclass-results/[id]` | PATCH | `finance.ledger.access` + `finance.ledger.revise` |
| `/api/modules/finance/statement-config` | GET | `finance.statementConfig.access` |
| `/api/modules/finance/statement-config` | PUT | `finance.statementConfig.write` |
| `/api/modules/finance/statement-config/mappings` | GET | `finance.statementConfig.access` |
| `/api/modules/finance/statement-config/mappings` | POST/PATCH/DELETE | `finance.statementConfig.create/write/delete` |
| `/api/modules/finance/statement-review/reviews` | GET | `finance.statementReview.access` |
| `/api/modules/finance/statement-review/reviews` | POST | `finance.statementReview.create` |
| `/api/modules/finance/statement-review/reviews/[id]` | PUT | `finance.statementReview.write` |
| `/api/modules/finance/statement-review/reviews/[id]/confirm` | POST | `finance.statementReview.approve` |
| `/api/modules/finance/statement-review/workpapers` | GET | `finance.statementReview.access` |
| `/api/modules/finance/statement-review/workpapers` | PUT | `finance.statementReview.write` |
| `/api/modules/finance/statements/reports*` | GET | `finance.statements.access` |
| `/api/modules/finance/analysis/budget` | GET | `finance.analysis.access` |
| `/api/modules/finance/budget` | GET/POST | `finance.budget.access/import` |
| `/api/modules/finance/budget/versions` | GET/POST | `finance.budget.access/create` |
| `/api/modules/finance/budget/versions/[id]/activate` | POST | `finance.budget.approve` |
| `/api/modules/finance/import/preview` | POST | `finance.import.access` |
| `/api/modules/finance/import/confirm` | POST | `finance.import.import` |
| `/api/modules/finance/cost/*` | GET | `finance.cost.access` |
| `/api/modules/finance/cost/imports` | POST | `finance.cost.import` |
| `/api/modules/finance/cost/imports/[id]` | DELETE | `finance.cost.delete` |
| `/api/modules/production/qc` | GET | `production.qc.access` |
| `/api/modules/production/qc` | POST | `production.qc.create` |
| `/api/modules/production/qc/[batchId]` | GET | `production.qc.access` |
| `/api/modules/production/qc/[batchId]` | PATCH | `production.qc.write` |
| `/api/modules/production/qc/[batchId]` | DELETE | `production.qc.delete` |
| `/api/modules/production/qc/[batchId]/submit` | POST | `production.qc.submit` |
| `/api/modules/production/qc/[batchId]/approve-review` | POST | `production.qc.approve` |
| `/api/modules/administration/contracts*` | GET | `administration.contracts.access` |
| `/api/modules/administration/contracts` | POST | `administration.contracts.create` |
| `/api/modules/administration/contracts/[id]` | PATCH | `administration.contracts.write` |
| `/api/modules/administration/contracts*` | DELETE | `administration.contracts.delete` |
| `/api/modules/work/projects*` | GET | `work.projects.access` + module enabled + 项目对象级过滤 |
| `/api/modules/work/projects*` | POST | `work.projects.access` + module enabled + 项目创建类型校验（普通/部门/运营委员会） |
| `/api/modules/work/projects*` | PUT | `work.projects.write` + module enabled + 项目对象级写入校验 |
| `/api/modules/work/projects*` | DELETE | `work.projects.delete` + module enabled + 项目对象级删除校验 |
| `/api/modules/work/projects/members*` | GET/POST/PUT/DELETE | `work.projects` 对应动作 + module enabled + 项目对象级管理校验 |
| `/api/modules/work/projects/reference-options` | GET | FK registration permission + module enabled；项目/会议候选由 Work FK registry adapter 按对象可见性过滤 |
| `/api/modules/work/meetings*` | GET | `work.meetings.access` + 会议对象级过滤 |
| `/api/modules/work/meetings` | POST | `work.meetings.access` + `work.meetings.create` |
| `/api/modules/work/meetings/[id]` | PUT | `work.meetings.write` + 会议对象级编辑校验 |
| `/api/modules/work/meetings/[id]` | DELETE | `work.meetings.delete` + 会议对象级删除校验 |
| `/api/modules/work/meetings/[id]/agenda` / `minutes` / `decisions` / `participants` / `action-candidates` / `proposals` | POST | `work.meetings.write` + 会议对象级编辑校验 |
| `/api/modules/work/meetings/[id]/votes/[proposalId]/cast` | POST | `work.meetings.access` + `work.meetings.submit` + 参会投票资格 |
| `/api/modules/work/meetings/[id]/votes/[proposalId]/close` | POST | `work.meetings.access` + `work.meetings.approve` + 会议对象级管理校验 |
| `/api/modules/library/basic-info*` | GET | `library.basicInfo.access` + 保密等级过滤 |
| `/api/modules/library/basic-info/documents/[id]` | PATCH | `library.basicInfo.write`；若状态改为归档还需要 `library.basicInfo.archive` |
| `/api/modules/library/basic-info/documents/[id]` | DELETE | `library.basicInfo.access` + `library.basicInfo.archive` |
| `/api/modules/library/basic-info/documents/[id]/download` | GET | `library.basicInfo.access` + `library.basicInfo.export` + 保密等级过滤 |
| `/api/modules/library/basic-info/scan` | POST | `library.basicInfo.access` + `library.basicInfo.import` |
| `/api/modules/library/basic-info/generated-sources/[key]/generate` | POST | `library.basicInfo.access` + `library.basicInfo.import` |
| `/api/settings/api/open/*` | GET | `settings.api.access` |
| `/api/settings/account/*` | GET/POST/PUT/PATCH/DELETE | `settings.account.access` + 当前登录用户自助数据边界 |
| `/api/settings/account/api-key` | GET | `settings.account.apiAccess.access` |
| `/api/settings/account/api-key` | POST | `settings.account.apiAccess.access` + `settings.account.apiAccess.revise` |
| `/api/settings/api/open/clients` | POST | `settings.api.access` + `settings.api.manage.create` |
| `/api/settings/api/open/clients/[id]/secret` | POST | `settings.api.access` + `settings.api.manage.revise` |
| `/api/settings/api/open/clients/[id]/scopes` | PUT | `settings.api.access` + `settings.api.manage.write` |
| `/api/agent*` | GET | `agent.access` |
| `/api/agent*` | POST | `agent.access` + `agent.submit` |

## Open API Scope

开放 API 不进入内部 RBAC `Resource` 表。下列权限由 `OpenApiClientScopeGrant` 授予，并通过 `Authorization: Bearer <secret>` 鉴权。

| API | 方法 | OpenApiScope | 运行态归属 |
|-----|------|--------------|------------|
| `/api/open/v1/hr/generated/roster` | GET | `hr.generated.roster.read` | `hr.roster` enabled |

## Work Project 对象级范围

- `work.projects.access/write/delete` 只控制项目模块入口和对象级写入入口，不代表查看全部、管理全部、删除全部或创建运营委员会项目。
- 项目可见范围由创建人、主导部门负责人、项目 RASCI 成员、显式 `work.projects.viewAll` 和 root admin 共同决定。
- 运营委员会项目创建由独立 `work.projects.createOrg.write` 控制；部门项目创建由目标部门负责人自然权限控制；普通项目由在职员工在 `work.projects.access` 下发起。
- `work.projects.viewAll` 只授予全量可见，不授予全量管理或删除；需要管理/删除具体项目仍按对象级规则计算。
- `work.projects.viewAll` 不挂 `parentKey`，因此不会继承 `work.projects` 模块权限；它通过 `runtimeParentKey` 跟随 `work.projects` disabled。
- `work` 或 `work.projects` disabled 后，模块入口、页面、API、FK 暴露和 `work.projects.viewAll` 一起失效。

## 继承规则

- 父资源 `access` 覆盖所有子资源 `access`
- 内置 `admin` 账号是 root identity，不属于 RBAC resource，覆盖所有已启用资源的所有动作。
- 子资源 checker 先查子资源，未命中回退父资源
- `runtimeParentKey` 不参与 RBAC 继承，只参与模块运行态 enabled/disabled 级联。
