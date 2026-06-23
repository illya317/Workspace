# Work Architecture

Work 是工作管理业务域，承接工作计划和项目管理。

## 边界

- 页面壳：`app/(modules)/work/*`，只做鉴权、导航和组合 package UI；对外 URL 仍是 `/work/*`。
- 业务包：`packages/work`，拥有自己的 `ui/server/types/constants/import/module`。
- API 壳：`app/api/modules/work/*`，只做认证、权限、参数读取、调用 Work service、返回 JSON。
- HR 不再展示 Project 入口，也不再在 HR 批量表中展示项目员工表。

## 页面壳映射

| Concern | Route shell | Package implementation |
| --- | --- | --- |
| 项目管理 | `app/(modules)/work/projects/page.tsx` | `packages/work/ui/tabs/project/*` |
| 工作计划 | `app/(modules)/work/tasks/page.tsx` | `packages/work/ui/works/*` |

Work 不保留顶层兼容 route shell；所有页面都挂在 `/work/*` 下。

## L2 入口口径

- `work.tasks` / `/work/tasks`：工作计划，承接个人计划、待办任务和执行跟踪。
- `work.projects` / `/work/projects`：项目管理，承接组织项目、项目人员、项目计划、项目甘特和公司甘特；不处理个人计划。
- 旧工作汇报与独立历史入口已废弃；Work 不再维护独立汇报/历史入口。

当前没有为 Work 的每个 L2 单独维护 `ARCHITECTURE.md`；Work 先使用这份 L1 文档记录 L2 边界。若某个 L2 继续膨胀到独立领域，再在对应 route/package 子目录下补 L2 文档。

## 项目管理数据模型

- `Project`：项目事实表。
- `EmployeeProject`：项目人员/项目角色关联表，承接项目负责人和 RASCI 项目分工。
- `ProjectTask`：项目任务/计划节点。原“子项目”概念不再作为一等实体；项目拆解、里程碑、baseline、实际起止、负责人和任务 RASCI 都落在任务上。
- `ProjectTaskAssignment`：项目任务 RASCI 人员表。
- `ProjectPlanPhase`：项目计划阶段，表示单项目甘特里的串行阶段。
- `ProjectPlanDependency`：项目计划依赖，当前用于任务到任务的完成-开始前置关系。
- `ProjectPlanBaseline` / `ProjectPlanBaselineItem`：项目计划基线快照及其条目。

`Project` / `EmployeeProject` 表名保留是存量 schema 命名，不代表项目仍归 HR；业务归属是 Work。

## 项目计划规则

- 项目类型字段已从 UI 语义移除；项目类型由数据关系推导，不再由用户选择。基础信息中展示项目负责人。
- 项目级别是项目重要性维度，当前保留普通、重点、特殊；列表和甘特筛选只暴露全部/普通/重点。
- 任务必须归属项目，可选归属计划阶段；任务可设置 baseline 起止、实际起止、是否里程碑、负责人、RASCI、多个前置任务。
- 前置任务必须来自当前项目中用户可见的已有任务；不能选择自己，也不能形成递归循环。若有前置任务，实际开始时间不得早于前置任务实际结束时间。
- 公司甘特是只读组织视角；项目甘特是单项目视角，用统一 PlanItem 模型展示项目、计划阶段、任务、baseline 和当前线。
