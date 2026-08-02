# Inventory Architecture

```yaml
owner: Inventory
resourceKeys:
  - inventory
  - inventory.operations
  - inventory.receipts
pageRoutes:
  - /inventory
  - /inventory/operations
  - /inventory/receipts
apiPrefixes:
  - /api/modules/inventory/operations
  - /api/modules/inventory/receipts
sourceOfTruth:
  - packages/inventory
  - prisma/models/inventory-operations.prisma
  - prisma/models/inventory-receipts.prisma
  - packages/platform/contracts/inventory-accounting.ts
  - packages/platform/contracts/inventory-closing.ts
```

## Boundary

Inventory owns unit conversion, warehouses, inventory batches, inventory documents, immutable ledger entries, stocktakes, period close state, workbook import provenance, and the finished-goods receipt declaration that precedes formal inventory posting. Product name, specification and product code are shared Product Master data maintained under Production; Inventory consumes the shared product identity and does not own a second product table. Finance does not own stock quantity or batch state. Finance consumes valuation and posting proposals through `InventoryAccountingContract`, and independently reviews receipt declarations through `inventory.receipts.approve`; Inventory does not import Finance package code.

The older `prisma/models/inventory.prisma` models remain a migration source only. New runtime code must use the `Inventory*` models in `inventory-operations.prisma` and must not add new dependencies to the legacy tables.

## Invariants

- A draft document has no ledger entries. Posting appends immutable signed entries and changes document status.
- Reversal never edits an original entry; it creates a posted reversal document and opposite entries.
- Issue posting cannot make the relevant item/warehouse/batch balance negative.
- Closed periods reject new documents and posting.
- Physical stocktake differences remain separate facts until an approved adjustment document posts them.
- Receipt unit cost is normalized to the base unit. Issues without an explicit cost use moving weighted average cost.
- Voucher linking validates company, period, posted status, account direction and amount before closing the inventory period.
- A receipt declaration is a monthly production fact, not a posted inventory document. Its state is `draft -> submitted -> approved`; confirmation freezes a snapshot and Finance review must be performed by a different user. An employee-bound user records the employee name; root admin without an employee profile records `管理员`.
- Product work points are unique by `(report, product)`, batch input quantity is counted once per batch, and output conversions are always recalculated from structured case, tail and packaging fields.
- `InventoryReceiptReportEvent` is append-only. Database triggers reject updates and deletes.

## API and actions

| Route | Action |
|---|---|
| `GET /api/modules/inventory/operations` | `read` |
| `POST /api/modules/inventory/operations/documents` | `create` |
| `POST /api/modules/inventory/operations/documents/:id/post` | `update` |
| `POST /api/modules/inventory/operations/documents/:id/reverse` | `reverse` |
| `POST /api/modules/inventory/operations/closing/link-voucher` | `lock` |
| `GET /api/modules/inventory/receipts` | `read` |
| `POST /api/modules/inventory/receipts` | `create` |
| `PATCH /api/modules/inventory/receipts/:id` | `update` |
| `DELETE /api/modules/inventory/receipts/:id` | `delete` |
| `POST /api/modules/inventory/receipts/reports/:reportId/confirm` | `submit` |
| `POST /api/modules/inventory/receipts/reports/:reportId/review` | `approve` |

All writes follow `Zod schema -> domain validator -> service/Prisma` and are registered in the BusinessAction and ActionContract registries.

`inventory.receipts.submit` and `inventory.receipts.approve` are explicit-only. Production staff receive create/update/submit as required by their role; Finance reviewers receive approve. The workflow uses permission holders as its reviewer pool and enforces preparer/reviewer separation in the domain service.

## 工作空间轻代码读取模型

Inventory owner 将现有受保护 GET 的公开读模型拆为 11 个版本化 source：库存物料、仓库、单据、单据行、批次、盘点、导入批次，以及入库报单、月报、产品汇总和包装备注。数组关系必须登记为 child source，不能把父接口当前页的嵌套数组冒充独立分页数据集。

这些事实没有可信的个人、部门或项目归属外键，因此三类空间中的 scope 均明确为 `workspace`：展示的是当前账号凭 `inventory.operations.read` 或 `inventory.receipts.read` 在原业务页面可见的全公司数据，而不是该空间自己的库存。轻代码不增加字段授权；敏感级和导出策略只用于说明及未来导出控制。写操作、审批动作和文件内容不进入分析源。

## Finished-goods receipt declarations

`/inventory/receipts` defaults to the monthly summary and keeps data entry as the second tab. `InventoryReceiptReport` owns the month and review state; `InventoryReceiptBatch` owns product, batch and input quantity; `InventoryReceiptProductWorkPoint` owns the product-level monthly work points; `InventoryReceiptOutput` owns each packaging/output line. A batch may contain multiple outputs, so totals count its input once.

Historical workbook H/I conversion cells are audit evidence only. Formal package and ten-thousand-unit totals are recalculated from case quantity, optional package tail and the parsed packaging structure. The history importer is `scripts/data/import-inventory-receipt-history.ts`; it is idempotent by source key and must not fabricate reviewer identities or approved states when the source review fields are empty.

Finance cost rows may link read-only through `FinanceCostStructureRow.receiptReportId`. Matching requires the same year/month and a unique product identity; Finance cost must never mutate the declaration through that relation.

## 关账只读 contract

Inventory 通过 `InventoryClosingContract` 暴露两个互不混用的期间检查：`records` 检查本期草稿、已过账单据与不可变流水完整性、计价成本、期间结转和关联凭证逐科目金额；`count_differences` 按期末非零的 `item + warehouse + batch` 维度要求正式盘点行覆盖，并逐行核对显式引用盘点单号的已过账调整证据。相反方向的调整不得相互抵消后冒充闭环，盘点差异总额为零也不能覆盖未闭环的单行差异。

Finance 不导入 Inventory package，Platform runtime 也不调用业务 API。Platform 只拥有 `InventoryClosingContract` 与通用签名 RPC primitive；Inventory 拥有 adapter 和 `/api/modules/inventory/internal/closing-inspection` 内部 route。Finance refresh 的 app composition root 用通用 primitive 组装具体 RPC client，再把 contract 注入 Finance service；独立 Finance app 使用同一组合壳。未注入 contract 时两个存货任务都 fail-closed。该内部接口只接受 `finance` caller，返回只读状态、阻断项、证据引用和 payload，不提供库存写入能力。没有物料、单据或期末库存事实的公司以 `applicable: false` 明示不适用，不伪造盘点或结转记录。

## Workbook import

`scripts/import/import-closing-workbook.ts` is dry-run by default and accepts `--execute`. The importer is idempotent by source keys, records source file/sheet/row facts, and removes only stale source documents previously created by the same importer. It imports the 面膜 stocktake and 阿胶浓浆 receipts/issues without treating payment or invoice status as inventory quantity. Issue sale prices are source sales facts, not cost inputs; imported issues leave `unitPrice` empty and calculate `InventoryLedgerEntry.unitCost` through the same moving-weighted-average algorithm used by normal posting. A physical-count cutover whose 630 inventory GL is zero is stored as item/batch/stocktake facts only and must not fabricate an owned-stock opening movement or unit cost.
