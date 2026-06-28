# Engineering Docs

这里放项目架构、开发规范、CI/check、RBAC、DB、Core UI、部署运行态和 agent 工程工作流。最终用户操作说明不要放在这里。

## 入口

| 主题 | 文档 | Owner |
|---|---|---|
| 项目总览和新鲜度 | `project-overview.md` | Coordinator / Architecture |
| 开工和交接 | `agent-startup.md`, `subagent.md`, `agent-handbook.md` | Coordinator |
| 架构和包边界 | `architecture-governance.md`, `module-boundaries.md` | Architecture |
| Structure 迁移执行 | `level2-agent-execution.md` | Architecture |
| Core UI / Toolbar / reusable components | `core-ui-governance.md`, `core-toolbar.md`, `reusable-components.md` | Architecture / UI-system |
| 新模块和现有模块能力 | `new-module-checklist.md`, `new-domain-template.md`, `existing-module-feature-checklist.md` | Architecture / Feature |
| Schema 和 DB | `schema-governance.md`, `database.md` | Data |
| RBAC 和权限矩阵 | `security/rbac.md`, `security/permission-matrix.md` | Architecture |
| Checks / CI / ops | `checks.md`, `ops/README.md` | Operations |
| Production/QC 数据参考 | `reference/qc-dev-mode.md` | Data |

## 维护规则

- 文档 owner 和同步触发条件以 `../OWNERS.md` 为准。
- 工程规则改动必须同步更新 `docs/README.md` 的入口或 owner。
- 如果某条规则只影响某个业务模块，优先写到模块 `ARCHITECTURE.md` / `MODULE.md`。
- 如果某份文档是历史方案或一次性分析，不要放在这里，放到 `docs/planning/*`。
- 不能为了记录临时计划把工程目录变成第二个代码库；计划进 `docs/planning/*`，长期参考资料进 `docs/reference/*` 并声明 owner。
