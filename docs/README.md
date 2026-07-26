# Docs Index

这里是 Workspace 文档目录。`AGENTS.md` 只做 agent 开工入口和硬红线；详细规范按下面的层级进入，不要把所有规则继续堆回根目录。

## 文档分层

| 层 | 读者 | 位置 | 内容 |
|---|---|---|---|
| Agent Workflow | agent / reviewer / coordinator | `AGENTS.md`, `docs/roles/*`, `docs/engineering/agent-startup.md`, `docs/engineering/subagent.md` | 开工顺序、角色职责、任务拆包、交接格式、review 边界 |
| Docs Ownership | 所有维护文档的人 | `docs/OWNERS.md` | 文档 owner、必须同步文档的触发条件、哪些小改不写文档、stale 归属 |
| Engineering System | 开发 agent / 工程维护者 | `docs/engineering/*` | 项目架构、开发规范、CI/check、RBAC、DB、Core UI、部署运行态 |
| Generated Docs | Data / 工程维护者 | `docs/generated/*` | 由脚本生成的 API / DB / table 文档；不要手工改正文 |
| Product / Module Knowledge | 做具体业务的人 | `app/(modules)/*/ARCHITECTURE.md`, `app/(modules)/*/MODULE.md` | 模块长期业务知识、边界、权限口径、数据语义 |
| User Docs / Operating Docs | 最终用户 / 业务使用者 | `app/(docs)/docs/*`, `docs/product/*` | 使用说明、流程说明、制度文档、业务参考资料 |
| Planning Policy | 规划治理 | `docs/planning/README.md` | 只写规划放置原则；实际计划和回溯不进入 Git |
| Reference | 特殊资料维护者 | `docs/reference/*` | 不属于上述分类的长期参考资料；必须声明 owner 和用途 |

## 先读顺序

1. 所有 agent 先读 `AGENTS.md`。
2. 再读 `docs/engineering/project-overview.md`，确认项目地图、事实来源和文档新鲜度。
3. 按任务进入 `docs/roles/*.md`。
4. 涉及文档同步、归档或 stale 判断时读 `docs/OWNERS.md`。
5. 按角色进入对应工程规范或模块文档。

## 角色入口

| 角色 | 先读 |
|---|---|
| Coordinator / Integrator | `docs/roles/coordinator.md` |
| Architecture | `docs/roles/architecture.md` |
| Feature | `docs/roles/feature.md` |
| Operations | `docs/roles/operations.md` |
| Data | `docs/roles/data.md` |
| Review | `docs/roles/review.md` |
| Hygiene | `docs/roles/hygiene.md` |

角色文档只写该角色需要的上下文。不要把其他角色的执行细节复制回 `AGENTS.md`。

## 工程规范入口

| 主题 | 文档 | Owner |
|---|---|---|
| Agent 项目总览和新鲜度 | `docs/engineering/project-overview.md` | Coordinator / Architecture |
| 开工分流和交接 | `docs/engineering/agent-startup.md`, `docs/engineering/subagent.md`, `docs/engineering/agent-handbook.md` | Coordinator |
| 架构边界和 gate | `docs/engineering/architecture-governance.md`, `docs/engineering/module-boundaries.md` | Architecture |
| Structure 任务包执行 | `docs/engineering/structure-agent-execution.md` | Architecture |
| Core UI 五层治理 | `docs/engineering/core-ui-governance.md` | Architecture / UI-system |
| Core UI 和页面 primitive | `docs/engineering/reusable-components.md` | Architecture / UI-system |
| Core Toolbar 规则 | `docs/engineering/core-toolbar.md` | Architecture / UI-system |
| 移动端页面、表格和横屏策略 | `docs/engineering/mobile-experience.md` | Architecture / UI-system |
| Core / Platform / Apps 迁移归属 | `docs/engineering/core-platform-apps-migration-map.md` | Architecture |
| 新模块接入 | `docs/engineering/new-module-checklist.md`, `docs/engineering/new-domain-template.md` | Architecture |
| 现有模块新增能力 | `docs/engineering/existing-module-feature-checklist.md` | Feature |
| ActionContract | `docs/engineering/action-contracts.md` | Architecture / Platform |
| 业务有效时间与生命周期 | `docs/engineering/business-temporal.md` | Architecture / Platform / Data |
| 通用审批链 | `docs/engineering/approvals.md` | Platform / Architecture |
| 数据库和 schema | `docs/engineering/schema-governance.md`, `docs/engineering/database.md` | Data |
| 生成文档说明 | `docs/generated/README.md`, `docs/generated/*` | Data |
| 权限模型与复查 | `docs/engineering/security/rbac.md`, `docs/engineering/security/permission-matrix.md`, `docs/engineering/security/permission-review.md`, `docs/generated/permission-actions.md` | Architecture |
| 环境、检查与 CI/CD | `docs/engineering/checks.md`, `docs/engineering/ops/README.md`, `docs/engineering/ops/ci-cd.md` | Operations |
| 独立部署单元与数据发布 | `docs/engineering/ops/deploy-units.md`, `docs/engineering/ops/data-releases.md` | Operations / Data |
| Production/QC 数据和 layout 参考 | `docs/engineering/reference/qc-dev-mode.md` | Data |
| Docs Editor 模板空间和权限 | `docs/engineering/reference/docs-editor-template-spaces.md` | Platform Docs / Feature |
| Docs Editor 外部依赖 | `docs/engineering/reference/docs-editor-dependencies.md` | Platform Docs / Feature |

## 产品和用户文档入口

| 主题 | 文档 | Owner |
|---|---|---|
| 产品/用户文档说明 | `docs/product/README.md` | Feature |
| 教育数据来源 | `docs/product/reference/education-data.md` | Data / Feature |
| 财务会计准则参考 | `docs/product/reference/casc/` | Finance Feature / Data |
| 线上文档中心页面 | `app/(docs)/docs/*` | Feature |

`docs/product/*` 明确保留，用来放最终用户、业务使用者或业务资料维护者看的内容。不要把它合并进 `docs/engineering/*`。

## Reference

`docs/reference/*` 是特殊入口，只放不属于 agent workflow、engineering、module knowledge、product docs 或 planning 的长期参考资料。进入这里的文件必须声明 owner、用途和 intended users，不能替代工程规范，不能放临时计划。超过 90 天未被引用时由 Hygiene 发起归档/删除检查。

## 规划和归档

`docs/planning/` 只保留规划治理原则。实际计划和过程记录写入 Git 忽略的 `.planning/`；租户业务、生产核验和数据发布证据写入 `WORKSPACE_CONFIG_DIR/audit/`。

## 文档维护规则

- 新规则优先补到对应 `docs/engineering/*` 专题文档，再在本索引或角色文档挂入口。
- 文档 owner、同步触发条件和 stale 归属以 `docs/OWNERS.md` 为准。
- 业务模块长期知识写在对应 `app/(modules)/*/ARCHITECTURE.md` 或 `MODULE.md`，不要塞进工程规范。
- 给最终用户看的内容进入 `docs/product/*` 或 `app/(docs)/docs/*`，不要和 agent 开发规范混放。
- 执行计划、完成清单和过期记录都不要提交到源码；只把稳定、跨租户适用的原则提炼到权威文档。
- 自动生成文档不要手工改正文，改生成脚本或源数据。
- 删除代码入口时同步删除文档里的旧路径，避免 agent 按旧路径继续开发。
