# HR 模块架构

## 路由入口

| 页面 | 路由 | 组件 |
|------|------|------|
| 人事管理主页 | `/hr` | `app/(modules)/hr/page.tsx` → Platform `ModuleHome` |
| 人事基础资料 | `/hr/roster` | `app/(modules)/hr/roster/page.tsx` → `@workspace/hr/ui` 的 `HRClient` |
| 员工详情表单 | `/hr/roster/employees/[id]` | route shell + `@workspace/hr/ui` |
| 绩效管理 | `/hr/performance` | `app/(modules)/hr/performance/page.tsx` → `@workspace/hr/ui` 的 `HrPerformanceClient` |
| 人力分析 | `/hr/analytics` | `app/(modules)/hr/analytics/page.tsx` → `@workspace/hr/ui` 的 `HRAnalyticsClient` |

绩效保留两个业务入口：`/work/performance` 面向员工评审与流程操作，`/hr/performance` 面向 HR 汇总查看。当前两个入口使用相同的 HR performance API 和表格口径；后续页面交互可以分叉，但正式记录、流程 adapter 与归档仍由 HR 领域拥有。

## HR 基础资料结构

`/hr/roster` 现在由 `packages/hr/ui/HRClient.tsx` 渲染，route 只做鉴权和挂载。页面采用主数据拆分入口：

- `员工资料`：默认入口，先显示员工列表，再进入 `/hr/roster/employees/[id]` 维护单个员工的多维资料。
- `组织架构`：通过 `DepartmentPositionTab` 的组织模式维护组织单元树。底层仍使用兼容 Prisma model `Department`，产品语义已收敛为“组织单元”。
- `部门岗位`：通过 `DepartmentPositionTab` 的岗位模式维护岗位与说明书。
- `员工信息表`：用于集中修正员工、雇佣、合同、部门岗位数据。四个表统一先进入编辑态，跨行、跨字段修改只形成页面草稿，最后由顶部保存一次提交当前 change set；取消会丢弃整页草稿，不提供逐单元格保存。
- `花名册`：管理版、尽调版、CSV 导出和 Open API 共用同一生成口径，只纳入当前在职且在职雇佣记录中没有“顾问”职务的人员；离职人员和顾问仍保留在员工资料、分析等独立场景中，不进入花名册。

组织单元层级分两条线：`Department.hierarchyKind = "G"` 表示治理线，使用 `G1/G2/G3`；`Department.hierarchyKind = "M"` 表示管理线，使用 `M1/M2/M3`。旧 L1/L2/L3 管理部门默认迁为 M1/M2/M3；治理线固定节点包括 `BOD` 董事会、`NOM/STR/EXC/AUD` 四个 G2 委员会，以及 `OPS` 运营委员会、`BSC` 董秘办及资本证券部两个 G3 节点。

组织负责人分两层：`Department.managerPositionId`（FK 到 `Position`）是唯一可编辑事实源；“组织负责人”是该负责人岗位下当前在职员工的派生名单，允许多人。组织架构、部门岗位、模板空间权限等场景只能读取这条链；`Department.managerUserId`、部门说明书 JSON 和岗位说明书汇报字段不得再承载或编辑负责人。组织架构页的岗位层级展示使用当前组织的负责人岗位：负责人岗位作为本组织顶层，其他直属岗位归到负责人岗位下；没有负责人岗位时只提示未设置，不回退岗位说明书。

人事说明书是次级资料库，不承载主数据身份事实。岗位说明书的 `Position.code`、`Position.name`、`Position.departmentId -> Department.name` 是岗位编码、岗位名称、所属组织的唯一事实源；部门说明书的 `Department.code`、`Department.name` 是组织编码、组织名称的唯一事实源。说明书页面可以展示这些字段，但不得写入 `PositionDescription` / `DepartmentDescription`。说明书只保存岗位目的、摘要、编制、版本、生效日期、来源文件、原始编码、正文 JSON 等文档事实；岗位说明书的汇报对象使用 `PositionDescription.reportToPositionId -> Position.id`，不得再用字符串岗位名承载关系。

