# Production 生产管理模块架构

## 路由入口

| 页面 | 路由 | 权限 |
|------|------|------|
| 生产管理首页 | `/production` | `production.access` |
| 批次检验 | `/production/qc-batches` | `production.qcBatches.access` |
| 批次检验记录 | `/production/qc-batches/[batchId]` | `production.qcBatches.access` |
| 批次阶段确认 | `/production/qc-batches/[batchId]/[stageKey]` | `production.qcBatches.access` |
| 批次检测项目 | `/production/qc-batches/[batchId]/[stageKey]/[testName]` | `production.qcBatches.access` |

## 模块边界

生产管理目前只保留 QC / 批检验迁移线：

- 承接 pharma-ops 的批次检验、检验记录和运行时 QC 配置读取。
- QC 模板浏览、编辑、复制和官方发布入口由文档中心 `/docs/editor` 承接，不再作为 Production L2 暴露。
- 库存轻台账不再作为生产管理入口开放；旧库存 API 已移除。

## pharma-ops 迁移原则

第一阶段做 Workspace 入口、权限、YAML/JSON 配置适配、批次台账和记录页面。QC 运行配置维护在 `WORKSPACE_CONFIG_DIR/config/pharma-qc/`，源码内不再追踪表格布局 JSON；`WORKSPACE_QC_CONFIG_ROOT` 可用于显式覆盖配置根。MD 暂不接入。

迁移期批次数据先落在 `WORKSPACE_CONFIG_DIR/data/qc-batches.json`。QC 官方模板的编辑、复制、发布和权限管理归 `/docs/editor`，生成模板快照仍由 `generated/docs-editor/qc` 提供给 Docs Editor 读取。

当前已接入：

1. `packages/production/server/qc/` 默认从 `WORKSPACE_CONFIG_DIR/config/pharma-qc/` 读取 QC 配置；旧的源码内 `config/pharma-ops` 快照不再作为真源。
2. `packages/production/ui/qc/` 承载 QC 批次、检验记录和纸面布局 UI；`app/(modules)/production/qc-batches/*` route 只做鉴权、必要预取和挂载 package component。
3. `/production/qc-batches` 提供批次创建、批次台账、草稿/提交状态和记录入口。
4. `/production/qc-batches/[batchId]` 展示批次检验记录阶段入口。
5. `/production/qc-batches/[batchId]/[stageKey]` 展示 YAML 驱动的检验前确认表，纸面区域使用仿宋系字体。
6. `/production/qc-batches/[batchId]/[stageKey]/[testName]` 展开 `layout_mapping.template_id` 指向的 `table_layouts/templates` 组件，支持 include/variant/params、标题段落、项目表头、实验环境、仪器设备、后置标准/异常/清场/结论和常规 table；模板不可用时 fallback 到 YAML 方法字段表，并支持 `formula` 只读计算字段的前端轻量计算。
7. `/api/modules/production/qc-batches*` 提供 JSON 批次台账读写接口。
8. `/docs/editor` 读取 `generated/docs-editor/qc` 中的 QC 官方模板快照，负责模板空间、纸面编辑、复制、发布和权限管理。

QC 批次页面会读取并组合 YAML/JSON、layout templates 和方法字段，服务端使用 5 分钟缓存降低批次页面二次访问延迟。模板编辑器入口不再通过 Production L2 暴露。

后续迁移目标：

1. 把通用检测项目页面逐步替换为每类组件的正式纸质表格体验。
2. `prisma/models/production-qc.prisma` 承接批次记录、字段值和审计。
3. 把 pharma-ops 的完整公式引擎、规则字段和布局 renderer 迁移为 Workspace 原生实现。
4. `packages/production/ui/qc/*` 逐步替换 Flask/Jinja 页面。

## 权限标准

| 资源 | 用途 |
|------|------|
| `production.qcBatches` | 批次检验、记录填写、提交复核 |
| `docs.editor` | QC 官方模板浏览、复制、编辑和发布 |

页面入口使用 `requireResourceAccess(resourceKey)`；未来 API 查询使用 `access`，保存/提交使用 `write`，删除使用 `delete`，正式模板发布使用 `admin`。
