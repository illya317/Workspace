# Production 生产管理模块架构

## 路由入口

| 页面 | 路由 | 权限 |
|------|------|------|
| 生产管理首页 | `/production` | `production.access` |
| 批次检验 | `/production/qc` | `production.qc.access` |
| 批次阶段确认 | `/production/qc/[batchId]/[stageKey]` | `production.qc.access` |
| 批次检测项目 | `/production/qc/[batchId]/[stageKey]/[testName]` | `production.qc.access` |

## 模块边界

生产管理目前只保留 QC / 批检验迁移线：

- 承接 pharma-ops 的批次检验、检验记录和运行时 QC 配置读取。
- QC 模板浏览、编辑、复制和官方发布入口由文档中心 `/docs/editor` 承接，不再作为 Production L2 暴露。
- 库存轻台账不再作为生产管理入口开放；旧库存 API 已移除。

## pharma-ops 迁移原则

第一阶段做 Workspace 入口、权限、官方模板快照、批次台账和记录页面。QC 官方模板由 `/docs/editor` 发布，Production 运行态只读取批次快照中的 docs editor document。

迁移期批次数据先落在 `WORKSPACE_CONFIG_DIR/data/qc.json`。QC 官方模板的编辑、复制、发布和权限管理归 `/docs/editor`，生成模板快照由 `generated/production/qc/template-snapshots` 提供同步源，Docs Editor 会把它们 upsert 成质量控制部的真实部门模板。

当前已接入：

1. `packages/production/server/qc/` 读取已发布的 docs editor QC 官方模板，并在创建批次时固化模板快照。
2. `packages/production/ui/qc/` 承载 QC 批次、检验记录和纸面布局 UI；`app/(modules)/production/qc/*` route 只做鉴权、必要预取和挂载 package component。
3. `/production/qc` 提供批次创建、批次台账、草稿/提交状态和记录入口。
4. `/production/qc` 展示批次队列和当前批次阶段入口；不再保留独立的 `/production/qc/[batchId]` 中间页。
5. `/production/qc/[batchId]/[stageKey]` 使用 docs editor document 的阶段切片展示检验前确认表，纸面渲染复用 `/docs` 的 `DocumentPreview`。
6. `/production/qc/[batchId]/[stageKey]/[testName]` 使用 docs editor document 的检验项目切片展示纸面记录；公式和引用由 docs field model 驱动，Production 不再保留独立纸面 renderer。
7. `/api/modules/production/qc*` 提供 JSON 批次台账读写接口。
8. `/docs/editor` 把 `generated/production/qc/template-snapshots` 中的 QC 官方模板快照同步到质量控制部部门空间，负责模板空间、纸面编辑、复制、发布和权限管理。

QC 批次页面只使用批次固化的 docs editor 模板快照。模板编辑器入口不再通过 Production L2 暴露。

后续迁移目标：

1. `prisma/models/production-qc.prisma` 承接批次记录、字段值和审计。
2. 把 docs field model 的公式、引用和检验规则继续沉淀为 Workspace 原生运行时能力。

## 权限标准

| 资源 | 用途 |
|------|------|
| `production.qc` | 批次检验、记录填写、提交复核 |
| `docs.editor` | QC 官方模板浏览、复制、编辑和发布 |

页面入口使用 `requireResourceAccess(resourceKey)`；未来 API 查询使用 `access`，保存/提交使用 `write`，删除使用 `delete`，正式模板发布使用 `admin`。

Docs Editor 的模板空间和空间权限细节见 `docs/engineering/reference/docs-editor-template-spaces.md`。
