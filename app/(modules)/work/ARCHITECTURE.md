# Work Architecture

Work 是工作管理业务域，承接工作计划、项目管理、工作汇报和历史记录。

## 边界

- 页面壳：`app/(modules)/work/*`，只做鉴权、导航和组合 package UI；对外 URL 仍是 `/work/*`。
- 业务包：`packages/work`，拥有自己的 `ui/server/types/constants/import/module`。
- API 壳：`app/api/modules/work/*`，只做认证、权限、参数读取、调用 Work service、返回 JSON。
- HR 不再展示 Project 入口，也不再在 HR 批量表中展示项目员工表。

## 页面壳映射

| Concern | Route shell | Package implementation |
| --- | --- | --- |
| 项目 | `app/(modules)/work/projects/page.tsx` | `packages/work/ui/tabs/project/*` |
| 工作计划 | `app/(modules)/work/tasks/page.tsx` | `packages/work/ui/works/*` |
| 工作汇报 | `app/(modules)/work/reports/page.tsx` | `packages/work/ui/reports/*` |
| 历史记录 | `app/(modules)/work/history/page.tsx` | `packages/work/ui/history/*` |

Work 不保留顶层兼容 route shell；所有页面都挂在 `/work/*` 下。

## 当前数据表

- `Project`：项目事实表。
- `EmployeeProject`：项目人员/项目角色关联表。

表名已经使用 Project / EmployeeProject；若后续要继续重命名字段，需要单独做 migration、历史记录实体名和导入脚本迁移。
