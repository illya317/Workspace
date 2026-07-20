# Work Module

Work 是工作管理业务域，覆盖项目管理、工作计划，并预留会议管理。本文记录长期稳定的业务模式、架构边界、权限原则和跨 L2 协作规则；短期实施计划放在 `PLAN.md`。

## 业务原则

会议产生事实，项目承载项目档案，工作空间承载执行。

- 会议管理负责沉淀事实来源：会议记录、总结、决议、指导和行动建议。
- 项目管理负责承载项目库：项目资料、项目人员、项目空间开关和项目甘特视图。
- 工作计划负责承载执行全集：个人、部门、运营委员会、公司和项目空间里的承诺事项、跟踪、汇报和闭环。项目可以像部门一样成为工作空间；项目库仍由项目管理维护。

工作计划允许存在没有项目、没有会议来源的日常/临时/琐碎事项。这类事项不是异常数据，不应被强行挂到项目或会议里。

## L2 边界

| L2 | 负责什么 | 不负责什么 |
| --- | --- | --- |
| 项目管理 `work.projects` | 项目库、项目人员、项目资料维护和甘特视图 | 项目空间执行、个人待办全集、周期滚动工作台、会议纪要正文 |
| 工作计划 `work.tasks` | 个人/部门/运营委员会/公司/项目空间的执行事项、来源、负责人、状态、周期和汇报 | 项目结构建模、项目库、会议决议正文 |
| 会议管理 `work.meetings` | 会议记录、总结、决议、指导、行动建议和事实来源 | 第三套任务系统、项目计划结构 |

项目不再内建“项目任务/子项目”执行模型。项目执行拆解统一进入项目空间，落在 `WorkItem` / `WorkPlan` 上。

会议决议、指导和纪要不是任务本身。需要执行时，应生成或关联 `WorkItem`。

甘特图暂时保留为项目时间视图，后续可以引用项目空间里的工作项信息；甘特渲染和时间窗口控制抽在 `packages/work/ui/gantt`，供项目甘特、OKR 执行排期、个人/部门排期等 Work 场景复用。

## 架构边界

- 页面壳：`app/(modules)/work/*`，只做鉴权、导航和组合 package UI；对外 URL 挂在 `/work/*`。
- API 壳：`app/api/modules/work/*`，只做认证、权限、参数读取、调用 Work service、返回 JSON。
- 业务包：`packages/work`，拥有 Work 的 UI、server、types、constants、import 和 module 定义。
- Core/Platform：只提供通用 UI、路由、权限、registry、审计等基础设施，不写 Work 业务规则。

`@workspace/work/server` 根入口只显式暴露当前 route/page 使用的 Work command、查询和必要 schema，不使用 wildcard 把 projects/tasks/meetings 的全部实现合并成公共接口。明确的内部消费者可以使用已有 `@workspace/work/server/*` 深路径；新增 root 导出必须由真实跨模块调用证明。

app route 不能新增业务计算、表格实现、hook、Prisma 写入。写入入口必须保持 `Zod schema -> domain validator -> service/Prisma`。

## 页面壳映射

| Concern | Route shell | Package implementation |
| --- | --- | --- |
| Work 主入口 | `app/(modules)/work/page.tsx` | `packages/work/ui/home/*` |
| 项目管理 | `app/(modules)/work/project/page.tsx` | `packages/work/ui/tabs/project/*` |
| 部门主页 | `app/(modules)/work/department/[departmentId]/page.tsx` | `packages/work/ui/home/*` |
| 工作空间 | `app/(modules)/work/me/page.tsx`, `app/(modules)/work/department/[departmentId]/space/page.tsx`, `app/(modules)/work/project/[projectId]/space/page.tsx` | `packages/work/ui/works/*` |
| 会议管理 | `app/(modules)/work/meeting/page.tsx` | `packages/work/ui/meetings/*` |

`/work` 是 Work 的 L1 主入口，展示工作空间、项目管理、会议管理三个入口卡片。工作空间进入 `/work/me`，并在工作空间内部切换个人、部门和项目工作台；部门短入口 `/work/department` 先展示组织层级总览，点击部门进入 `/work/department/:departmentId` 部门主页，主页里的“查看”进入 `/work/department/:departmentId/space` 工作台；项目管理进入 `/work/project`，只承载项目列表、新建和预留总览，点击项目进入 `/work/project/:projectId`，页内保持“项目总览 / 项目甘特”两个 tab，通过项目总览里的“查看”进入 `/work/project/:projectId/space` 工作台；会议管理进入 `/work/meeting`。组织空间里的运营委员会本身按部门进入，公司空间不作为 Work 页面入口。`/work/meetings` 是兼容旧地址的跳转入口。空间切换必须保留客户端状态，用 `window.history.pushState/replaceState` 同步 URL，不使用整页 `router.push/replace` 或 `<Link>`。

