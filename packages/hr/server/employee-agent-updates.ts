import { assertBusinessActionDirectExecutionAllowed } from "@workspace/platform/server/business-action-executor";
import { checkHRUpdate } from "@workspace/platform/server/auth";
import { serviceError, serviceOk } from "@workspace/platform/server/api";
import { ensureEditHistoryBaseline, snapshotHistory } from "@workspace/platform/server/history";
import { Prisma, prisma } from "@workspace/platform/server/prisma";

import {
  employeeFieldSnapshotMatches,
  type ExpectedEmployeeFieldSnapshot,
} from "./domain/agent-employee-proposal-validation";
import {
  buildEmployeeFieldUpdateCommand,
  EMPLOYEE_ALLOWED_FIELDS,
} from "./domain/employee-validation";

class EmployeeAgentProposalConflictError extends Error {}

export async function updateEmployeeFieldsByEmployeeIds(input: {
  employeeIds: string[];
  field: string;
  value: unknown;
  userId: number;
  expectedRows: ExpectedEmployeeFieldSnapshot[];
}) {
  if (!(await checkHRUpdate(input.userId, "hr.roster"))) return serviceError("无 HR 编辑权限", 403);
  const direct = await assertBusinessActionDirectExecutionAllowed({
    businessActionKey: "hr.roster.employee.update",
    actorUserId: input.userId,
    resourceKey: "hr.roster",
    scopeType: "global",
    scopeId: null,
    blockedMessage: "员工更新已配置为必须走流程，智能体不能直接写入",
  });
  if (!direct.ok) return direct;
  if (!EMPLOYEE_ALLOWED_FIELDS.includes(input.field)) return serviceError("字段不允许修改", 400);
  const command = buildEmployeeFieldUpdateCommand(input.field, input.value);
  if (!command.ok) return serviceError(command.issue.message, command.issue.status || 400);
  const employeeIds = Array.from(new Set(input.employeeIds.map((id) => id.trim()).filter(Boolean)));
  if (employeeIds.length === 0) return serviceError("缺少员工编号", 400);
  if (employeeIds.length > 500) return serviceError("批量更新上限 500", 400);
  const expectedByEmployeeId = new Map(
    input.expectedRows.map((row) => [row.employeeId.trim(), row]),
  );
  if (
    expectedByEmployeeId.size !== employeeIds.length
    || employeeIds.some((employeeId) => !expectedByEmployeeId.has(employeeId))
  ) {
    return serviceError("员工版本快照与提案目标不一致，请重新发起", 409);
  }

  let persisted: { ok: true; data: { updatedCount: number } } | { ok: false; error: string; status?: number };
  try {
    persisted = await prisma.$transaction(async (tx) => {
      const rows = await tx.employee.findMany({
        where: { employeeId: { in: employeeIds } },
        select: {
          id: true,
          employeeId: true,
          version: true,
          education: true,
          title: true,
          phone: true,
          school: true,
          major: true,
          alias: true,
          hometown: true,
          politics: true,
        },
      });
      if (rows.length !== employeeIds.length) return serviceError("部分员工不存在，请刷新后重试", 404);

      for (const row of rows) {
        const expected = expectedByEmployeeId.get(row.employeeId)!;
        if (!employeeFieldSnapshotMatches(
          row,
          command.data.field,
          expected,
        )) {
          return serviceError(`员工 ${row.employeeId} 已被修改，请重新发起提案`, 409);
        }
      }

      for (const row of rows) {
        const expected = expectedByEmployeeId.get(row.employeeId)!;
        await ensureEditHistoryBaseline("Employee", row.id, input.userId, tx);
        const updated = await tx.employee.updateMany({
          where: {
            id: row.id,
            version: expected.version,
            [command.data.field]: expected.oldValue,
          } as Prisma.EmployeeWhereInput,
          data: {
            [command.data.field]: command.data.value ?? null,
            editedBy: input.userId,
            editedAt: new Date(),
            version: { increment: 1 },
          },
        });
        if (updated.count !== 1) throw new EmployeeAgentProposalConflictError();
        await snapshotHistory("Employee", row.id, input.userId, tx);
      }
      return serviceOk({ updatedCount: rows.length });
    });
  } catch (error) {
    if (error instanceof EmployeeAgentProposalConflictError) {
      return serviceError("员工资料已发生并发变化，请重新发起提案", 409);
    }
    throw error;
  }
  return persisted;
}
