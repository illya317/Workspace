import { z } from "zod";

export const inventoryClosingScopeSchema = z.object({
  companyCode: z.string().trim().min(1),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
});

export type InventoryClosingScope = {
  companyCode: string;
  year: number;
  month: number;
};

export type InventoryClosingBlocker = {
  code: string;
  message: string;
  deepLink: string;
};

export type InventoryClosingInspection = {
  status: "pending" | "ready" | "blocked";
  inspectionVersion: string;
  blockers: InventoryClosingBlocker[];
  evidenceRefs: string[];
  voucherRefs: string[];
  deepLink: string;
  payload: unknown;
};

/**
 * Read-only cross-module seam owned by Inventory and consumed by closing views.
 * Inventory keeps all stock and stocktake business rules behind this contract.
 */
export interface InventoryClosingContract {
  inspectPeriodRecords(scope: InventoryClosingScope): Promise<InventoryClosingInspection>;
  inspectPeriodCountDifferences(scope: InventoryClosingScope): Promise<InventoryClosingInspection>;
}

export const inventoryClosingInspectionKindSchema = z.enum(["records", "count_differences"]);

export const inventoryClosingRpcRequestSchema = z.object({
  scope: inventoryClosingScopeSchema,
  inspectionKind: inventoryClosingInspectionKindSchema,
});

export const inventoryClosingInspectionSchema = z.object({
  status: z.enum(["pending", "ready", "blocked"]),
  inspectionVersion: z.string().trim().min(1),
  blockers: z.array(z.object({
    code: z.string().trim().min(1),
    message: z.string().trim().min(1),
    deepLink: z.string().trim().min(1),
  })),
  evidenceRefs: z.array(z.string()),
  voucherRefs: z.array(z.string()),
  deepLink: z.string().trim().min(1),
  payload: z.unknown(),
});