## 核心数据模型

### 项目管理

- `Project`：项目事实表。通过 `projectType` 区分公司项目、部门项目、其他项目。技术枚举 `company` 保留为组织级项目的存量编码。
- `EmployeeProject`：项目人员/项目角色关联表，承接项目负责人和 RASCI 项目分工。
- `ProjectPlanPhase` / `ProjectPlanBaseline`：存量项目甘特兼容模型；不再作为 `/work/project` 的任务编辑入口。

`Project` / `EmployeeProject` 表名保留是存量 schema 命名，不代表项目仍归 HR；业务归属是 Work。
`/work/project` 是项目库和项目组合管理入口，仅用于项目新建、项目列表和总览预留；项目甘特作为 `/work/project/:projectId` 内的独立 tab 展示，项目工作台的工作计划上下文使用 `targetType=project` 和 `targetId=projectId`，并通过 `/work/project/:projectId/space` 与部门空间复用同一套 Work Tasks 工作台。项目工作台的读写权限先由项目自身成员/负责人权限派生，不开放 scoped grant 管理。

### 工作计划

- `WorkItem`：执行事项事实表，承载个人、部门和项目空间中的任务、目标和关键结果；运营委员会按部门空间进入。目标和任务统一使用 `plannedStartDate / plannedEndDate / actualStartDate / actualEndDate`，实际日期不得晚于今日；只有 `status=done` 后才能填写可选的 `actualEndDate`，离开完成状态时同步清空该日期。目标可标记里程碑；KR 是目标下的关键结果定义，目标值与当前值、证据属于同一活动事实的不同字段面，不维护甘特时间，KR 百分比可作为目标进度输入。只有个人空间工作项可以把部门/项目作为 `sourceType` 来源和关联对象，部门空间和项目空间之间不建立互相来源链。项目执行拆解统一落在项目空间的 `WorkItem` 上。技术 `targetType=company/committee` 仅作为存量数据和审批快照兼容，不作为新的 Work 页面入口。
- 工作计划和工作项负责人在个人、部门、项目空间共用同一资格规则：个人空间限本人当前部门，部门空间限当前部门及全部下属部门，项目空间限项目赋能部门及全部下属部门；三类空间均排除当前操作者的递归直属上级。项目赋能部门包含运营委员会时，范围额外包含全部 M 体系组织和董秘办及资本证券部。
- “承接 / 协作”是个人空间的当前用户视图，不在部门或项目空间展示。部门、项目工作项可以指定个人负责人，并进入该负责人的个人承接视图，但不得因此投放到负责人所属部门空间；承接关系允许继续被后续个人工作承接。承接/协作列表只返回实际由当前用户负责的工作项，不展开同计划中未指派给当前用户的其他节点。
- 工作空间顶部的目标、关键结果、子任务和归档统计只计算 `kind=okr` 的计划项；日常任务和常设职责使用独立左栏视图，不进入目标计划统计口径。
- 普通任务状态统一存储为 `active / paused / done`，界面分别展示“进行中 / 已暂停 / 已完成”；常设职责复用同一状态值，只改变展示文案为“生效中 / 已暂停 / 已失效”。工具栏的“进行中 / 已完成 / 已归档”筛选右侧任务表；左侧 OKR 计划导航在计划自身命中或至少一个直属节点命中当前状态时显示，并在切换计划时保留当前状态筛选。任务行操作区按 `archive` 权限提供独立归档/恢复图标。归档只写 `isArchived=true` 作为生命周期分类，不改原执行状态、完成时间或其他任务字段；归档或删除前由 Mutation Impact Planner 统一检查直接子项、跨周期上级/前序引用、两侧 KR 证据、会议行动回链、计划承接、KPI 分配和报告快照，存在业务引用时返回结构化 blocker，报告快照保留并在删除时由数据库解除可空引用。参与人和当前职责引用属于无独立生命周期的 owned detail，只在删除时展示并随根对象级联。恢复还必须满足未完成子项不能回到已完成/已归档父计划或父工作项之下的反向不变量；创建、reparent 和 reopen 会在 Serializable 写事务中重新读取父计划/父项，不能靠事务外校验穿过并发窗口。顶部全局新增按钮只创建普通任务；常设职责维护区使用独立的纯图标新增按钮，任务行和职责行均不提供行内新增按钮。
- `WorkPlan`：工作计划事实表，维护长期/阶段性工作池。`kind=okr` 表示 OKR 周期规划，按 `WorkOkrCycle` 由系统为每个工作空间预留，不通过手工新建/删除维护；时间设置只在相应流程开启时控制提交窗口，不作为计划存在或字段可编辑的条件。有 `archive` 权限时可通过保存按钮右侧的归档图标归档，后续系统周期同步不得自动恢复。OKR 计划只使用年、半年、季度、月四类标准周期，名称由周期统一生成，不提供自定义周期或自定义计划名。计划状态统一为 `active / done`，归档单独使用 `isArchived`；显式完成计划不会代替用户完成直属节点，只要仍有未归档且未完成节点就阻断。自动完成仍只在直属节点从未完成转为完成时重算，且仅在全部未归档直属节点均已完成时触发；普通编辑、新建未完成节点和删除节点不触发重算。归档或删除计划先由服务端返回直属节点影响清单，用户确认后带签名 token 重试原 mutation，并在同一事务中级联；恢复只恢复同一 archive 批次实际归档、仍属于该计划且 revision 未变化的节点，缺失或被再次修改的节点会阻断恢复。日期统一使用 `plannedStartDate / plannedEndDate / actualStartDate / actualEndDate`，并执行与任务、项目相同的完成/日期规则。`kind=routine` 是系统预留的日常事项容器，不通过新建入口创建；工作台左栏固定置顶一个“常设职责”维护入口，并将每条 `routineTaskType=task` 普通任务直接平铺成独立导航行，点击后右侧只展示该任务。普通任务不与目标计划或常设职责混排，可选引用同计划中生效的常设职责作为父项，不引用时作为独立任务；周期、执行时间和计划/实际时间均为可选。OKR 计划包通过 `WorkPlanAlignment` 承接上级周期的计划、目标或 KR；计划包不选择部门/项目来源，不挂项目任务。
- `WorkPlanAlignment`：OKR 计划包对齐来源事实表。`relationKind=decompose` 表示本计划包由上级周期的计划、O 或 KR 拆解而来；O/KR 自身不再作为主承接入口，只保留贡献/前序关系用于解释和历史兼容。
- `WorkKpiDefinition`：长期 KPI 指标定义；同一 `code` 通过递增 `version` 修订，已生效版本不原地覆盖。归口部门负责维护名称、单位、方向和封闭线性评分规则。
- `WorkKpiAssignment`：周期 KPI 计分卡分配事实，同时绑定计划和承载该 KPI 的 KR 工作项；权重、目标值、定义版本和评分规则均在分配时固化。单独归档/删除该工作项会被阻断；删除计划时无结果快照且无后续承接的分配随计划确认级联，已有结果快照或被后续分配承接时阻断，不能依赖数据库 `Cascade/SetNull` 静默丢失绩效事实。
- `WorkKpiResultSnapshot`：KPI 结果的 append-only 确认事实，固化实际值、计算分、确认分、调分原因、定义/分配/规则/任务证据快照和批准人；更正通过 `previousSnapshotId + version` 追加，不覆盖历史。
- `WorkOkrCycle`：工作周期事实表，统一维护年、半年、季度、月、周的固定起止日期和父子关系。
- 周期收纳不写入 `WorkOkrCycle.parentId`，也不建立唯一上级周期；`/api/modules/work/tasks/period-collection` 是只读 read model，按 `@workspace/platform/calendar` 的中国工作日口径计算当前周期与更小粒度周期的工作日交集，决定计划和 O/KR 在哪些周期视图中展示。业务承接仍由 `WorkPlanAlignment` 和 `WorkItem.parentPeriodWorkItemId` 显式表达。
- `WorkOkrControlPolicy`：OKR 提交窗口配置，按周期和 `global/company/committee/department` 范围维护目标与结果的时间规则；不允许建立 personal 管控范围。全局设置与范围策略使用独立递增版本和 append-only revision。它只在当前所选目标或结果动作进入 workflow 模式时限制“何时可提交”，不决定计划是否存在，也不决定目标、任务、KR、实际值或结果字段是否可编辑；流程关闭或时间管控停用时保留配置但不执行。
- OKR 活动事实按 `target / execution / result` 三个事实面治理，不按“编制期 / 执行期 / 结果期”切换整张表。具备目标空间 `update` 权限且计划未归档时，流程关闭即允许维护三个事实面；`status=done`、周期日期和 legacy `okrStage` 均不得成为字段锁。流程开启时，只有对应事实面的在途 `ApprovalRequest` 使该事实面只读，其他事实面仍按权限维护。
- 四类最终动作由确认事实选择：目标未确认时使用目标申报，已确认后使用目标修订；结果未确认时使用结果申报，已有结果确认事实后使用结果更正。调用方不得依据 `okrStage` 选择动作。同一表单只暴露一个最终动作：流程关闭时显示“保存”并直接提交业务事实，流程开启时显示相应的“提交”或“修订”，两种模式复用同一 validator/commit。
- 无在途申请时，所有计划读取当前有效 `WorkflowPolicy`；已有申请继续使用申请中冻结的 action、policy、control 和 payload 快照。`WorkPlan` 上的历史治理快照与 `WorkPlanGovernanceEvent` 只保留审计用途，不要求先做计划治理迁移才能响应全局开关。
- `WorkPlan.status=active/done` 只表示工作生命周期，done→active 不迁移事实面或治理阶段；归档才是整张计划的全局只读条件。`okrStage` 第一阶段仅作历史兼容和诊断，不参与权限、按钮、提交窗口或完成状态判断。页面分别展示生命周期 badge 与治理 badge；流程关闭时明确显示“流程关闭”，不再向用户展示“编制期 / 执行期”作为不可编辑原因。
- `WorkReport` / `WorkReportItem`：工作空间的周期汇报快照。周报、月报属于工作记录，不走目标考核流程、不锁定；同一空间、周期和汇报阶段只保留一份快照，重复保存覆盖当前快照，`submittedBy` 只记录最后保存或提交人，不参与报告身份。汇报周期导航中，月报从 `2026-01` 起展示，周报从 `2026-07-06` 所在周起展示。汇报按“目标 / 关键结果 / 本期完成情况 / 下期计划”聚合，并收纳适用于本期的日常职责；周报/月报的未完成任务按开始时间进入下期计划，已有实际开始时间时以实际开始为准，否则以计划开始为准，开始时间不得晚于下一个汇报周期的结束日；任务进入开始周期后持续顺延到后续下期计划，直到标记完成。完成任务仅在实际结束日期落入本期时进入本期完成情况。保存时固化目标与关键结果归属、任务状态、实际完成时间和计划开始/结束时间，后续修改工作计划不反写历史快照。
- `sourceType`：工作项来源，允许 `department | project | meeting | other`。`department` / `project` 只允许个人空间工作项使用；`department` 只能引用当前用户自己的部门和上级管理部门链，不包含治理组织。
- `linkedProjectId`：个人工作项项目来源的关联；`linkedProjectPhaseId` 作为阶段级项目来源。
- `sourceDepartmentId`：个人工作项部门来源的可选关联。
- `parentWorkItemId`：工作项层级关系，服务于执行拆解，不替代项目结构。
- `WorkResponsibilityReference`：WorkItem 到岗位职责的版本化引用快照。OKR 计划包及其中的 O/KR/任务前端不再展示或写入关联岗位/职责；直接职责引用只用于常设职责，普通任务通过可选父项继承该责任语义。存量目标/任务引用继续作为历史快照读取，不因前端收口删除事实。
- `PositionResponsibilityNode`：HR 岗位说明书职责节点索引，来自 `PositionDescription.details.duties`，提供稳定 `nodeKey`。Work 引用必须保存 `PositionDescription.version/updatedAt`、职责节点 key、路径、标题和内容快照，避免岗位说明书后续编辑导致历史 OKR/任务引用漂移。
- `DepartmentCollaboration`：部门间可重复使用的轻量协作协议。部门层只维护负责部门、赋能部门及接受/拒绝；岗位层分别多选负责岗位和执行岗位。只有负责岗位的当前在岗人员可以查看并引用该协作，赋能部门接受后，关联计划/任务的负责人候选只来自执行岗位的当前在岗人员。岗位成员随 EDP 当前任职动态解析，不固化人员快照。创建和选中详情复用同一表单，负责方可再次编辑；创建与更新都走同一通用审批 action，默认零节点时直接生效。修改赋能部门或执行岗位前会校验已关联计划/任务负责人，禁止把现有负责人留在新的有效执行岗位范围之外。当前前端只维护类型、摘要、生效期和岗位通道，扩展约定字段保留在后端但暂不展示。

