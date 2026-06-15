# Production 生产管理模块架构

## 路由入口

| 页面 | 路由 | 权限 |
|------|------|------|
| 生产管理首页 | `/production` | `production.access` |
| 质量检验中转 | `/production/qc` | `production.qc.access` |
| 批次检验 | `/production/qc/batches` | `production.qc.batches.access` |
| 检验模板 | `/production/qc/templates` | `production.qc.templates.access` |
| 库存管理 | `/inventory` | `production.inventory.access` |

## 模块边界

生产管理目前包含两条线：

- QC / 批检验迁移线：逐步承接 pharma-ops 的批次检验、检验记录、组件映射、方法字段和表格模板。
- 库存轻台账线：保留现有原辅料、包材、成品库存管理，状态为历史 fallback。

## pharma-ops 迁移原则

第一阶段只做 Workspace 入口、权限和页面骨架；pharma-ops 的 YAML、JSON、MD 仍是只读真源，不在 Workspace 中复制后分叉维护。

后续迁移目标：

1. `server/services/production/qc/` 读取 pharma-ops 配置并输出 record-structure DTO。
2. `prisma/models/production-qc.prisma` 承接批次记录、字段值和审计。
3. `app/api/production/qc/*` 按权限动作暴露批次、记录、模板建议 API。
4. `app/production/qc/*` 逐步替换 Flask/Jinja 页面。

## 权限标准

| 资源 | 用途 |
|------|------|
| `production.qc` | QC 根资源，承接质量检验能力 |
| `production.qc.batches` | 批次检验、记录填写、提交复核 |
| `production.qc.templates` | 组件映射建议、方法字段、表格模板 |
| `production.inventory` | 库存轻台账 |

页面入口使用 `requireResourceAccess(resourceKey)`；未来 API 查询使用 `access`，保存/提交使用 `write`，删除使用 `delete`，正式模板发布使用 `admin`。
