# Work Plan

本文记录 Work 模块短期演进计划。长期业务模式、边界、架构和权限原则见 `MODULE.md`。

## 当前判断

Work 的长期边界已经确定：

- 会议产生事实。
- 项目承载结构。
- 工作计划承载执行。

短期实施要围绕三块接缝推进：项目任务与工作项、会议事实与执行事项、工作计划的来源表达。

## 近期优先级

### 1. 项目任务与工作项接缝

目标：让项目管理不变成执行系统，同时让项目负责人能看到执行闭环。

- 在项目任务上提供“生成/关联工作项”入口。
- 工作项使用 `sourceType = project`，并设置 `linkedProjectId` / `linkedProjectPhaseId` / `linkedProjectTaskId`。
- 项目任务列表只读展示关联工作项状态、负责人、最近更新时间，不复制执行字段。
- 不自动把所有项目任务生成工作项；由用户在需要执行跟踪时显式创建或关联。

### 2. 工作计划来源表达

目标：工作计划承载执行全集，但来源清楚。

- 工作计划列表显示来源：手工、例行、项目、会议、导入。
- 无项目/无会议来源的 `manual` / `routine` 工作项不提示异常。
- 项目空间只筛选关联项目的工作项；个人工作台默认展示个人相关的全部执行事项。
- 公司/部门/项目/个人空间切换继续保持客户端状态，避免整页导航带来的云端性能问题。

### 3. 会议管理 L2 设计

目标：会议管理成为事实来源，而不是第三套任务系统。

- 先设计会议类型、会议权限范围、会议记录、总结、决议、指导和行动建议。
- 决议/指导可引用到项目、项目任务或工作项。
- 行动建议可以生成或关联工作项/项目任务。
- 会议页展示落地状态时只读目标模块状态，不维护重复状态。

### 4. 通用引用能力

目标：支持会议事实、导入来源、外部文件等作为依据关联到业务对象。

建议方向：

```txt
Reference
  sourceType: meeting_decision | meeting_guidance | meeting_minutes | import_file | external_doc
  sourceId
  targetType: project | project_task | work_item
  targetId
  note
```

是否作为 Work 内部表还是 Platform contract，需要等会议 L2 设计定稿后再决定。

## 已完成基础

- 项目管理从 HR 迁入 Work，URL 挂在 `/work/projects`。
- 工作计划挂在 `/work/tasks`，个人/部门/项目/运营委员会空间共用同一个客户端工作台。
- 工作计划空间切换使用 `window.history.pushState/replaceState`，避免整页导航。
- `Project.projectType` 支持运营委员会项目、部门项目、其他项目。
- 运营委员会项目编号 `FH-YY-NN`，部门项目编号 `{Department.code}-YY-NN`，其他项目不自动编号。
- 子项目仍使用 `Project` 表，通过 `parentProjectTaskId` 关联上级任务。
- 子项目四个日期由上级任务派生。
- 项目阶段可选，甘特不展示“未分阶段”分组。
- `WorkItem.sourceType` 已支持 `manual | routine | project | meeting | import`。

## 待确认问题

- 会议管理是否作为 Work L2：暂定是，但权限范围可能需要更强的会议类型/会议空间模型。
- 通用引用表归属：Work 内部实现还是 Platform 级 contract。
- 项目任务生成工作项时，是否允许一对多；当前倾向允许多个工作项执行同一个项目任务，但需要 UI 避免噪音。
- 工作项与项目任务日期是否需要同步规则；当前倾向不同步，只做引用和状态展示。
- 会议决议生成工作项后，决议状态是否展示为“已落地/部分落地/未落地”；若展示，应由关联目标状态计算，不手写状态。

## 维护规则

- 短期任务完成后，把稳定下来的业务规则迁入 `MODULE.md`。
- `PLAN.md` 只记录下一阶段计划、待确认问题和正在演进的方案。
- 不在 `AGENTS.md` 写长篇业务规则；`AGENTS.md` 只引用 `MODULE.md` / `PLAN.md`。