`sourceType = other` 且无项目/部门/会议关联是合法状态；旧 `manual` / `routine` / `import` 来源写入时归并为 `other`。

### 会议管理

会议管理尚未落库。长期方向是让会议产出可引用事实，而不是重复建设任务系统。

建议模型方向：

- `Meeting`：会议基础信息、类型、时间、权限范围。
- `MeetingRecord` / `MeetingSummary`：记录和总结。
- `MeetingDecision`：决议/决定。
- `MeetingGuidance`：指导/意见。
- `MeetingActionCandidate`：可转为工作项的行动建议。
- 通用引用表：把会议事实关联到 `Project` 或 `WorkItem`，避免在目标表上新增大量单值会议字段。

## 项目计划规则

- 项目类型由用户创建时选择，创建后不可修改：公司项目、部门项目、其他项目。
- 公司项目自动编号为 `FH-YY-0NN`，例如 `FH-26-001`；其他项目使用同一公司项目池的 `1xx` 号段，例如 `FH-26-101`；部门项目自动编号为 `{Department.code}-YY-NN`，例如 `FUN103-26-01`。
- `leadingDepartmentId` 是单一归口/牵头部门，承担部门项目编号、项目空间归属、可见性和 OKR 管控锚点；赋能部门只由 `ProjectEnablingDepartment` 多值关系表达，没有第一项或主赋能部门语义。
- 项目必须选择赋能部门；部门项目必须选择一个归口部门；公司项目归口部门由系统归到运营委员会；项目空间需要在项目资料中显式开启。
- 具备 `work.projects` 入口的在职员工可以发起项目并自由选择有效赋能部门，不要求发起人拥有所选部门的项目空间权限。提交后系统向每个赋能部门的负责人发送确认待办；所有解析出的负责人会签通过前不创建正式 `Project`，通过后一次性创建项目、赋能部门关系和项目人员。任一赋能部门未配置负责人时禁止提交。
- 项目负责人和 RASC 项目人员可从所选赋能部门及其全部下属部门中选择，并排除当前操作者的递归直属上级；赋能部门包含运营委员会时，候选范围扩展为运营委员会、全部 M 体系组织和董秘办及资本证券部，不包含其他 G 体系治理组织。
- 项目设置保存新增 RASCI 成员或调整成员职责后，系统向该成员发送待处理通知，文案包含邀请人、项目和当前 RASCI 职责；通知可直达项目总览。
- RASCI 成员关系在邀请发出时建立，并以未处理通知标记“待确认”。成员接受后转为已确认；成员拒绝等价于主动退出项目，服务端必须校验通知与当前用户员工身份一致，并在同一事务中删除本人 `EmployeeProject`、记录历史并收口同一项目的未处理邀请。
- 项目级别是项目重要性维度，当前保留普通、重点、特殊；列表和甘特筛选只暴露全部/普通/重点。
- 项目不再从项目任务派生子项目，也不在项目详情中维护项目任务。
- 项目归档/删除由同一 Mutation Impact Planner 检查：仍被 `WorkPlan` / `WorkItem` 或项目阶段引用时阻断；项目成员、赋能部门、阶段、依赖、基线和项目任务责任人属于项目自有技术明细，删除根项目时按数据库所有权在同一事务中自动级联并记入影响批次。项目完成状态没有权威的 Work 引用聚合关系，不能根据 `linkedProjectId` 推断或级联完成。
- 项目显式存储 `status=pending / active / done`，不再由日期反推状态。项目执行日期与 Work 统一使用 `plannedStartDate / plannedEndDate / actualStartDate / actualEndDate`；实际日期不得晚于今日，只有选择 `done` 后才能填写可选的 `actualEndDate`，离开 `done` 时同步清空该日期。项目阶段和计划基线只表达计划日期，使用 `plannedStartDate / plannedEndDate`。
- 运营委员会甘特是只读组织视角；项目甘特暂时保留单项目视角，后续改为引用项目空间里的执行信息。

