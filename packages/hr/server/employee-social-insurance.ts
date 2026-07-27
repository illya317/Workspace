import { checkHRUpdate } from "@workspace/platform/server/auth";
import { serviceError, serviceOk } from "@workspace/platform/server/api";
import { assertBusinessActionDirectExecutionAllowed } from "@workspace/platform/server/business-action-executor";
import { mapValidationToServiceResult } from "@workspace/platform/server/domain-validation";
import { Prisma, prisma } from "@workspace/platform/server/prisma";
import { runSerializableTransaction, SerializableTransactionConflictError } from "@workspace/platform/server/serializable-transaction";
import { validateBusinessTemporalBaselineMutation } from "@workspace/platform/contracts/business-temporal-baseline";
import type { EmployeeSocialInsuranceRow } from "@workspace/hr/types";
import { buildEmployeeSocialInsuranceCommand } from "./domain/employee-social-insurance-validation";

const PERIOD_SELECT = {
  periodUid: true,
  insuranceStatus: true,
  companyId: true,
  companyNameSnapshot: true,
  startMonth: true,
  endMonth: true,
  stopReason: true,
  note: true,
  sourceKind: true,
  missingFieldsJson: true,
  version: true,
  createdAt: true,
  updatedAt: true,
  company: { select: { party: { select: { name: true } } } },
} satisfies Prisma.EmployeeSocialInsurancePeriodSelect;

type PeriodRecord = Prisma.EmployeeSocialInsurancePeriodGetPayload<{ select: typeof PERIOD_SELECT }>;

function month(value: Date | null) {
  if (!value) return null;
  return value.toISOString().slice(0, 7);
}

function monthDate(value: string) {
  return new Date(`${value}-01T00:00:00.000Z`);
}

function previousMonth(value: string) {
  const date = monthDate(value);
  date.setUTCMonth(date.getUTCMonth() - 1);
  return date;
}