部门说明书正文中的旧 `基本信息.负责人/主管领导/岗位编制/定编岗位` 已通过数据迁移删除；运行时代码不再读取或清洗这些兼容字段。负责人只从 `Department.managerPositionId` 派生，编制只从当前岗位主数据统计。

岗位职责条目从 `PositionDescription.details.duties` 同步到 `PositionResponsibilityNode`。该表只索引职责大类和小类，保存稳定 `nodeKey`、说明书版本、更新时间、JSON 路径和文本 hash；岗位说明书 JSON 仍是正文来源。Work/OKR 引用职责时不得靠 JSON 下标，必须引用职责节点并保存当时的职责文本快照。

FUN 职能岗位不复制到应用部门。`Position.departmentId` 继续表示岗位主数据归属，所有职能岗位统一归属 FUN 线；特殊应用和跨公司汇报通过 `PositionReportOverride(positionId, companyId, departmentId)` 维护，唯一键是岗位、汇报公司、应用部门。维护入口语义为岗位详情里的“特殊汇报”，组织架构页不承载写入。员工部门岗位保存时先确定 `EDP.reportingCompanyId`（默认从员工当前/主合同公司解析），再选实际部门和岗位；候选岗位 = 本部门岗位 + 对该公司和部门启用的 FUN 特殊汇报岗位。选择 FUN 岗位后 `EDP.departmentId` 写实际部门，`EDP.positionReportOverrideId` 指向命中的特殊汇报规则。员工直接上级优先取 `PositionReportOverride.reportToPositionId`；没有命中特殊汇报时，普通岗位取实际组织的负责人岗位，负责人岗位取上级组织的负责人岗位，不回退 `PositionDescription.reportToPositionId`。

服务器旧库处理顺序：
1. 上线前备份数据库，并导出 `PositionDescription` 的旧 `code/name/departmentName/reportTo` 和 `DepartmentDescription` 的旧 `code/name` 作为审计 CSV。
2. 先跑 preflight：检查 `Position.code` 重复、`Position.positionDescriptionId` 多岗位共享、未被岗位引用的孤儿说明书、`reportTo` 无法按岗位编码/名称匹配或匹配多岗位的记录。
3. 旧 `PositionDescription.code/name/departmentName` 与岗位事实冲突时，一律以 `Position` 和 `Department` 为准；旧 `DepartmentDescription.code/name` 与组织事实冲突时，一律以 `Department` 为准；迁移会删除这些说明书列，不做反向覆盖。
4. `reportTo` 可唯一匹配岗位编码或岗位名时回填到 `reportToPositionId`；无法匹配或多匹配的记录上线前人工指定，无法确认则置空，不保留字符串关系。
5. 迁移后复查：说明书不再有身份列，`Position.positionDescriptionId` 唯一，说明书保存请求不接受主数据身份字段，预览与列表均从 FK 主数据派生展示身份信息。

员工详情页只维护员工相关维度：基本信息、雇佣关系、合同、部门岗位、历史记录。部门、岗位作为主数据独立维护，详情页只通过 FK 搜索选择。原 Project / EmployeeProject 已剥离到 Work，HR 不再维护项目入口。

新建员工档案默认同步创建一个 Workspace 账号：账号昵称使用员工姓名，用户名使用姓名拼音生成；同名或重名时追加员工编号/序号保持唯一。员工编号分配必须同时避开 `Employee.employeeId` 和历史 `User.employeeId`，管理员手工绑定账号工号时也必须拒绝绑定到已被其他账号或员工档案占用的工号，保证一个员工编号最多只有一个 Workspace 账号。

员工详情页的合同与部门岗位使用专用卡片布局：

- 合同：拆分为合同概况、首签、续签一、续签二、长期与协议，标识当前合同/历史合同。
- 雇佣关系：维护员工层面的在职、入离职、办公地点、人员类型、职级、职务，并在同页维护合同。
- 部门岗位：只维护员工-部门-岗位关系事实，标识当前岗位/历史岗位，当前岗位工作占比合计必须等于 1。
- 历史记录：读取 `EditHistory`，展示编辑人、编辑时间、实体、版本和字段级变更。

`员工信息表` 下每个 Tab 是一个独立的 `*Tab.tsx` 组件：

