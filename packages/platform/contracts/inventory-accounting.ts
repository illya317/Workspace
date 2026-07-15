export type InventoryValuationSnapshot = { companyCode: string; year: number; month: number; inventoryValue: number; onHandQuantity: number };
export type InventoryPostingProposal = { accountCode: string; direction: "debit" | "credit"; amount: number; description: string };

export interface InventoryAccountingContract {
  getValuationSnapshot(scope: { companyCode: string; year: number; month: number }): Promise<InventoryValuationSnapshot>;
  getPostingProposal(scope: { companyCode: string; year: number; month: number }): Promise<InventoryPostingProposal[]>;
  linkVoucher(scope: { companyCode: string; year: number; month: number }, voucherId: number, userId: number): Promise<void>;
}
