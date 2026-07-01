# Work Module

Work 是工作管理业务域，覆盖项目管理、工作计划，并预留会议管理。本文记录长期稳定的业务模式、架构边界、权限原则和跨 L2 协作规则；短期实施计划放在 `PLAN.md`。

## 业务原则

会议产生事实，项目承载结构，工作计划承载执行。

- 会议管理负责沉淀事实来源：会议记录、总结、决议、指导和行动建议。
- 项目管理负责承载结构化目标：项目、阶段、项目任务、子项目、项目甘特和项目人员。
- 工作计划负责承载执行全集：个人、部门、项目、运营委员会空间里的承诺事项、跟踪、汇报和闭环。

工作计划允许存在没有项目、没有会议来源的日常/临时/琐碎事项。这类事项不是异常数据，不应被强行挂到项目或会议里。

## L2 边界

| L2 | 负责什么 | 不负责什么 |
| --- | --- | --- |
| 项目管理 `work.projects` | 组织项目、项目人员、阶段、项目任务、子项目、项目计划和甘特 | 个人待办全集、周期滚动工作台、会议纪要正文 |
| 工作计划 `work.tasks` | 个人/部门/项目/运营委员会空间的执行事项、来源、负责人、状态、周期和汇报 | 项目结构建模、会议决议正文 |
| 会议管理 `work.meetings` | 会议记录、总结、决议、指导、行动建议和事实来源 | 第三套任务系统、项目计划结构 |

项目任务是项目内计划节点；工作项是执行承诺。项目任务可以生成或关联工作项，但不应自动把所有项目任务变成工作项。

会议决议、指导和纪要不是任务本身。需要执行时，应生成或关联 `WorkItem` / `ProjectTask`。

## 架构边界

- 页面壳：`app/(modules)/work/*`，只做鉴权、导航和组合 package UI；对外 URL 挂在 `/work/*`。
- API 壳：`app/api/modules/work/*`，只做认证、权限、参数读取、调用 Work service、返回 JSON。
- 业务包：`packages/work`，拥有 Work 的 UI、server、types、constants、import 和 module 定义。
- Core/Platform：只提供通用 UI、路由、权限、registry、审计等基础设施，不写 Work 业务规则。

app route 不能新增业务计算、表格实现、hook、Prisma 写入。写入入口必须保持 `Zod schema -> domain validator -> service/Prisma`。

## 页面壳映射

| Concern | Route shell | Package implementation |
| --- | --- | --- |
| 项目管理 | `app/(modules)/work/projects/page.tsx` | `packages/work/ui/tabs/project/*` |
| 工作计划 | `app/(modules)/work/tasks/page.tsx` | `packages/work/ui/works/*` |
| 会议管理 | 待定 | 待定 |

`/work/tasks`、`/work/tasks/personal/:userId`、`/work/tasks/companies/:id`、`/work/tasks/departments/:id`、`/work/tasks/projects/:id` 是同一个工作计划客户端工作台的不同空间视图。`/work/tasks/personal` 仅作为当前登录人的兼容入口，进入后规范化到带 `userId` 的个人空间 URL。空间切换必须保留客户端状态，用 `window.history.pushState/replaceState` 同步 URL，不使用整页 `router.push/replace`、`redirect` 或 `<Link>`。

## 核心数据模型

### 项目管理

- `Project`：项目事实表。通过 `projectType` 区分运营委员会项目、部门项目、其他项目；子项目仍使用同一张表。技术枚举 `company` 保留为组织级项目的存量编码。
- `EmployeeProject`：项目人员/项目角色关联表，承接项目负责人和 RASCI 项目分工。
- `ProjectTask`：项目任务/计划节点。项目拆解、里程碑、baseline、实际起止、负责人和任务 RASCI 都落在任务上；一个任务最多派生一个子项目。
- `ProjectTaskAssignment`：项目任务 RASCI 人员表。
- `ProjectPlanPhase`：项目阶段，表示单项目甘特里的串行阶段。
- `ProjectPlanDependency`：项目计划依赖，当前用于任务到任务的完成-开始前置关系。
- `ProjectPlanBaseline` / `ProjectPlanBaselineItem`：项目计划基线快照及其条目。

`Project` / `EmployeeProject` 表名保留是存量 schema 命名，不代表项目仍归 HR；业务归属是 Work。

### 工作计划

