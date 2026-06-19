# Docs Index

这里是 Workspace 文档目录。`AGENTS.md` 只做入口和硬红线；详细规则按角色和专题分层阅读。

## 角色入口

| 角色 | 先读 |
|---|---|
| Architecture | `docs/roles/architecture.md` |
| Feature | `docs/roles/feature.md` |
| Operations | `docs/roles/operations.md` |
| Data | `docs/roles/data.md` |
| Review | `docs/roles/review.md` |

角色文档只写该角色需要的上下文。不要把其他角色的执行细节复制回 `AGENTS.md`。

## 现行规范

| 主题 | 文档 |
|---|---|
| 开工分流 | `docs/agent-startup.md`, `docs/SUBAGENT.md` |
| 架构边界和 gate | `docs/architecture-governance.md`, `docs/module-boundaries.md` |
| Level 2 任务包执行 | `docs/level2-agent-execution.md` |
| Core UI 和页面 primitive | `docs/reusable-components.md` |
| Core / Platform / Apps 迁移归属 | `docs/core-platform-apps-migration-map.md` |
| 新模块接入 | `docs/new-module-checklist.md`, `docs/planning/new-domain-template.md` |
| 现有模块新增能力 | `docs/existing-module-feature-checklist.md` |
| 数据库和 schema | `docs/schema-governance.md`, `docs/database.md` |
| 权限模型 | `docs/security/rbac.md`, `docs/security/permission-matrix.md` |
| 环境和部署 | `docs/ops/environment.md`, `docs/ops/deploy.md` |

## 参考资料

| 类型 | 目录 |
|---|---|
| 自动生成文档 | `docs/generated/` |
| 外部/法规/行业资料 | `docs/reference/` |
| 历史方案和未执行规划 | `docs/planning/`, `docs/plans/` |
| 角色说明 | `docs/roles/` |

`docs/planning/` 和 `docs/plans/` 默认是历史或待评审资料，不是当前架构规范。若内容与现行规范冲突，以“现行规范”表中的文档为准。

## 文档维护规则

- 新规则优先补到对应专题文档，再在本索引或角色文档挂入口。
- 过期执行计划不要留在根目录；确有参考价值时放 `docs/planning/`，并在开头标明历史状态。
- 自动生成文档不要手工改正文，改生成脚本或源数据。
- 删除代码入口时同步删除文档里的旧路径，避免 agent 按旧路径继续开发。
