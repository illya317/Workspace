export type InventoryItemDto = {
  id: number;
  companyCode: string;
  code: string;
  name: string;
  itemType: string;
  specification: string | null;
  baseUnit: string;
  status: string;
  onHand: number;
  available: number;
  batchCount: number;
  sourceSheet: string | null;
};

export type InventoryDocumentLineDto = {
  id: number;
  itemCode: string;
  itemName: string;
  warehouseName: string;
  batchNo: string | null;
  quantity: number;
  unit: string;
  baseQuantity: number;
  unitPrice: number | null;
  amount: number | null;
  paymentStatus: string | null;
  invoiceStatus: string | null;
};

export type InventoryDocumentDto = {
  id: number;
  documentNo: string;
  documentType: string;
  documentDate: string;
  status: string;
  counterparty: string | null;
  referenceNo: string | null;
  lineCount: number;
  quantity: number;
  amount: number;
  sourceSheet: string | null;
  lines: InventoryDocumentLineDto[];
};

export type InventoryBatchDto = {
  id: number;
  itemCode: string;
  itemName: string;
  warehouseName: string;
  batchNo: string;
  productionDate: string | null;
  expiryDate: string | null;
  status: string;
  onHand: number;
};

export type InventoryStocktakeDto = {
  id: number;
  stocktakeNo: string;
  stocktakeDate: string;
  warehouseName: string;
  status: string;
  itemCode: string;
  itemName: string;
  bookQuantity: number;
  actualQuantity: number;
  variance: number;
  varianceLabel: string;
};

export type InventoryImportBatchDto = {
  id: number;
  sourceFile: string;
  sourceSheet: string | null;
  status: string;
  itemCount: number;
  documentCount: number;
  rowCount: number;
  warningCount: number;
  importedAt: string;
};

export type InventoryWorkspaceDto = {
  scope: { companyCode: string; year: number; month: number };
  warehouses: Array<{ id: number; code: string; name: string }>;
  items: InventoryItemDto[];
  documents: InventoryDocumentDto[];
  batches: InventoryBatchDto[];
  stocktakes: InventoryStocktakeDto[];
  imports: InventoryImportBatchDto[];
  closing: {
    status: string;
    inventoryValue: number;
    onHandQuantity: number;
    linkedVoucherId: number | null;
    postingProposal: Array<{ accountCode: string; direction: "debit" | "credit"; amount: number; description: string }>;
  };
  metrics: { itemCount: number; onHandQuantity: number; receiptQuantity: number; issueQuantity: number; nearExpiryBatchCount: number; stocktakeVariance: number };
};

export type LinkInventoryVoucherInput = {
  companyCode: string;
  year: number;
  month: number;
  voucherId: number;
};

export type CreateInventoryItemInput = {
  companyCode: string;
  code: string;
  name: string;
  itemType: string;
  specification?: string | null;
  baseUnit: string;
  note?: string | null;
};

export type CreateInventoryDocumentInput = {
  companyCode: string;
  documentNo: string;
  documentType: "receipt" | "issue" | "adjustment" | "transfer";
  documentDate: string;
  counterparty?: string | null;
  referenceNo?: string | null;
  note?: string | null;
  lines: Array<{ itemId: number; warehouseId: number; batchId?: number | null; quantity: number; unit: string; unitFactor?: number; unitPrice?: number | null }>;
};
