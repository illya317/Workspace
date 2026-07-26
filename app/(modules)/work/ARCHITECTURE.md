# Work Architecture

Work 是工作管理业务域，覆盖项目管理、工作计划，并预留会议管理。

本文件作为兼容入口和索引保留，不再继续承载长篇业务规则。

- 长期业务模式、架构边界、权限设计：`MODULE.md`
- 短期实施计划、待确认问题、路线图：Git 忽略的 `.planning/`

## 核心原则

会议产生事实，项目承载结构，工作计划承载执行。

## 页面壳映射

| Concern | Route shell | Package implementation |
| --- | --- | --- |
| Work 主入口 | `app/(modules)/work/page.tsx` | `packages/work/ui/home/*` |
| 项目管理与项目主页 | `app/(modules)/work/project/page.tsx`, `app/(modules)/work/project/[projectId]/page.tsx` | `packages/work/ui/tabs/ProjectTab.tsx` |
| 个人主页 | `app/(modules)/work/me/page.tsx` | `packages/work/ui/home/WorkPersonalHomePage.tsx` |
| 部门入口与主页 | `app/(modules)/work/department/page.tsx`, `app/(modules)/work/department/[departmentId]/page.tsx` | `packages/work/ui/home/*` |
| 工作空间 | `app/(modules)/work/me/space/page.tsx`, `app/(modules)/work/department/[departmentId]/space/page.tsx`, `app/(modules)/work/project/[projectId]/space/page.tsx` | `packages/work/ui/works/*` |
| 员工绩效入口 | `app/(modules)/work/performance/page.tsx`（重定向 `/hr/performance/self`） | `packages/hr/ui/performance/EmployeePerformanceClient.tsx`（HR owned） |
| KPI 指标库与计分卡 | 工作空间内“指标计分卡”视图（含指标库）；`app/api/modules/work/tasks/kpi/**`, `app/api/modules/work/tasks/plans/[id]/kpi-*` | `packages/work/server/work-kpi-*`, `packages/work/ui/works/WorkKpi*` |
| 会议管理 | `app/(modules)/work/meeting/page.tsx` | `packages/work/ui/meetings/*` |

KPI 的指标定义、周期分配、实际值、评分与结果快照均由 Work 拥有。HR 绩效归档只读取已确认 `WorkKpiResultSnapshot` 并固化到 `workEvidenceSnapshotJson`，不得在 HR 包复制评分规则或实时回算。

个人、部门和项目主页可以由 app shell 组合 Finance 提供的经营分析贡献视图；Work 不直接 import Finance。经营分析模板属于具体工作空间的业务配置并由 Finance 持久化，销售经营分析只是存在销售事实时的系统预置；项目在建立权威销售归集关系前不得套用部门销售数据。

## 经营分析轻代码读模型

Work 只登记自己拥有的公开业务读模型。模板运行时通过版本化 `sourceKey` 选择字段、筛选、分组和聚合，不保存内部 URL，也不能直接查询 Prisma。`sourceKey + version` 是稳定分析契约；公开 DTO 变化时必须同步字段覆盖分类并按兼容性升级版本。

### 来源与范围

