# Production 生产管理模块架构

## 路由入口

| 页面 | 路由 | 权限 |
|------|------|------|
| 生产管理首页 | `/production` | `production.access` |
| 质量检验中转 | `/production/qc` | `production.qc.access` |
| 批次检验 | `/production/qc/batches` | `production.qc.batches.access` |
| 检验模板 | `/production/qc/templates` | `production.qc.templates.access` |

## 模块边界

生产管理目前只保留 QC / 批检验迁移线：

- 逐步承接 pharma-ops 的批次检验、检验记录、组件映射、方法字段和表格模板。
- 旧库存轻台账不再作为生产管理入口开放，`/inventory` 会回到 `/production`，`/api/inventory/*` 返回 `410 Gone`。

## pharma-ops 迁移原则

第一阶段只做 Workspace 入口、权限、只读配置适配和页面概览；pharma-ops 的 YAML、JSON 仍是只读真源，不在 Workspace 中复制后分叉维护。MD 暂不接入。

当前已接入：

1. `server/services/production/qc/` 从 `PHARMA_OPS_ROOT` 或相邻目录读取 pharma-ops 配置。
2. `/api/production/qc/config` 返回产品、record templates、methods、layout mapping 的只读概览，并暴露配置源 revision/dirty 状态。
3. `/production/qc/batches` 展示产品、阶段和检测项映射概览。
4. `/production/qc/templates` 展示记录模板、方法字段和布局映射概览。

后续迁移目标：

1. 输出更细的 record-structure DTO，承接单个产品/阶段的检验记录渲染。
2. `prisma/models/production-qc.prisma` 承接批次记录、字段值和审计。
3. `app/api/production/qc/*` 按权限动作暴露批次、记录、模板建议 API。
4. `app/production/qc/*` 逐步替换 Flask/Jinja 页面。

## 权限标准

| 资源 | 用途 |
|------|------|
| `production.qc` | QC 根资源，承接质量检验能力 |
| `production.qc.batches` | 批次检验、记录填写、提交复核 |
| `production.qc.templates` | 组件映射建议、方法字段、表格模板 |

页面入口使用 `requireResourceAccess(resourceKey)`；未来 API 查询使用 `access`，保存/提交使用 `write`，删除使用 `delete`，正式模板发布使用 `admin`。
