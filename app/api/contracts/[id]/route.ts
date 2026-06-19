import { NextResponse } from "next/server";
import { withContractAccess } from "@/lib/with-auth";
import { ContractUpdateSchema, deleteContract, updateContract } from "@workspace/administration/server";

export const PATCH = withContractAccess(async (request, _user, ctx) => {
  const id = Number((await ctx?.params)?.id);
  if (!id) return NextResponse.json({ error: "无效ID" }, { status: 400 });

  const parsed = ContractUpdateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "参数错误" }, { status: 400 });
  }
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "无更新内容" }, { status: 400 });
  }

  await updateContract(id, parsed.data);

  return NextResponse.json({ success: true });
});

export const DELETE = withContractAccess(async (_request, _user, ctx) => {
  const id = Number((await ctx?.params)?.id);
  if (!id) return NextResponse.json({ error: "无效ID" }, { status: 400 });

  await deleteContract(id);
  return NextResponse.json({ success: true });
});