| 范围语义 | 来源 |
| --- | --- |
| 当前个人、部门或项目目标空间 | `work.items`, `work.item-evidence`, `work.item-participants`, `work.plans`, `work.plan-approval-snapshot-values`, `work.kpi-definitions`, `work.kpi-definition-scoring-rule-values`, `work.period-collection-cycles`, `work.period-collection-plans`, `work.period-collection-items`, `work.period-collection-overlaps` |
| 当前部门目标空间 | `work.department-collaborations` 及其 `enabling-departments`, `responsible-positions`, `executor-positions`, `plans`, `items` 子来源 |
| 当前项目目标空间 | `work.project-members` |
| 当前查看人原业务页可见集合 | `work.projects`, `work.project-enabling-departments`, `work.project-gantt-projects`, `work.project-gantt-leaders`, `work.meetings`, `work.meeting-participants`, `work.assigned-plan-groups`, `work.assigned-items`, `work.reports`, `work.report-items` |
| 参数绑定的单会议完整事实 | `work.meeting-details`, `work.meeting-detail-participants`, `work.meeting-agenda-items`, `work.meeting-minute-entries`, `work.meeting-proposals`, `work.meeting-proposal-votes`, `work.meeting-decisions`, `work.meeting-action-candidates`；均要求 `meetingId` |
| 参数绑定的单项目存量计划事实 | `work.project-plan-phases`, `work.project-plan-baselines`, `work.project-plan-gantt-items`, `work.project-plan-gantt-owners`, `work.project-plan-dependencies`, `work.project-plan-baseline-items`；均要求 `planProjectId` |
| 参数绑定的单计划 KPI 计分卡 | `work.kpi-scorecard-plans`, `work.kpi-scorecard-assignments`, `work.kpi-scorecard-definitions`, `work.kpi-scorecard-source-assignments`, `work.kpi-scorecard-definition-snapshot-values`, `work.kpi-scorecard-scoring-rule-values`, `work.kpi-scorecard-definition-scoring-rule-values`, `work.kpi-scorecard-evidence-tasks`, `work.kpi-scorecard-latest-results`；均要求 `planId` |
| 参数绑定的单计划 KPI 结果 | `work.kpi-result-summaries`, `work.kpi-result-previews`, `work.kpi-result-work-reports`, `work.kpi-result-definition-snapshot-values`, `work.kpi-result-assignment-snapshot-values`, `work.kpi-result-scoring-rule-values`, `work.kpi-result-evidence-values`；均要求 `planId` |

`target` 表示数据必须属于当前空间；`viewer` 表示只复用当前查看人在原业务页面可见的对象，不能把这些对象伪造成当前部门或项目的数据。承接事项中的 `personal_collaboration` 专指他人个人空间分配给当前查看人的协作，不等同于部门协作事项。

单会议详情不宣称提供跨会议批量分析，也不以 `listMeetings` 的 200 条发现窗口作为授权边界。执行时将必选 `meetingId` 直接交给 `getMeetingDetail`，由原会议对象权限复核；详情参会人和其他嵌套稳定集合均从同一详情 DTO 展平，因此旧会议不会因列表窗口而丢失明细。匿名提案的投票仍严格沿用原详情服务对当前查看人的隐藏结果。

项目阶段、基线和甘特详情将必选 `planProjectId` 直接交给原 `listProjectPlanPhases`、`listProjectPlanBaselines` 或 `listProjectPlanGantt`，不借用当前经营分析页面目标作为项目授权。KPI 计分卡和结果同样把必选 `planId` 直接交给原 `getKpiScorecard` / `prepareKpiResultSubmission` command 链；已归档计划、空计分卡、未填实际值等状态错误保持原接口语义，轻代码不放宽也不另加一层业务限制。

### 权限、口径和上限

- 来源发现只继承原 API contract 的 `resourceKey + read`，来源执行继续调用原 service/route command 的对象可见性；不得增加“看得到业务页但轻代码看不到”的第二套业务白名单。
- 目标空间来源复用 `canViewWorkTaskTarget` 或项目对象权限；查看人来源由原集合服务过滤。会议详情除入口 `work.meetings:read` 外，还必须通过 `getMeetingDetail` 的对象权限。
- 项目计划详情和 KPI 单计划来源是 `viewer` 语义：来源发现继承各自受保护 GET contract，执行分别由项目对象权限或计划目标可见性复核；不得再按当前个人、部门或项目页面目标二次判权。
- 每个公开 DTO 字段必须归类为分析字段、子来源或具名排除项。`permissions`、`actionRuntime`、编辑权限矩阵和动态页面控制属于控制面；重复汇总与兼容别名不得伪造成独立事实。
- 所有展平集合在分页前执行登记行数上限，超限时失败关闭，不能静默截断后给出错误分析。项目甘特图保留原服务解析后的激活基线日期；当前恒空的 `tasks/stages` 不生成虚假行。
- 汇报来源只读取原集合服务返回的已保存汇报及事项，不把未保存草稿候选、动态动作运行态或页面分组别名登记为事实。
