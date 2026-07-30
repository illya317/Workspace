import "server-only";

import type { SessionUser } from "@workspace/platform/types";

import { jsonErrorResponse } from "@workspace/platform/server/api";
import { getSessionUserFromAuthPayload } from "@workspace/platform/server/auth/session";
import { convertWecomBotOpenUserId } from "@workspace/platform/server/auth/wecom";
import { prisma } from "@workspace/platform/server/prisma";
import { evaluatePermissionAction } from "@workspace/platform/server/rbac/action-grants";

export type ResolvedWecomAgentUser =
  | { ok: true; user: SessionUser }
  | { ok: false; response: Response };

async function findWecomBoundUser(wxUserId: string) {
  return prisma.user.findUnique({
    where: { wxUserId },
    select: { id: true, wxUserId: true, canLogin: true, sessionVersion: true },
  });
}

export async function resolveWecomAgentUser(incomingUserId: string): Promise<ResolvedWecomAgentUser> {
  let user = await findWecomBoundUser(incomingUserId);
  if (!user) {
    const convertedUserId = await convertWecomBotOpenUserId(incomingUserId);
    if (convertedUserId) user = await findWecomBoundUser(convertedUserId);
  }
  if (!user || !user.canLogin) {
    return { ok: false, response: jsonErrorResponse("企业微信账号尚未绑定或已停用", 403) };
  }
  if (!(await evaluatePermissionAction(user.id, "agent.assistant", "submit"))) {
    return { ok: false, response: jsonErrorResponse("当前账号未开通智能体权限", 403) };
  }

  const sessionUser = await getSessionUserFromAuthPayload({
    userId: user.id,
    wxUserId: user.wxUserId ?? "",
    departmentId: 0,
    sessionVersion: user.sessionVersion,
  });
  if (!sessionUser) {
    return { ok: false, response: jsonErrorResponse("企业微信账号状态已失效", 401) };
  }
  return { ok: true, user: sessionUser };
}