- `WorkItem`：执行事项事实表，承载个人/部门/项目/运营委员会空间中的任务、目标和关键结果。技术 `targetType=company` 保留为运营委员会空间的存量锚点。
- `sourceType`：事项来源，允许 `manual | routine | project | meeting | import`。
- `linkedProjectId` / `linkedProjectPhaseId` / `linkedProjectTaskId`：项目来源的可选关联。
- `parentWorkItemId`：工作项层级关系，服务于执行拆解，不替代项目结构。

`sourceType = manual` 或 `routine` 且无项目/会议关联是合法状态。

### 会议管理

会议管理尚未落库。长期方向是让会议产出可引用事实，而不是重复建设任务系统。

建议模型方向：

- `Meeting`：会议基础信息、类型、时间、权限范围。
- `MeetingRecord` / `MeetingSummary`：记录和总结。
- `MeetingDecision`：决议/决定。
- `MeetingGuidance`：指导/意见。
- `MeetingActionCandidate`：可转为工作项或项目任务的行动建议。
- 通用引用表：把会议事实关联到 `Project`、`ProjectTask` 或 `WorkItem`，避免在目标表上新增大量单值会议字段。

## 项目计划规则

- 项目类型由用户创建时选择，创建后不可修改：运营委员会项目、部门项目、其他项目。
- 运营委员会项目自动编号为 `FH-YY-NN`，例如 `FH-26-01`；部门项目自动编号为 `{Department.code}-YY-NN`，例如 `FUN103-26-01`；其他项目不自动编号，`code = null`。
- 部门项目必须选择主导部门；运营委员会项目、其他项目的主导部门可选。
- 项目级别是项目重要性维度，当前保留普通、重点、特殊；列表和甘特筛选只暴露全部/普通/重点。
- 任务必须归属项目，项目阶段可选；任务可设置 baseline 起止、实际起止、是否里程碑、负责人、RASCI、多个前置任务。
- 未选择阶段的任务在项目甘特里直接显示在项目下，不展示“未分阶段”分组。
- 前置任务必须来自当前项目中用户可见的已有任务；不能选择自己，也不能形成递归循环。
- 若有前置任务，实际开始时间不得早于前置任务实际结束时间。
- 子项目只存 `parentProjectTaskId`，不存 `parentProjectId`；上级项目通过上级任务的 `projectId` 推导。
- 子项目的计划开始、计划结束、实际开始、实际结束全部从上级任务派生；保存请求不得直接写这四个日期，服务端统一返回 `子项目日期由上级任务控制`。
- 已派生子项目的任务仍可编辑日期字段，因为这些日期控制子项目周期；删除该任务、删除或归档包含该任务的上级项目前，必须先处理相关子项目。
- 项目和任务状态统一由实际日期派生：`endDate` 有值为已完成，`startDate` 有值且 `endDate` 为空为进行中，`startDate` 为空为未开始；计划日期不表示已经开始。
- 运营委员会甘特是只读组织视角；项目甘特是单项目视角，用统一 PlanItem 模型展示项目、项目阶段、任务、baseline 和当前线。

## 权限设计

- 每个 L2 必须保持 app route、URL href、resourceKey/RBAC、API guard 一一对应。
- 页面入口使用 `requireRouteAccess("<href>")`。
- API 入口使用 `requireApiAccess(request)` 或接入该 wrapper，从 registry 推导 resource/action。
- 项目管理权限同时受资源权限和项目成员/角色约束影响；服务端必须再次校验项目可见、可编辑、可管理、可删除。
- 工作计划空间权限按个人、部门、项目、运营委员会空间分别判定；空间切换不代表权限继承。
- 会议管理应支持会议类型/会议空间的权限范围，例如核心人员会议只允许授权角色进入。

## 跨 L2 引用

跨 L2 只做引用，不复制事实。

- 项目页可以展示关联工作项状态，但执行状态来自 `WorkItem`。
- 工作计划可以引用项目、项目阶段、项目任务，但不拥有项目结构。
- 会议页可以展示由会议生成或关联的工作项/项目任务状态，但这些状态来自目标模块。
- 会议决议/指导应通过引用表关联到项目、项目任务或工作项；不要在 Project / ProjectTask / WorkItem 上堆多个会议单值字段。

## 文档维护

- 长期业务模式、边界、架构和权限原则维护在本文。
- 短期实施路线、待办、风险和决策记录维护在 `PLAN.md`。
- `ARCHITECTURE.md` 作为兼容入口，只保留索引和极少量总览，不再继续膨胀。
