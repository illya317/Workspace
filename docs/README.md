# Docs Index

这里是给人阅读和共同维护的 Workspace 文档目录。Coding agent 的 always-on 入口是 `AGENTS.md`，角色工作流是 `.agents/skills/workspace-*`；不要再把角色流程写回 `docs/`。

## 受众边界

| 受众 | 真源 | 说明 |
|---|---|---|
| 最终用户 / 业务人员 | `docs/product/*`, `app/(modules)/docs/*` | 使用说明、制度、流程和业务参考资料 |
| 工程维护者 | `docs/engineering/*`, 模块 `ARCHITECTURE.md` / `MODULE.md` | 人和 agent 都可按需引用的架构、数据、权限、检查和运行事实 |
| Coding agents | `AGENTS.md`, `.agents/skills/workspace-*` | 开工红线、角色选择、执行边界和 review 流程；不发布到产品文档中心 |
| Workspace 运行时 Agent | `docs/generated/agent-doc-catalog.md`、白名单产品文档及结构化 API | 通过线上受保护接口读取；不等同于 coding-agent skills |

## 文档分层

| 层 | 读者 | 位置 | 内容 |
|---|---|---|---|
| Docs Ownership | 所有维护文档的人 | `docs/OWNERS.md` | 文档 owner、必须同步文档的触发条件、哪些小改不写文档、stale 归属 |
| Engineering System | 工程维护者 / 按需引用的 agent | `docs/engineering/*` | 项目架构、开发规范、CI/check、RBAC、DB、Core UI、部署运行态 |
| Generated Docs | Data / 工程维护者 | `docs/generated/*` | 由脚本生成的 API / DB / table 文档；不要手工改正文 |
| Product / Module Knowledge | 做具体业务的人 | `app/(modules)/*/ARCHITECTURE.md`, `app/(modules)/*/MODULE.md` | 模块长期业务知识、边界、权限口径、数据语义 |
| User Docs / Operating Docs | 最终用户 / 业务使用者 | `app/(modules)/docs/*`, `docs/product/*` | 使用说明、流程说明、制度文档、业务参考资料 |
| Planning Policy | 规划治理 | `docs/planning/README.md` | 只写规划放置原则；实际计划和回溯不进入 Git |
| Reference | 特殊资料维护者 | `docs/reference/*` | 不属于上述分类的长期参考资料；必须声明 owner 和用途 |

## 工程规范入口

| 主题 | 文档 | Owner |
|---|---|---|
| 项目总览和新鲜度 | `docs/engineering/project-overview.md` | Coordinator / Architecture |
| 跨专题工程手册 | `docs/engineering/agent-handbook.md` | Coordinator / 各专题 owner |
| 架构边界和 gate | `docs/engineering/architecture-governance.md`, `docs/engineering/module-boundaries.md` | Architecture |
| 深模块、意图接口和易纠错设计 | `docs/engineering/deep-module-design.md` | Architecture |
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
| 业务编码规则与硬编码 gate | `docs/engineering/business-code-governance.md` | Architecture / Platform / Hygiene |
| 通用审批链 | `docs/engineering/approvals.md` | Platform / Architecture |
| 数据库和 schema | `docs/engineering/schema-governance.md`, `docs/engineering/database.md` | Data |
| 生成文档说明 | `docs/generated/README.md`, `docs/generated/*` | Data |
| 权限模型与复查 | `docs/engineering/security/rbac.md`, `docs/engineering/security/permission-matrix.md`, `docs/engineering/security/permission-review.md`, `docs/generated/permission-actions.md` | Architecture |
| API 与 Agent 调用手册 | `docs/generated/api-agent-guide.md` | Architecture / Agent / Docs Feature |
| 生产 Agent 文档目录 | `docs/generated/agent-doc-catalog.md`；线上 `/docs/company`；机器入口 `/api/modules/docs/company/documents` | Architecture / Agent / Docs Feature |
| 环境、检查与 CI/CD | `docs/engineering/checks.md`, `docs/engineering/ops/README.md`, `docs/engineering/ops/ci-cd.md` | Operations |
| 远端开发与 Codex SSH 项目 | `docs/engineering/ops/remote-development.md` | Operations |
| 数据发布 | `docs/engineering/ops/data-releases.md` | Operations / Data |
| Production/QC 数据和 layout 参考 | `docs/engineering/reference/qc-dev-mode.md` | Data |
| Docs Editor 模板空间和权限 | `docs/engineering/reference/docs-editor-template-spaces.md` | Platform Docs / Feature |
| Docs Editor 外部依赖 | `docs/engineering/reference/docs-editor-dependencies.md` | Platform Docs / Feature |

## 产品和用户文档入口

| 主题 | 文档 | Owner |
|---|---|---|
| 产品/用户文档说明 | `docs/product/README.md` | Feature |
| 关联方名录与身份关联 | `docs/product/external-related-parties.md` | External / Finance / HR Feature |
| 业务编码设置与导入规则 | `docs/product/business-code-rules.md` | Platform / 各业务 Feature |
| 教育数据来源 | `docs/product/reference/education-data.md` | Data / Feature |
| 财务会计准则参考 | `docs/product/reference/casc/` | Finance Feature / Data |
| 线上文档中心页面 | `app/(modules)/docs/*` | Feature |

`docs/product/*` 明确保留，用来放最终用户、业务使用者或业务资料维护者看的内容。不要把它合并进 `docs/engineering/*`。

## Reference

`docs/reference/*` 是特殊入口，只放不属于 engineering、module knowledge、product docs 或 planning 的长期参考资料。进入这里的文件必须声明 owner、用途和 intended users，不能替代工程规范，不能放临时计划。超过 90 天未被引用时由 Hygiene 发起归档/删除检查。

## 规划和归档

`docs/planning/` 只保留规划治理原则。实际计划和过程记录写入 Git 忽略的 `.planning/`；租户业务、生产核验和数据发布证据写入 `WORKSPACE_CONFIG_DIR/audit/`。

## 文档维护规则

- 新工程事实优先补到对应 `docs/engineering/*` 专题文档；agent 执行流程只补到对应 `.agents/skills/workspace-*`。
- 文档 owner、同步触发条件和 stale 归属以 `docs/OWNERS.md` 为准。
- 业务模块长期知识写在对应 `app/(modules)/*/ARCHITECTURE.md` 或 `MODULE.md`，不要塞进工程规范。
- 给最终用户看的内容进入 `docs/product/*` 或 `app/(modules)/docs/*`，不要和 coding-agent skill 或内部工程规范混放。
- 执行计划、完成清单和过期记录都不要提交到源码；只把稳定、跨租户适用的原则提炼到权威文档。
- 自动生成文档不要手工改正文，改生成脚本或源数据。
- 生产 `/docs/company` 只发布显式白名单中的产品/API/权限文档；不要递归复制 `docs/engineering`、模块架构、数据库或运维资料。Agent 文档必须先给目录，并提供按章节读取的结构化入口。
- 删除代码入口时同步删除文档里的旧路径，避免 agent 按旧路径继续开发。
