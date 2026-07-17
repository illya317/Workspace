# Work Architecture

Work 是工作管理业务域，覆盖项目管理、工作计划，并预留会议管理。

本文件作为兼容入口和索引保留，不再继续承载长篇业务规则。

- 长期业务模式、架构边界、权限设计：`MODULE.md`
- 短期实施计划、待确认问题、路线图：`PLAN.md`

## 核心原则

会议产生事实，项目承载结构，工作计划承载执行。

## 页面壳映射

| Concern | Route shell | Package implementation |
| --- | --- | --- |
| Work 主入口 | `app/(modules)/work/page.tsx` | `packages/work/ui/home/*` |
| 项目管理 | `app/(modules)/work/project/page.tsx` | `packages/work/ui/tabs/project/*` |
| 部门主页 | `app/(modules)/work/department/[departmentId]/page.tsx` | `packages/work/ui/home/*` |
| 工作空间 | `app/(modules)/work/me/page.tsx`, `app/(modules)/work/department/[departmentId]/space/page.tsx`, `app/(modules)/work/project/[projectId]/space/page.tsx` | `packages/work/ui/works/*` |
| KPI 指标库与计分卡 | 工作空间内“指标计分卡”和“OKR 设置 / 指标库”视图；`app/api/modules/work/tasks/kpi/**`, `app/api/modules/work/tasks/plans/[id]/kpi-*` | `packages/work/server/work-kpi-*`, `packages/work/ui/works/WorkKpi*` |
| 会议管理 | `app/(modules)/work/meeting/page.tsx` | `packages/work/ui/meetings/*` |

KPI 的指标定义、周期分配、实际值、评分与结果快照均由 Work 拥有。HR 绩效归档只读取已确认 `WorkKpiResultSnapshot` 并固化到 `workEvidenceSnapshotJson`，不得在 HR 包复制评分规则或实时回算。
