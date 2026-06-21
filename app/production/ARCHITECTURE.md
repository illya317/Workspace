# Production 生产管理模块架构

## 路由入口

| 页面 | 路由 | 权限 |
|------|------|------|
| 生产管理首页 | `/production` | `production.access` |
| 质量检验中转 | `/production/qc` | `production.qc.access` |
| 批次检验 | `/production/qc/batches` | `production.qc.batches.access` |
| 批次检验记录 | `/production/qc/batches/[batchId]` | `production.qc.batches.access` |
| 批次阶段确认 | `/production/qc/batches/[batchId]/[stageKey]` | `production.qc.batches.access` |
| 批次检测项目 | `/production/qc/batches/[batchId]/[stageKey]/[testName]` | `production.qc.batches.access` |
| 检验模板 | `/production/qc/templates` | `production.qc.templates.access` |
| 检验模板详情 | `/production/qc/templates/[templateId]` | `production.qc.templates.access` |

## 模块边界

生产管理目前只保留 QC / 批检验迁移线：

- 逐步承接 pharma-ops 的批次检验、检验记录、组件映射、方法字段和表格模板。
- 旧库存轻台账不再作为生产管理入口开放，`/inventory` 会回到 `/production`，`/api/inventory/*` 返回 `410 Gone`。

## pharma-ops 迁移原则

第一阶段做 Workspace 入口、权限、YAML/JSON 配置适配、批次台账和记录页面。QC 运行配置维护在 `WORKSPACE_CONFIG_DIR/config/pharma-qc/`，源码内不再追踪表格布局 JSON；`WORKSPACE_QC_CONFIG_ROOT` 可用于显式覆盖配置根。MD 暂不接入。

迁移期批次数据先落在 `WORKSPACE_CONFIG_DIR/data/qc-batches.json`，模板反馈先落在
`WORKSPACE_CONFIG_DIR/data/qc-template-feedback.json`，反馈项会记录 `userId/userName` 并按用户区分同一模板位置的意见，后续再进入 Prisma 表和审计模型。

当前已接入：

1. `packages/production/server/qc/` 默认从 `WORKSPACE_CONFIG_DIR/config/pharma-qc/` 读取 QC 配置；旧的源码内 `config/pharma-ops` 快照不再作为真源。
1. `packages/production/ui/qc/` 承载 QC 批次、模板、纸面布局和反馈 UI；`app/production/qc/*` route 只做鉴权、必要预取和挂载 package component。
2. `/api/production/qc/config` 返回产品、record templates、methods、layout mapping 的只读概览，并暴露配置源 revision/dirty 状态。
3. `/production/qc/batches` 提供批次创建、批次台账、草稿/提交状态和记录入口。
4. `/production/qc/batches/[batchId]` 展示批次检验记录阶段入口。
5. `/production/qc/batches/[batchId]/[stageKey]` 展示 YAML 驱动的检验前确认表，纸面区域使用仿宋系字体。
6. `/production/qc/batches/[batchId]/[stageKey]/[testName]` 展开 `layout_mapping.template_id` 指向的 `table_layouts/templates` 组件，支持 include/variant/params、标题段落、项目表头、实验环境、仪器设备、后置标准/异常/清场/结论和常规 table；模板不可用时 fallback 到 YAML 方法字段表，并支持 `formula` 只读计算字段的前端轻量计算。
7. `/production/qc/templates` 展示组件映射/方法字段反馈工作台，包含产品筛选、阶段折叠、仿宋纸面布局预览、模板展开 layout blocks 预览和反馈弹窗。
8. `/production/qc/templates/[templateId]` 展示单个 record template 的阶段、检测项、方法字段和组件布局映射。
9. `/api/production/qc/templates/[templateId]` 返回同一份只读 record-structure DTO，供后续编辑器复用。
10. `/api/production/qc/template-feedback` 提供模板反馈读写接口。
11. `/api/production/qc/batches*` 提供 JSON 批次台账读写接口。

QC 配置概览和模板详情展开会读取并组合 YAML/JSON、layout templates 和方法字段，服务端使用 5 分钟缓存降低模板工作台二次访问延迟；模板反馈列表保持实时读取。

后续迁移目标：

1. 把通用检测项目页面逐步替换为每类组件的正式纸质表格体验。
2. `prisma/models/production-qc.prisma` 承接批次记录、字段值和审计。
3. 模板反馈进入可查询、可审核的建议流。
4. 把 pharma-ops 的完整公式引擎、规则字段和布局 renderer 迁移为 Workspace 原生实现。
5. `packages/production/ui/qc/*` 逐步替换 Flask/Jinja 页面。

## 权限标准

| 资源 | 用途 |
|------|------|
| `production.qc` | QC 根资源，承接质量检验能力 |
| `production.qc.batches` | 批次检验、记录填写、提交复核 |
| `production.qc.templates` | 组件映射建议、方法字段、表格模板 |

页面入口使用 `requireResourceAccess(resourceKey)`；未来 API 查询使用 `access`，保存/提交使用 `write`，删除使用 `delete`，正式模板发布使用 `admin`。