| Tab | 组件 | 说明 |
|-----|------|------|
| 员工信息 | GenericTableTab + employeeConfig | 批量维护员工主数据 |
| 雇佣记录 | GenericTableTab + employmentConfig | 批量维护雇佣关系 |
| 员工岗位 | GenericTableTab + edpConfig | 批量维护员工-部门-岗位关系 |
| 合同信息 | GenericTableTab + contractConfig | 批量维护合同信息 |
| 项目 | - | 已剥离到 `@workspace/work`，HR 不再维护入口 |

这些 Tab 共用 Core `usePageDraft` 与 Toolbar `edit-group` 的页面编辑协议；API 请求统一使用 `{ changes: [{ id, field, value }] }`。员工、雇佣关系、部门岗位、合同分别在 HR domain service 中做整批校验和事务写入，不能在前端循环调用旧的行级 PUT。离职联动、当前岗位占比合计和主合同互斥仍由各自领域服务负责。

## 核心组件链

```
roster/page.tsx
  └─ @workspace/hr/ui HRClient
       ├─ EmployeeDirectory (packages/hr/ui/profile/EmployeeDirectory.tsx)
       ├─ DepartmentPositionTab (packages/hr/ui/tabs/DepartmentPositionTab.tsx)
       └─ GenericTableTab (packages/hr/ui/tabs/GenericTableTab.tsx + packages/hr/ui/hooks/useGenericTab.ts)
            ├─ EditableTable (packages/hr/ui/tabs/EditableTable.tsx) — 表格渲染+编辑
       │    ├─ FilterModal (FilterModal.tsx)            — 筛选弹窗
       │    ├─ createGenericEditInputSpec               — 表格编辑字段规格
       │    └─ EntitySearchInput / FilterSearchInput    — 搜索输入
```

## 数据流

1. **tabConfigs.ts** 定义每个 Tab 的字段配置（FieldConfig[]）、FK 映射、API 端点
2. **packages/hr/ui/hooks/useGenericTab.ts** 提供 HR 批量表加载、页面草稿、统一保存、搜索、筛选和审计日志 hook
3. **GenericTableTab.tsx** 消费 hook，渲染表格 + 工具栏 + 弹窗
4. **API 路由** 在 `app/api/modules/hr/roster/` 下；`employees/employments/edps/contracts` 的 base `PUT` 接收统一 change-set envelope，route 只组 command，HR service 负责领域校验和事务写入

默认无搜索/高级筛选的 HR 列表读取必须在 PostgreSQL 先完成计数和分页，再只加载当前页的关系数据；合同列表也必须在数据库内展开 JSON 后分页，不得先 `findMany` 全量员工、雇佣或员工岗位后在 Node 内存分页。需要跨 JSON 合同或组织路径的复杂筛选可以走明确的慢路径，但不能污染打开 Tab 的默认路径。尽调版花名册默认列固定为“姓名、部门、岗位、性别、学历、入职时间”，其他字段由列设置按需开启。

员工详情页的数据流：

1. `GET /api/modules/hr/roster/employee-profiles/[id]` 聚合读取员工、雇佣、合同、部门岗位。
2. 基本信息保存复用 `PUT /api/modules/hr/roster/employees` 的批量 change set。
3. 雇佣关系保存复用 `PUT /api/modules/hr/roster/employments` 的批量 change set；合同、部门岗位继续使用员工详情的整组保存 API。
4. 员工详情页的部门岗位保存走 `PUT /api/modules/hr/roster/employee-profiles/[id]/edps`，按员工整组保存并校验当前岗位工作占比合计为 1。
5. 合同仍读取并写入 `Employment.contracts` JSON，前端沿用 `employmentId * 1000 + index` 的合成合同 ID。

## 考勤绩效工作台

`/work/performance` 由 HR-owned `packages/hr/ui/performance/EmployeePerformanceClient.tsx` 渲染，`/hr/performance` 由 `packages/hr/ui/performance/HrPerformanceClient.tsx` 渲染，route shell 只做鉴权和挂载。员工入口仍位于 Work，但绩效 API、UI 实现和正式记录保持同一 HR owner。页面分三块：

