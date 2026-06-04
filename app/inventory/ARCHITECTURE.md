# Inventory 库存管理模块架构

## 路由入口

| 页面 | 路由 | 组件 |
|------|------|------|
| 库存管理 | `/inventory` | `app/inventory/page.tsx` → `InventoryClient.tsx` |

## 页面结构

InventoryClient 渲染多个 Tab，每个 Tab 是一个独立的 `InventoryTableTab`：

| Tab | 组件 | 数据实体 |
|-----|------|---------|
| 原材料 | RawMaterialTab | 原材料入库/出库 |
| 包材 | PackagingTab | 包材入库/出库 |
| 成品 | FinishedGoodsTab | 成品入库/出库 |
| 操作记录 | OperationsTab | 库存操作日志 |
| 退货 | ReturnsTab | 退货记录 |
| 报表 | ReportTab | 库存统计报表 |

## 核心组件链

```
page.tsx
  └─ InventoryClient.tsx
       ├─ RawMaterialTab.tsx
       │    └─ InventoryTableTab.tsx — 通用库存表格
       ├─ PackagingTab.tsx
       ├─ FinishedGoodsTab.tsx
       ├─ OperationsTab.tsx
       ├─ ReturnsTab.tsx
       └─ ReportTab.tsx
```

## 数据流

1. **useInventoryTab.ts** 提供各 Tab 通用的加载/筛选/CRUD hook
2. **InventoryTableTab.tsx** 通用库存表格组件，支持编辑/筛选/分页
3. **API** `app/api/inventory/` 下按物料类型分端点

## API 规范

| 端点 | 说明 |
|------|------|
| `GET/POST/PUT/DELETE /api/inventory/raw-materials` | 原材料 |
| `GET/POST/PUT/DELETE /api/inventory/packaging` | 包材 |
| `GET/POST/PUT/DELETE /api/inventory/finished-goods` | 成品 |
| `GET /api/inventory/operations` | 操作记录 |
| `GET /api/inventory/returns` | 退货记录 |
| `GET /api/inventory/reports` | 库存报表 |

## 权限标准

- 页面入口：`requireResourceAccess("production.inventory")`
- API 查询：`production.inventory.access`
- API 写入：`production.inventory.write`
- API 删除：`production.inventory.delete`

## ERPNext 生命周期标记

状态：`legacy-fallback`。现有库存主数据和操作记录保留为历史轻台账；后续不继续扩展 FIFO/LIFO/移动加权、MRP、BOM、生产工单、WIP、质量检验等完整 ERP 库存/生产能力。

库存数据按物料类型分类存储，各类型共享通用的 InventoryTableTab 组件和 API 模式。