## 权限设计

- 每个 L2 必须保持 app route、URL href、resourceKey/RBAC、API guard 一一对应。
- 页面入口使用 `requireRouteAccess("<href>")`。
- API 入口使用 `requireApiAccess(request)` 或接入该 wrapper，从 registry 推导 resource/action。

### Work Agent 试点入口

- `/work` 是移动端优先的统一 Agent 入口；`/work/me`、`/work/project`、`/work/meeting`、`/work/performance` 继续作为结构化事实、完整编辑和流程状态入口，不复制为另一套 Agent 业务协议。
- Work Agent 读取工作空间时复用 `work.tasks` 入口能力和各目标空间的 scoped permission。选择虚拟执行身份时，只返回请求人与执行身份共同具备 `read` 的空间，并取双方动作权限交集。
- Work Agent 可以读取个人、部门和项目空间的计划与工作节点明细，并为目标、KR、任务的新建或修改生成 proposal。用户确认后必须重新校验全局 Agent action ceiling、请求人与执行身份的 scoped `create/update` 权限；修改还要校验 `updatedAt` 快照，再复用网页端 WorkItem command、domain validator、审批策略和 service。删除与归档不属于本试点写入范围。
- `/work` 当前固定使用本人助手，不展示仅具备源码/PR 能力的通用虚拟执行身份；其他页面助手仍可按其上下文切换有效身份。
- 本人绩效材料仍由 HR 的 `hr.performance` service 与周期档案模型提供；Agent 只读取当前登录用户本人材料。绩效自评写入必须生成 proposal，用户确认后再次校验 `hr.performance.read + submit`、本人身份、流程状态和版本，再复用现有 HR 绩效草稿与提交流程。
- Agent 没有权限时 `/work` 不展示可发送的输入框，只保留当前用户原本有权进入的结构化 Work 入口，避免页面能力与 API guard 不一致。

