export interface Contract {
  id: number;
  contractNo: string | null;
  name: string;
  partyA: string | null;
  partyB: string | null;
  shareholder: string | null;
  category: string | null;
  content: string | null;
  handler: string | null;
  signDate: string | null;
  endDate: string | null;
  status: string | null;
  amount: number | null;
  executedAmount: number | null;
  location: string | null;
  remark: string | null;
}

export type ModalMode = "create" | "edit" | null;
