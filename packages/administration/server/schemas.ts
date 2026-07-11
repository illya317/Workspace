import { z } from "zod";

export const ContractCreateSchema = z.object({
  name: z.string().min(1, "合同名称必填"),
  contractNo: z.string().optional().nullable(),
  partyA: z.string().optional().nullable(),
  partyB: z.string().optional().nullable(),
  shareholder: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  content: z.string().optional().nullable(),
  handler: z.string().optional().nullable(),
  signDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  status: z.string().optional().nullable(),
  amount: z.union([z.string(), z.number()]).optional().nullable(),
  executedAmount: z.union([z.string(), z.number()]).optional().nullable(),
  location: z.string().optional().nullable(),
  remark: z.string().optional().nullable(),
});

export const ContractUpdateSchema = ContractCreateSchema.partial();

export type ContractCreateInput = z.infer<typeof ContractCreateSchema>;
export type ContractUpdateInput = z.infer<typeof ContractUpdateSchema>;