| 资源 | 状态 | 支持 action | 说明 |
| --- | --- | --- | --- |
| `work` | container | `entry`, `read`, `create`, `update`, `delete`, `grant` | 工作管理 L1 入口 |
| `work.projects` | business / space entry | `entry`, `read`, `create`, `update`, `delete`, `revise`, `submit`, `approve`, `reject`, `grant` | root 只直接授予 `entry`；项目新建使用 `submit/approve/reject` 的赋能部门确认流程，正式项目、成员和甘特动作由空间派生资源承载 |
| `work.tasks` | business / space entry | `entry`, `read`, `create`, `update`, `delete`, `archive`, `revise`, `submit`, `reverse`, `approve`, `reject`, `grant` | root 只直接授予 `entry`；工作项、OKR 计划、目标考核表和审批动作由空间派生资源承载 |
| `work.meetings` | business | `entry`, `read`, `create`, `update`, `delete`, `submit`, `approve`, `grant` | 会议事实来源，当前仍按对象服务继续收窄 |

- 项目管理权限同时受资源权限和项目成员/角色约束影响；项目工作台额外支持 `project:{projectId}` 的任务空间授权，服务端必须再次校验项目可见、可编辑、可管理、可删除。
- 工作计划空间权限按个人、部门和项目空间分别判定；项目空间的任务权限使用 `space.project.tasks` 作用域，可与项目成员/负责人权限叠加；运营委员会按部门 ID 进入部门空间，公司不作为 Work 页面空间。项目来源工作项通过 `linkedProjectId` 关联项目对象，空间切换不代表权限继承。
- 会议管理使用 `work.meetings.create` 控制会议创建，`work.meetings.update/delete` 控制会议编辑和删除，`work.meetings.submit` 控制参会投票提交，`work.meetings.approve` 控制关闭表决；会议对象可见、可编辑、可管理仍由会议参与角色继续收窄。
- 项目管理 L2 `work.projects` 承载入口和项目新建提交；正式项目创建完成后，项目、项目成员和甘特兼容动作由归口部门对应的目标标准业务空间派生 resource/scoped action grant 控制。
- 工作计划 L2 `work.tasks` 承载入口和普通 L2 权限；组织空间内的工作项和工作计划创建/编辑/删除由目标任务空间的派生 resource/scoped action grant 控制。空间授权配置由目标空间 scoped `grant` 或 root identity 控制，业务 `manager` 不代表授权管理。
- Work UI 当前只枚举 personal、department 和 project 空间；运营委员会由 `Department` 实例进入 `space.department.*`。`space.committee.*` / `space.company.*` 派生资源仅保留给存量授权、审批快照和非 Work 页面能力兼容，不再作为 Work 标准空间入口。项目空间使用 `space.project.*` 派生资源，空间授权只派生对应 L2 的 `entry`，不反向派生 L2 root 的 `update/delete/approve`。
- Work 工作台一级导航按计划、目标考核、工作汇报、时间设置分组。负责、承接、协作和甘特图属于计划子视图；期初目标和指标计分卡属于目标考核子视图，指标库直接并入指标计分卡页面；周报、月报和考核结果属于工作汇报子视图；时间设置直接承载管控规则。
- 指标定义版本允许按归口部门 `delete` 权限删除，但周期计分卡已经引用的版本必须通过统一 delete guard 阻断；状态本身不是删除条件，草稿、生效和停用版本只要未被引用都可删除。
- UI 上页面级的新建入口保留在工具栏，例如工作空间统一的“新建工作计划 / 任务”；列表或区块专属的新建入口放在对应标题行。点击后新建表单在关联内容上方展开，表格记录编辑在原行内展开。多行快速新增和周期排程单元格新建作为显式声明变种保留。单条编辑、删除、归档和审批动作必须贴近具体项目、阶段、任务、工作项或审批单。

