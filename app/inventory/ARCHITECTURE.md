# Inventory 库存管理模块架构（已关闭）

旧库存轻台账已从生产管理入口关闭。历史代码和数据库表暂时保留，避免迁移期丢失查账线索；产品访问面不再开放。

## 路由入口

| 页面 | 路由 | 组件 |
|------|------|------|
| 库存管理 | `/inventory` | redirect `/production` |

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
3. **API** `app/api/inventory/` 下按物料类型分端点，目前统一返回关闭响应

## API 规范

| 端点 | 说明 |
|------|------|
| `/api/inventory/*` | 返回 `410 Gone`，不再读写库存轻台账 |

## 权限标准

- 页面入口：`/inventory` 直接回到 `/production`
- API：`410 Gone`

## ERPNext 生命周期标记

状态：已关闭。现有库存主数据和操作记录仅作为历史数据保留；后续不继续扩展 FIFO/LIFO/移动加权、MRP、BOM、生产工单、WIP、质量检验等完整 ERP 库存/生产能力。

库存数据按物料类型分类存储，各类型共享通用的 InventoryTableTab 组件和 API 模式。
