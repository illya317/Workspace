export interface Contract {
  id: number;
  version: number;
  contractNo: string | null;
  name: string;
  partyA: string | null;
  partyB: string | null;
  shareholder: string | null;
  category: string | null;
  content: string | null;
  handlerEmployeeId: number | null;
  handlerEmployeeName: string | null;
  handlerEmployeeActive: boolean | null;
  signDate: string | null;
  endDate: string | null;
  status: string | null;
  amount: number | null;
  executedAmount: number | null;
  location: string | null;
  remark: string | null;
}

export type ContractEditorMode = "create" | "edit" | null;