### 工作计划审批与 OKR 绩效

组织空间普通工作节点的新建/修改默认按 `create/update` 权限直接写入；管理员可以分别对 `work.tasks.item.create` / `work.tasks.item.update` 显式接入通用审批链，平台规则见 `docs/engineering/approvals.md`。目标治理按 8 个流程拆开：部门/个人的目标申报、目标修订、结果申报和结果更正。项目空间参与目标考核，但不新增独立项目流程族；部门项目按赋能部门解析管控空间，公司项目按运营委员会解析，其他项目按公司空间解析。第一次目标确认记录目标确认事实；后续修改在流程关闭时直接保存，在流程开启时自动选择目标修订动作，确认不把整张计划永久锁死。目标考核表按 `targetType + targetId + periodType + periodStart + reportStage` 保存周期快照，内容来自同空间未结束目标计划和日常工作细项。

- personal、department、company、committee 都不形成独立流程配置入口；流程策略统一按 base `businessActionKey` 维护，空间仍可作为权限台账和流程台账的上下文。
- 新的组织空间审批使用部门空间派生资源 `space.department.tasks`，并通过 `projection: "space"` 计算 `submit` / `approve`；运营委员会按其部门 ID 处理。审批单始终写 base action key，`space.committee.tasks` / `space.company.tasks` 只保留权限与历史 scope 解析语义。
- `work.tasks.item.create/update` 必须出现在流程设置中：关闭或未设置时按空间 `create/update` 权限直接保存，显式接入流程后才展示提交审核并创建 `ApprovalRequest`；UI 和服务端都读取同一有效策略，不允许隐藏运行时默认值绕过管理员配置。
- `submit` 用户可以创建草稿、提交、撤回、修订、取消自己的审批单，但不能因此直接写正式 `WorkItem`。
- `approve` 用户可以审核修改、同意、驳回；同意后复用 WorkItem create/update validator 和 service 写入正式数据。
- 被驳回审批单不新建链条，发起人在同一审批单上 `revise + submit`，事件链持续追加。
- Work task submissions API 挂在 `/api/modules/work/tasks/submissions`，route 只做认证、请求形状和 service 调用。
- 目标确认是特殊绩效审批：个人空间可以承载个人重点计划，必要时作为个人目标发起，但个人目标不是每名员工的必填绩效主线；审批归属和流程上下文解析到员工当前所属部门。部门目标使用部门自身；运营委员会使用其部门 ID。审批单必须固化 workspace target、control scope 和计划快照，避免调岗或活动事实修改影响历史申请。
- KR 完成事实归入考核结果申报，不再作为独立 KR 核查流程。结果确认完成后生成不可变结果快照，活动事实继续表达当前值；流程开启时后续修改自动选择 `work.tasks.goal.department.report.correct` / `work.tasks.goal.personal.report.correct`，且只有对应在途申请锁定 result 面，流程关闭时直接保存并追加新版本快照。
- 账户收件箱把 Work 流程明确拆为“我收到的”和“我发起的”：前者只聚合当前用户可处理的流程单并保留就地审批，后者直接列出本人提交的审批单；两边都可跳回目标 Work 空间。真实审批归属仍落在部门空间，运营委员会按部门处理，不让 personal 空间形成独立流程配置入口。
- root admin 只管理流程设置和台账，不自动成为 Work 业务审批人。动态 Work 待办来自 `submitted` 审批单投影，不是可删除通知；只能通过流程动作结束。
- 八个目标/结果动作分别读取当前流程策略：关闭时，具备对应 `update` 权限的操作者复用同一 domain validator 和 commit 直接写入，不创建伪审批单；开启时才创建或推进 `ApprovalRequest`，OKR 时间设置也只约束该 workflow 提交。审批通过后的 command 必须保留 `workflow-approved` 标记，避免正式写入再次触发同一流程。
- `提交部门协作` 同样允许关闭；关闭后创建和修改都按负责部门的 `work.tasks:update` 权限复用协作 validator 与 commit 直接写入，不创建 `ApprovalRequest`。
- 员工侧绩效评审入口挂在 `/work/performance`，但由 HR-owned `EmployeePerformanceClient` 挂载；HR 汇总只读与终评处理入口挂在 `/hr/performance`。两个入口可以分别演进，但绩效 API、编辑状态和正式记录统一归 HR，Work 包不直接调用 HR API。HR 的 `hr.performance` resource 继续控制归档和终审能力，跨入口复用的周期材料布局只放在 Platform render contract。
- 员工所属部门优先取当前有效主岗位；没有主岗位但只有一个有效部门时使用该部门；多部门无法判断时禁止提交。
- 部门绩效看组织目标/KR、重点项目、目标考核表和协同结果；个人绩效看个人 owner/参与的工作项、岗位职责履行和评价证据。个人绩效材料可以来自 department、project、personal 空间，不要求先复制成个人 OKR。
- 部门目标和个人目标本轮使用独立 business action key；个人流程仍可按管控部门投影审批，不让 personal 空间直接进入组织流程配置。
- 目标考核表按周期保存和汇总；结果确认动作完成后生成 append-only KR/任务完成快照，更正只追加新版本。绩效归档后如发生修订，HR 绩效页只读提示差异，不自动覆盖归档快照。