- `考勤`：只读展示 HR 在职口径，包括员工、公司、部门、岗位、人员类型和 `Employment.attendanceType`。V1 不新增打卡事实表。
- `贡献材料`：按二级范围列出工作空间目录。个人范围一人一行；部门范围按 Work 标准组织空间列出 M 体系部门和运营委员会，一空间一行；项目范围一已开启项目空间一行。点击后按 `(targetType, targetId, cycleId)` 读取对应空间材料：周/月展示工作汇报，季度/半年/年度展示期初目标。这里只读，不要求 `work.tasks` 权限。
- `绩效`：展示正式绩效记录和绩效流程单，支持员工自评草稿、提交、直属上级评分、HR 最终评分/等级、通过归档、驳回、撤回、取消和评论。

绩效周期复用 Work 领域 `WorkOkrCycle`，HR 不维护独立周期表。正式记录写入 HR-owned `HrPerformanceReview`，唯一键为 `(employeeId, okrCycleId)`，同一员工同一周期只能存在一份已归档绩效。`okrCycleId` 是逻辑 FK，service 在创建流程和归档时校验周期存在。

绩效流程使用 Platform ApprovalRequest：

1. 员工使用 `hr.performance.submit` 创建自评草稿并提交。
2. 默认第一个审批节点是 `direct_manager`，直属上级来自现有自然上级链 `listDirectManagerUserIds`，该节点可写直属上级评分和评语。
3. 默认第二个审批节点是有 `hr.performance.approve` 的 HR 处理人，该节点可写最终分、等级和 HR 评语。
4. HR 最终通过时才创建 `HrPerformanceReview`，并重新抓取所选周期的 OKR/工作来源生成 `okrSnapshotJson`。归档后的快照不随 Work 后续修改变化。

绩效范围事实统一由 HR-private `performance-audience` 模块维护：在职员工、M 体系及运营委员会部门、已开启项目空间、部门后代和项目成员有效期使用同一口径；dashboard、贡献材料 dossier 与归档快照不得各自重建范围规则。

业务动作注册为 `hr.performance.review.evaluate`，默认流程为“员工自评 → 直属上级评分 → HR 审批归档”。`WorkflowPolicy` 可以覆盖节点配置或显式关闭流程；关闭后停止创建新的多阶段自评流程，存量流程和正式记录继续可读。正式记录仍只能通过 `hrPerformanceApprovalAdapter.commitApprovedPayload` 归档，不能用不完整的自评数据直写正式表。

## Tab 配置 (tabConfigs.ts)

```ts
export interface FieldConfig {
  key: string;          // 字段名
  label: string;        // 显示标签
  type: "text" | "fk" | "boolean" | "date" | "select" | "hidden";
  editable?: boolean;   // 是否可编辑
  hidden?: boolean;     // 是否隐藏
  displayField?: string;// 显示时取的字段路径（点号分隔）
}

export interface TabConfig {
  entityType: string;   // 实体类型名
  modelKey: string;     // Prisma 模型名
  fields: FieldConfig[];
  fkFields?: Record<string, { entity: string; displayField: string }>;
  apiPath: string;      // API 基础路径
}
```

## 搜索模块

通用文本匹配统一走 `@workspace/core/search`，HR 业务语义搜索留在 `@workspace/hr/server` 或 `@workspace/hr/ui`：
- `matchText(text, keyword)` — 文本、拼音全拼、拼音首字母统一匹配
- `searchHrAutocomplete(entity, keyword)` — HR 实体/FK 搜索
- `searchEmployeesForAccountLink(keyword)` — 员工账号关联搜索
- `searchAgentEmployeeDirectory(keyword)` — 智能助手员工目录搜索；keyword 必填，只匹配姓名/工号/别名，精确值优先，最多返回 20 名并补主部门/岗位。调用前必须通过 `hr.roster.read`，模型投影原样保留姓名和工号，不携带电话等非必要个人字段。
- `EntitySearchInput` — HR 实体选择输入，字段展示和搜索面板解耦

## API 路由规范

HR roster API 在 `app/api/modules/hr/roster/` 下，采用统一 CRUD 模板：
- `GET` — 列表（支持 `?keyword=` 搜索，`?company=` 筛选）
- `POST` — 创建（body 为 JSON，含必填字段校验）
- `PUT` — 更新（body 含 `id` + 变更字段）
- `DELETE` — 删除（`?id=` 参数，已对大部分实体禁用）

