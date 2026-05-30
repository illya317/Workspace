/**
 * Agent Proposal 服务。
 * 创建 → 用户确认 → 二次鉴权 → 执行写入 → 更新状态。
 */
import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/types";

export interface ProposalInput {
  actionKey: string;
  targetType: string;
  targetId?: string;
  payload: Record<string, unknown>;
  diff: Record<string, unknown>;
}

export interface ProposalResult {
  proposalId: number;
  status: string;
  message: string;
}

/** 创建待确认变更（不执行写入） */
export async function createProposal(
  user: SessionUser,
  input: ProposalInput,
): Promise<ProposalResult> {
  const proposal = await prisma.agentProposal.create({
    data: {
      userId: user.id,
      status: "pending",
      actionKey: input.actionKey,
      targetType: input.targetType,
      targetId: input.targetId ?? null,
      payloadJson: JSON.stringify(input.payload),
      diffJson: JSON.stringify(input.diff),
    },
  });

  return {
    proposalId: proposal.id,
    status: "pending",
    message: `变更已记录（#${proposal.id}），请确认后执行`,
  };
}

/** 确认并执行（二次鉴权由调用方负责） */
export async function confirmProposal(
  proposalId: number,
  user: SessionUser,
  execute: (payload: Record<string, unknown>) => Promise<unknown>,
): Promise<ProposalResult> {
  const proposal = await prisma.agentProposal.findUnique({ where: { id: proposalId } });
  if (!proposal) throw new Error("变更记录不存在");
  if (proposal.userId !== user.id) throw new Error("无权确认他人的变更");
  if (proposal.status !== "pending") throw new Error("变更已处理，无法重复确认");

  // 30 分钟过期
  const age = Date.now() - new Date(proposal.createdAt).getTime();
  if (age > 30 * 60 * 1000) {
    await prisma.agentProposal.update({ where: { id: proposalId }, data: { status: "expired" } });
    throw new Error("变更已过期（超过30分钟），请重新发起");
  }

  try {
    const payload = JSON.parse(proposal.payloadJson);
    const result = await execute(payload);

    await prisma.agentProposal.update({
      where: { id: proposalId },
      data: {
        status: "confirmed",
        resultJson: JSON.stringify(result),
        confirmedAt: new Date(),
      },
    });

    return { proposalId, status: "confirmed", message: "变更已执行" };
  } catch (err) {
    await prisma.agentProposal.update({
      where: { id: proposalId },
      data: { status: "failed", resultJson: JSON.stringify({ error: String(err) }) },
    });
    throw err;
  }
}

/** 取消待确认变更 */
export async function cancelProposal(
  proposalId: number,
  user: SessionUser,
): Promise<ProposalResult> {
  const proposal = await prisma.agentProposal.findUnique({ where: { id: proposalId } });
  if (!proposal) throw new Error("变更记录不存在");
  if (proposal.userId !== user.id) throw new Error("无权取消他人的变更");
  if (proposal.status !== "pending") throw new Error("只能取消待确认的变更");

  await prisma.agentProposal.update({
    where: { id: proposalId },
    data: { status: "cancelled" },
  });

  return { proposalId, status: "cancelled", message: "变更已取消" };
}