## 跨 L2 引用

跨 L2 只做引用，不复制事实。

- 项目页可以展示关联工作项状态，但执行状态来自 `WorkItem`。
- 工作计划可以引用项目，但不拥有项目结构。
- 会议页可以展示由会议生成或关联的工作项状态，但这些状态来自目标模块。
- 会议决议/指导应通过引用表关联到项目或工作项；不要在 Project / WorkItem 上堆多个会议单值字段。

## 工作台刷新与滚动稳定性

工作空间页面会把工作计划表单、按目标拆解表格、时间安排矩阵等大块内容放在同一个纵向滚动上下文里。新建、编辑、删除这类同页 mutation 成功后，不应把整块表格或矩阵临时替换成 loading/empty 状态；只要目标空间和计划没有切换，优先使用本地合并或静默刷新，避免浏览器因大块 DOM 高度变化触发滚动锚点修正，把视口带回工作计划表单附近。

调试这类“保存/删除后跳到固定位置”的问题时，先检查是否有 effect 被无关状态带动重跑，以及目标区域是否短暂塌缩为 loading。典型坑是 `useFeedback()` 的 context value 会随 toast 状态变化而变更；业务回调和 effect 依赖应解构稳定函数，例如 `notify`、`confirmDelete`，不要依赖整个 feedback 对象，否则一次 toast 可能重建加载回调并触发重新拉取。

Core 的 `DataTable`、`BodySurface` 和通用弹窗不承担 Work 业务刷新策略。除非能证明 Core 控件主动调用了 `scrollIntoView`、`focus` 或路由跳转，否则不要用 scroll restore、scroll lock 或 Core 表格补丁掩盖问题，应回到 Work 工作台的加载状态和依赖身份稳定性上修。

## 文档维护

- 长期业务模式、边界、架构和权限原则维护在本文。
- 短期实施路线、待办、风险和决策记录维护在 `PLAN.md`。
- `ARCHITECTURE.md` 作为兼容入口，只保留索引和极少量总览，不再继续膨胀。
