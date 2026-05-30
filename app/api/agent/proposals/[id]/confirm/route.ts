/**
 * POST /api/agent/proposals/[id]/confirm — 确认执行变更。
 * 二次鉴权：同用户、状态 pending、write 权限仍在。
 */
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth/session";
import { confirmProposal } from "@/server/services/agent/proposals";
import { prisma } from "@/lib/prisma";

const ALLOWED_FIELDS = ["education", "title", "phone", "school", "major", "alias", "hometown", "politics"];

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
      if (!user.canEditHR) throw new Error("无 HR 编辑权限");

      const { field, value, employeeIds } = payload as Record<string, unknown>;

      if (!field || typeof field !== "string") throw new Error("缺少参数 field");
      if (!ALLOWED_FIELDS.includes(field)) throw new Error(`字段 ${field} 不允许修改`);

      // 批量更新
      if (Array.isArray(employeeIds) && employeeIds.length > 0) {
        if (employeeIds.length > 500) throw new Error("批量更新上限 500");

        const ids = employeeIds.map(String);
        const result = await prisma.employee.updateMany({
          where: { employeeId: { in: ids } },
          data: { [field]: String(value ?? "") },
        });

        return { success: true, updatedCount: result.count };
      }

      // 单个更新
      const employeeId = typeof payload.employeeId === "string" ? payload.employeeId : "";
      if (!employeeId) throw new Error("缺少参数 employeeId");

      const updated = await prisma.employee.update({
        where: { employeeId },
        data: { [field]: String(value ?? "") },
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
