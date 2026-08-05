# Engineering Docs

这里放给工程维护者阅读、也可被 agent 按需引用的项目架构、开发规范、CI/check、RBAC、DB、Core UI 和部署运行态。Coding agent 的开工与角色工作流在根 `AGENTS.md` 和 `.agents/skills/workspace-*`；最终用户操作说明不要放在这里。

## 入口

| 主题 | 文档 | Owner |
|---|---|---|
| 项目总览和新鲜度 | `project-overview.md` | Coordinator / Architecture |
| 跨专题工程手册 | `agent-handbook.md` | Coordinator / 各专题 owner |
| 架构和包边界 | `architecture-governance.md`, `module-boundaries.md` | Architecture |
| Structure 迁移执行 | `structure-agent-execution.md` | Architecture |
| Core UI / Toolbar / reusable components | `core-ui-governance.md`, `core-toolbar.md`, `reusable-components.md` | Architecture / UI-system |
| 通用审批链 | `approvals.md` | Platform / Architecture |
| 配置化通知与开放 API | `notification-publishing.md` | Platform / Architecture |
| 业务有效时间与生命周期 | `business-temporal.md` | Architecture / Platform / Data |
| 新模块和现有模块能力 | `new-module-checklist.md`, `new-domain-template.md`, `existing-module-feature-checklist.md` | Architecture / Feature |
| Schema 和 DB | `schema-governance.md`, `database.md` | Data |
| RBAC 和权限矩阵 | `security/rbac.md`, `security/permission-matrix.md` | Architecture |
| Finance 金额来源解释平台决策记录 | `finance-amount-explanation-platform-adr.md` | Architecture / Coordinator |
| Checks / CI / ops | `checks.md`, `ops/README.md` | Operations |
| Production/QC 数据参考 | `reference/qc-dev-mode.md` | Data |
| Docs Editor 模板空间和权限 | `reference/docs-editor-template-spaces.md` | Platform Docs / Feature |
| Docs Editor 外部依赖 | `reference/docs-editor-dependencies.md` | Platform Docs / Feature |

## 维护规则

- 文档 owner 和同步触发条件以 `../OWNERS.md` 为准。
- 工程规则改动必须同步更新 `docs/README.md` 的入口或 owner。
- 如果某条规则只影响某个业务模块，优先写到模块 `ARCHITECTURE.md` / `MODULE.md`。
- 历史方案、一次性分析和临时计划不进入源码，放到 Git 忽略的 `.planning/`；涉及租户事实的证据放到 `WORKSPACE_CONFIG_DIR/audit/`。
- 长期参考资料只有在跨租户、无业务台账且声明 owner 时才能进入 `docs/reference/*`。
