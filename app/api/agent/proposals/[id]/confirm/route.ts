/**
 * POST /api/agent/proposals/[id]/confirm — 确认执行变更。
 * 二次鉴权：同用户、状态 pending、write 权限仍在。
 */
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth/session";
import { confirmProposal } from "@/server/services/agent/proposals";
import { prisma } from "@/lib/prisma";

const ALLOWED_FIELDS = ["education", "title", "phone", "school", "major", "alias", "hometown"];

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const proposalId = parseInt(id);
  if (isNaN(proposalId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  try {
    const result = await confirmProposal(proposalId, user, async (payload) => {
      const { employeeId, field, value } = payload as Record<string, string>;

      if (!employeeId || !field) throw new Error("缺少参数");
      if (!ALLOWED_FIELDS.includes(field)) throw new Error(`字段 ${field} 不允许修改`);

      // 二次权限校验
      if (!user.canEditHR) throw new Error("无 HR 编辑权限");

      const updated = await prisma.employee.update({
        where: { employeeId },
        data: { [field]: value },
        select: { id: true, employeeId: true, name: true, [field]: true },
      });

      return { success: true, updated };
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "执行失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
