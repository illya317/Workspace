# Inventory Architecture

```yaml
owner: Inventory
resourceKeys:
  - inventory
  - inventory.operations
pageRoutes:
  - /inventory
  - /inventory/operations
apiPrefixes:
  - /api/modules/inventory/operations
sourceOfTruth:
  - packages/inventory
  - prisma/models/inventory-operations.prisma
  - packages/platform/contracts/inventory-accounting.ts
```

## Boundary

Inventory owns material cards, unit conversion, warehouses, batches, inventory documents, immutable ledger entries, stocktakes, period close state and workbook import provenance. Finance does not own stock quantity or batch state. Finance consumes valuation and posting proposals only through `InventoryAccountingContract`; Inventory does not import Finance package code.

The older `prisma/models/inventory.prisma` models remain a migration source only. New runtime code must use the `Inventory*` models in `inventory-operations.prisma` and must not add new dependencies to the legacy tables.

## Invariants

- A draft document has no ledger entries. Posting appends immutable signed entries and changes document status.
- Reversal never edits an original entry; it creates a posted reversal document and opposite entries.
- Issue posting cannot make the relevant item/warehouse/batch balance negative.
- Closed periods reject new documents and posting.
- Physical stocktake differences remain separate facts until an approved adjustment document posts them.
- Receipt unit cost is normalized to the base unit. Issues without an explicit cost use moving weighted average cost.
- Voucher linking validates company, period, posted status, account direction and amount before closing the inventory period.

## API and actions

| Route | Action |
|---|---|
| `GET /api/modules/inventory/operations` | `read` |
| `POST /api/modules/inventory/operations/items` | `create` |
| `POST /api/modules/inventory/operations/documents` | `create` |
| `POST /api/modules/inventory/operations/documents/:id/post` | `update` |
| `POST /api/modules/inventory/operations/documents/:id/reverse` | `reverse` |
| `POST /api/modules/inventory/operations/closing/link-voucher` | `lock` |

All writes follow `Zod schema -> domain validator -> service/Prisma` and are registered in the BusinessAction and ActionContract registries.

## Workbook import

`scripts/import/import-closing-workbook.ts` is dry-run by default and accepts `--execute`. The importer is idempotent by source keys, records source file/sheet/row facts, and removes only stale source documents previously created by the same importer. It imports the 面膜 stocktake and 阿胶浓浆 receipts/issues without treating payment or invoice status as inventory quantity.
