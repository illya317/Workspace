# @workspace/production

产品主档 / QC 业务包边界。生产模块的 UI、server、types、constants、import 按目录组织；成品入库报单已经迁入 `@workspace/inventory`，不再属于本包。

```txt
ui/        # 生产页面组件和 hooks
server/    # 生产查询、QC 配置读取、批次校验和 DTO 组装
types/     # 生产 DTO 和领域类型
constants/ # 生产选项、阶段常量和非业务事实常量
import/    # 生产导入解析、清洗和校验流程
```

当前能力：

- `ui/products/`、`server/products/`、`types/products.ts`：产品、成品 SKU、包装属性和来源映射的查询与维护。`Product` 是制剂身份，SKU 继续使用共享 `InventoryItem`；来源不能唯一匹配时保留待关联，不猜测产品 FK。
- `ui/qc/`：生产 QC 批次、阶段、检测记录和纸面布局 UI；旧 `app/production/qc/components` 已迁入生产业务包，route 只负责鉴权/预取/挂载。
- `types/qc/types.ts`：生产 QC 布局、批次等领域类型。
- `server/qc/`：生产 QC 配置读取、批次记录渲染和批次台账服务；旧 `server/services/production/qc` 已收口到生产业务包。

成品入库报单的 UI、service 和 DTO 分别位于 `packages/inventory/ui/receipts`、`packages/inventory/server/receipts` 和 `packages/inventory/types/receipts.ts`，页面/API 统一挂在 `/inventory/receipts` 与 `/api/modules/inventory/receipts`。不要在 Production 恢复 `accounting` 目录或协议。

旧库存入口和 Production 检验模板 L2 已从注册表和 API contract 中移除；当前 Production 导航为产品主档与 QC 批次，模板编辑由 `/docs/editor` 承接。
