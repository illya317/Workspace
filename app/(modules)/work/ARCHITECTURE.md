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
| 项目管理 | `app/(modules)/work/projects/page.tsx` | `packages/work/ui/tabs/project/*` |
| 工作计划 | `app/(modules)/work/tasks/page.tsx` | `packages/work/ui/works/*` |
| 会议管理 | 待定 | 待定 |