HR performance API 在 `app/api/modules/hr/performance/` 下：
- `GET /api/modules/hr/performance` — 返回周期选项、考勤 rows、OKR/工作来源 rows、正式绩效 rows、流程 rows 和指标汇总。
- `GET /api/modules/hr/performance/contributions/:audienceType/:audienceId?cycleId=:cycleId` — 读取个人、部门或项目工作空间的只读周期材料。
- `GET /api/modules/hr/performance/reviews/:id` — 读取正式绩效详情和 OKR 快照。
- `GET|POST /api/modules/hr/performance/submissions` — 列表和创建绩效流程草稿。
- `PUT /api/modules/hr/performance/submissions/:id` — 员工/上级/HR 按当前阶段修订 payload。
- `POST /api/modules/hr/performance/submissions/:id/{submit,withdraw,cancel,comment,approve,reject}` — 复用 Platform approval engine。

## Open API

HR 生成资料对外开放 API 使用独立 Open API 注册体系，不复用内部 RBAC `Resource`：

| 能力 | Endpoint | Scope | Runtime parent |
|------|----------|-------|----------------|
| HR 生成资料花名册 | `GET /api/open/v1/hr/generated/roster` | `hr.generated.roster.read` | `hr.roster` |

- 注册源：`packages/platform/open-api-registry.ts` 的 `hr.generated`。
- 控制台：`/settings/api/hr-generated`，进入权限仍是内部 `settings.api`。
- 调用鉴权：`Authorization: Bearer <OpenApiClient secret>` + `OpenApiClientScopeGrant`。
- `runtimeParentResourceKey = "hr.roster"` 只控制模块启停，不继承 `hr.roster` RBAC 授权。

## HR 权限标准

HR 页面、resource policy 和 API contract 使用同一套新 action：

- `hr.entry/read/create/update/delete/grant` — HR L1 入口和普通基础能力。
- `hr.roster.entry/read/create/update/delete/archive/revise/submit/reverse/approve/reject/grant` — 人事基础资料主资源。
- `hr.performance.entry/read/submit/revise/reverse/approve/reject/grant` — 绩效工作台、员工自评、直属上级评分、HR 终评归档。
- `hr.analytics.entry/read/grant` — 人力分析当前只开放查看。
- `hr.roster.generated.entry/read/export/grant` — 花名册生成资料 capability；预览是 `read`，CSV 下载是 `export`。

`archive` 覆盖部门/岗位归档与反归档；审计快照恢复归 `revise`；流程草稿创建、发起审核和再次提交归 `submit`，审批、驳回、撤回分别归 `approve/reject/reverse`。绩效 `read` 控制页面/API 读取，`submit` 控制员工自评流程，`approve/reject` 控制 HR 归档处理；直属上级是否能处理具体单据由流程 adapter 的处理人解析收窄。root identity 是系统硬编码超级管理员，不写入 RBAC resource 授权表。

**权限继承规则**：
- 岗位授权和部门授权也会生效（通过 `PositionResourceActionGrant` / `DepartmentResourceActionGrant`）。
- 非 capability 的上级资源授权向下级资源继承对应 action；下级权限只向上级派生 `entry`，用于菜单和页面入口。
- capability 不吃上级业务 action，必须显式授予自身 action；但进入 capability 前仍要求 owner resource 可进入。
- 前端只做显示控制，API contract 和 service guard 必须做最终权限校验。

**API 权限映射**：
- API 注册源是 `packages/platform/module-registry.ts` 和 `packages/platform/permission-api-action-policy.ts`。
- 普通 CRUD API 默认按注册的 `resourceKey + requiredActions` 校验，不再靠 HTTP 方法硬推 `read/create/update/delete`。
- workflow、归档、恢复、generated export 等路径在 `permission-api-action-policy` 中显式声明 action；serviceDelegated 路径进入 service/adapter 后再按具体业务对象收窄。
- 内部 `/api/modules/hr/**` 必须命中 API contract 并通过 `createApiRouteHandler` / `createCommandRoute` / 已接入 `requireApiAccess` 的 wrapper；外部 `/api/open/v1/hr/**` 只能使用 Open API scope。
