# Work Plan

本文记录 Work 模块短期演进计划。长期业务模式、边界、架构和权限原则见 `MODULE.md`。

## 当前判断

Work 的长期边界已经确定：

- 会议产生事实。
- 项目管理维护项目档案。
- 项目空间、部门空间和个人空间承载执行。

项目不再内建项目任务或子项目。`/work/project` 只做项目库、项目资料和成员维护；具体执行拆解进入 `/work/project/:projectId` 的项目空间，并复用 Work Tasks 工作台。

## 近期优先级

### 1. 项目档案与项目空间接缝

目标：让项目像部门一样拥有空间，但项目管理页不变成执行工作台。

- `/work/project` 保留项目新建、资料维护、成员维护、项目空间开关和甘特视图。
- 项目空间使用 `targetType=project` / `targetId=projectId` 承载计划、工作项、汇报和审批。
- 项目详情中提供进入项目空间的入口，避免用户在项目库里执行具体事项。
- 甘特暂时保留，后续改为引用项目空间中的执行信息。

### 2. 工作计划来源表达

目标：工作计划承载执行全集，但来源清楚。

- 工作计划列表显示来源：部门、项目、会议、其他。
- 无部门/无项目/无会议来源的 `other` 工作项不提示异常；旧 `manual` / `routine` / `import` 写入时归并为 `other`。
- 项目来源只关联项目本身，不再要求选择项目任务。
- 公司/部门/运营委员会/个人/项目空间切换继续保持客户端状态，避免整页导航。

### 3. 会议管理 L2 设计

目标：会议管理成为事实来源，而不是第三套任务系统。

- 先设计会议类型、会议权限范围、会议记录、总结、决议、指导和行动建议。
- 决议/指导可引用到项目或工作项。
- 行动建议可以生成或关联工作项。
- 会议页展示落地状态时只读目标模块状态，不维护重复状态。

### 4. 通用引用能力

目标：支持会议事实、导入来源、外部文件等作为依据关联到业务对象。

建议方向：

```txt
Reference
  sourceType: meeting_decision | meeting_guidance | meeting_minutes | import_file | external_doc
  sourceId
  targetType: project | work_item
  targetId
  note
```

是否作为 Work 内部表还是 Platform contract，需要等会议 L2 设计定稿后再决定。

## 已完成基础

- 项目管理从 HR 迁入 Work，URL 挂在 `/work/project`。
- 工作空间挂在 `/work/me`、`/work/department/:departmentId/space` 和 `/work/project/:projectId/space`；`/work` 是 Work 主入口，展示工作空间、项目管理、会议管理入口卡片。
- 工作计划空间切换使用 `window.history.pushState/replaceState`，避免整页导航。
- `Project.projectType` 支持公司项目、部门项目、其他项目。
- 公司项目编号 `FH-YY-0NN`，其他项目编号 `FH-YY-1NN`，部门项目编号 `{Department.code}-YY-NN`。
- `WorkItem.sourceType` 已支持 `department | project | meeting | other`，部门来源只能选当前用户自己的部门和上级管理部门链。

## 待确认问题

- 会议管理是否作为 Work L2：暂定是，但权限范围可能需要更强的会议类型/会议空间模型。
- 通用引用表归属：Work 内部实现还是 Platform 级 contract。
- 甘特后续从项目空间引用哪些执行信息，以及是否继续保留项目阶段作为单独事实。
- 会议决议生成工作项后，决议状态是否展示为“已落地/部分落地/未落地”；若展示，应由关联目标状态计算，不手写状态。

## 维护规则

- 短期任务完成后，把稳定下来的业务规则迁入 `MODULE.md`。
- `PLAN.md` 只记录下一阶段计划、待确认问题和正在演进的方案。
- 不在 `AGENTS.md` 写长篇业务规则；`AGENTS.md` 只引用 `MODULE.md` / `PLAN.md`。
