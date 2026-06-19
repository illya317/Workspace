import { NextResponse } from "next/server";
import { withContractAccess } from "@/lib/with-auth";
import { ContractCreateSchema, createContract, listContracts } from "@workspace/administration/server";

export const GET = withContractAccess(async (request) => {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();
  const location = searchParams.get("location")?.trim();
  const category = searchParams.get("category")?.trim();
  const status = searchParams.get("status")?.trim();
  const page = parseInt(searchParams.get("page") || "1");
  const pageSize = parseInt(searchParams.get("pageSize") || "50");

  const result = await listContracts({ q, location, category, status, page, pageSize });
  return NextResponse.json(result);
});

export const POST = withContractAccess(async (request) => {
  const parsed = ContractCreateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "参数错误" }, { status: 400 });
  }

  const record = await createContract(parsed.data);
  return NextResponse.json({ success: true, record });
});