function toRow(record: PeriodRecord): EmployeeSocialInsuranceRow {
  return {
    periodUid: record.periodUid,
    companyId: record.companyId,
    companyName: record.company?.party.name ?? record.companyNameSnapshot,
    insuranceStatus: record.insuranceStatus as EmployeeSocialInsuranceRow["insuranceStatus"],
    startMonth: month(record.startMonth),
    endMonth: record.endMonth ? month(record.endMonth) : null,
    status: record.insuranceStatus as EmployeeSocialInsuranceRow["status"],
    stopReason: record.stopReason,
    note: record.sourceKind === "legacy-baseline" ? null : record.note,
    missingFields: parseMissingFields(record.missingFieldsJson),
    version: record.version,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export async function listEmployeeSocialInsurancePeriods(employeeId: number): Promise<EmployeeSocialInsuranceRow[]> {
  const periods = await prisma.employeeSocialInsurancePeriod.findMany({
    where: { employeeId, recordState: "confirmed" },
    select: PERIOD_SELECT,
    orderBy: [{ startMonth: "desc" }, { id: "desc" }],
  });
  return periods.map(toRow);
}

export async function executeEmployeeSocialInsuranceCommand(input: {
  employeeId: number;
  userId: number;
  command: unknown;
}) {
  const built = mapValidationToServiceResult(buildEmployeeSocialInsuranceCommand(input.command));
  if (!built.ok) return built;
  if (!(await checkHRUpdate(input.userId, "hr.roster"))) return serviceError("无权限", 403);
  const direct = await assertBusinessActionDirectExecutionAllowed({
    businessActionKey: "hr.roster.socialInsurance.command",
    actorUserId: input.userId,
    resourceKey: "hr.roster",
    scopeType: "global",
    scopeId: null,
    blockedMessage: "社会保险变更已配置为必须走流程，请从社会保险入口提交",
  });
  if (!direct.ok) return direct;

  try {
    await runSerializableTransaction(async (tx) => {
      const employee = await tx.employee.findUnique({ where: { id: input.employeeId }, select: { id: true } });
      if (!employee) throw new SocialInsuranceCommandError("员工不存在", 404);

      if (built.data.kind === "register") {
        if (built.data.companyId) await assertCompany(tx, built.data.companyId);
        const open = await tx.employeeSocialInsurancePeriod.findFirst({
          where: { employeeId: input.employeeId, recordState: "confirmed", insuranceStatus: "insured" },
          select: { periodUid: true },
        });
        if (open && built.data.insuranceStatus === "insured") {
          throw new SocialInsuranceCommandError("员工已有在保记录，请办理参保转移", 409);
        }
        await tx.employeeSocialInsurancePeriod.create({
          data: {
            employeeId: input.employeeId,
            insuranceStatus: built.data.insuranceStatus,
            companyId: built.data.companyId,
            startMonth: built.data.startMonth ? monthDate(built.data.startMonth) : null,
            endMonth: built.data.endMonth ? monthDate(built.data.endMonth) : null,
            stopReason: built.data.stopReason,
            note: built.data.note,
            createdBy: input.userId,
            updatedBy: input.userId,
          },
        });
        return;
      }

      const current = await tx.employeeSocialInsurancePeriod.findFirst({
        where: {
          employeeId: input.employeeId,
          periodUid: built.data.periodUid,
          recordState: "confirmed",
        },
        select: {
          id: true,
          companyId: true,
          companyNameSnapshot: true,
          startMonth: true,
          endMonth: true,
          stopReason: true,
          note: true,
          missingFieldsJson: true,
          sourceKind: true,
          insuranceStatus: true,
          version: true,
        },
      });
      if (!current) throw new SocialInsuranceCommandError("参保记录不存在", 404);
      if (current.version !== built.data.expectedVersion) {
        throw new SocialInsuranceCommandError("参保记录已被其他人修改，请刷新后重试", 409);
      }
      if (built.data.kind === "supplement-missing") {
        const missingFields = parseMissingFields(current.missingFieldsJson);
        const patchKeys = Object.keys(built.data.patch);
        const mutation = validateBusinessTemporalBaselineMutation({
          kind: "supplement-missing",
          missingFields,
          changedFields: patchKeys,
        });
        if (current.sourceKind !== "legacy-baseline" || !mutation.ok) {
          throw new SocialInsuranceCommandError("只能补充该历史记录中仍标记为缺失的资料", 409);
        }
        const company = built.data.patch.companyId
          ? await assertCompany(tx, built.data.patch.companyId)
          : null;
        const startMonth = built.data.patch.startMonth ? monthDate(built.data.patch.startMonth) : current.startMonth;
        const endMonth = built.data.patch.endMonth ? monthDate(built.data.patch.endMonth) : current.endMonth;
        if (startMonth && endMonth && startMonth > endMonth) {
          throw new SocialInsuranceCommandError("参保月份不能晚于停保月份", 400);
        }
        const nextMissingFields = missingFields.filter((field) => !patchKeys.includes(field));
        const before = socialInsuranceRevisionSnapshot(current, missingFields);
        const after = {
          ...before,
          companyId: built.data.patch.companyId ?? current.companyId,
          companyNameSnapshot: company?.party.name ?? current.companyNameSnapshot,
          startMonth: month(startMonth),
          endMonth: month(endMonth),
          stopReason: built.data.patch.stopReason ?? current.stopReason,
          missingFields: nextMissingFields,
          version: current.version + 1,
        };
        const claimed = await tx.employeeSocialInsurancePeriod.updateMany({
          where: { id: current.id, version: current.version },
          data: {
            ...(built.data.patch.companyId ? {
              companyId: built.data.patch.companyId,
              companyNameSnapshot: company?.party.name ?? current.companyNameSnapshot,
            } : {}),
            ...(built.data.patch.startMonth ? { startMonth } : {}),
            ...(built.data.patch.endMonth ? { endMonth } : {}),
            ...(built.data.patch.stopReason ? { stopReason: built.data.patch.stopReason } : {}),
            missingFieldsJson: JSON.stringify(nextMissingFields),
            updatedBy: input.userId,
            version: { increment: 1 },
          },
        });
        if (claimed.count !== 1) throw new SocialInsuranceCommandError("参保记录已被其他人修改，请刷新后重试", 409);
        const latestRevision = await tx.employeeSocialInsurancePeriodRevision.findFirst({
          where: { periodId: current.id },
          orderBy: { revisionNo: "desc" },
          select: { revisionNo: true },
        });
        await tx.employeeSocialInsurancePeriodRevision.create({
          data: {
            periodId: current.id,
            revisionNo: (latestRevision?.revisionNo ?? 0) + 1,
            changeKind: "supplement",
            beforeJson: JSON.stringify(before),
            afterJson: JSON.stringify(after),
            reason: built.data.reason,
            recordedBy: input.userId,
          },
        });
        return;
      }
      if (current.insuranceStatus !== "insured") throw new SocialInsuranceCommandError("该参保记录不是当前在保记录", 409);

      if (built.data.kind === "transfer") {
        await assertCompany(tx, built.data.companyId);
        if (built.data.companyId === current.companyId) {
          throw new SocialInsuranceCommandError("参保转移必须选择另一家公司", 400);
        }
        const transferMonth = monthDate(built.data.startMonth);
        if (current.startMonth && transferMonth <= current.startMonth) {
          throw new SocialInsuranceCommandError("新参保月份必须晚于当前记录的参保月份", 400);
        }
        const claimed = await tx.employeeSocialInsurancePeriod.updateMany({
          where: { id: current.id, version: current.version, endMonth: null },
          data: {
            endMonth: previousMonth(built.data.startMonth),
            insuranceStatus: "stopped",
            stopReason: "参保主体变更",
            updatedBy: input.userId,
            version: { increment: 1 },
          },
        });
        if (claimed.count !== 1) throw new SocialInsuranceCommandError("参保记录已被其他人修改，请刷新后重试", 409);
        await tx.employeeSocialInsurancePeriod.create({
          data: {
            employeeId: input.employeeId,
            insuranceStatus: "insured",
            companyId: built.data.companyId,
            startMonth: transferMonth,
            note: built.data.note,
            createdBy: input.userId,
            updatedBy: input.userId,
          },
        });
        return;
      }

      const endMonth = monthDate(built.data.endMonth);
      if (current.startMonth && endMonth < current.startMonth) {
        throw new SocialInsuranceCommandError("停保月份不能早于参保月份", 400);
      }
      const claimed = await tx.employeeSocialInsurancePeriod.updateMany({
        where: { id: current.id, version: current.version, endMonth: null },
        data: {
          endMonth,
          insuranceStatus: "stopped",
          stopReason: built.data.stopReason,
          note: built.data.note ?? undefined,
          updatedBy: input.userId,
          version: { increment: 1 },
        },
      });
      if (claimed.count !== 1) throw new SocialInsuranceCommandError("参保记录已被其他人修改，请刷新后重试", 409);
    });
    return serviceOk({
      success: true as const,
      periods: await listEmployeeSocialInsurancePeriods(input.employeeId),
    });
  } catch (error) {
    if (error instanceof SocialInsuranceCommandError) return serviceError(error.message, error.status);
    if (error instanceof SerializableTransactionConflictError) return serviceError(error.message, 409);
    if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2002" || error.code === "P2004")) {
      return serviceError("参保月份与现有记录重叠，请刷新后重试", 409);
    }
    throw error;
  }
}

function parseMissingFields(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((field): field is string => typeof field === "string") : [];
  } catch {
    return [];
  }
}

async function assertCompany(tx: Prisma.TransactionClient, companyId: number) {
  const company = await tx.company.findFirst({
    where: { id: companyId, isActive: true },
    select: { id: true, party: { select: { name: true } } },
  });
  if (!company) throw new SocialInsuranceCommandError("参保公司不存在或已停用", 400);
  return company;
}

function socialInsuranceRevisionSnapshot(
  period: {
    companyId: number | null;
    companyNameSnapshot: string | null;
    startMonth: Date | null;
    endMonth: Date | null;
    stopReason: string | null;
    note: string | null;
    insuranceStatus: string;
    version: number;
  },
  missingFields: string[],
) {
  return {
    insuranceStatus: period.insuranceStatus,
    companyId: period.companyId,
    companyNameSnapshot: period.companyNameSnapshot,
    startMonth: month(period.startMonth),
    endMonth: month(period.endMonth),
    stopReason: period.stopReason,
    note: period.note,
    missingFields,
    version: period.version,
  };
}

class SocialInsuranceCommandError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}
