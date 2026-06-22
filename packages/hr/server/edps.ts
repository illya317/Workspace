import { NextResponse } from "next/server";
import { authenticate, checkHRWrite } from "@workspace/platform/server/auth";
import { parseJson } from "@workspace/platform/server/api";
import { validateFkValue } from "@workspace/platform/server/fk-registry";
import { snapshotHistory } from "@workspace/platform/server/history";
import { matchSearchFields } from "@workspace/platform/search";
import { formatDepartmentPath } from "@workspace/hr/utils/department-path";
import { isValidDateValue, parseWorkPercent, rejectInvalidDateField } from "./field-validation";
import { prisma } from "@workspace/platform/server/prisma";
import { EDPCreateSchema } from "./schemas";
import { handleCreate, handleDelete } from "./hr-crud";
import { HR_FK_REGISTRY } from "./fk-registry";
import { validateEdpReportTo } from "./edp-report-to";

const DATE_FIELDS = ["startDate", "endDate"];
const EDP_FIELDS = ["positionId", "isPrimary", "startDate", "endDate", "reportTo", "workPercent"];
const EDP_CONFIG = {
  entityType: "EDP",
  modelKey: "eDP" as const,
  allowedFields: EDP_FIELDS,
  onBeforeUpdate: normalizeEdpFieldUpdate,
};

async function normalizeEdpFieldUpdate(field: string, value: unknown, recordId?: number) {
  if (field === "departmentId" || field === "dept1") {
    return { error: "部门由岗位自动确定，不能手动修改" };
  }
  const dateResult = rejectInvalidDateField(field, value, DATE_FIELDS);
  if (!dateResult) return null;
  if (field === "position") {
    const name = String(value || "");
    const position = name ? await prisma.position.findFirst({ where: { name } }) : null;
    if (name && !position) return null;
    const validation = await validateFkValue(HR_FK_REGISTRY, { fkKey: "hr.edp.position", value: position?.id ?? null, requiredLabel: "岗位" });
    if (!validation.ok) return { error: validation.error, status: validation.status };
    return { field: "positionId", value: validation.value };
  }
  if (field === "positionId") {
    let nextValue = value;
    if (typeof value === "string" && Number.isNaN(Number(value))) {
      const position = await prisma.position.findFirst({ where: { name: value } });
      if (value && !position) return null;
      nextValue = position?.id ?? null;
    }
    const validation = await validateFkValue(HR_FK_REGISTRY, { fkKey: "hr.edp.position", value: nextValue, requiredLabel: "岗位" });
    if (!validation.ok) return { error: validation.error, status: validation.status };
    return { field, value: validation.value };
  }
  if (field === "reportTo") {
    const record = recordId
      ? await prisma.eDP.findUnique({ where: { id: recordId }, select: { positionId: true } })
      : null;
    const validation = await validateEdpReportTo({
      positionId: record?.positionId ?? null,
      reportTo: value,
    });
    if (!validation.ok) return { error: validation.error, status: 400 };
    return { field, value: validation.value };
  }
  if (field === "workPercent") {
    const parsed = parseWorkPercent(value);
    if (Number.isNaN(parsed) || (parsed !== null && (parsed < 0 || parsed > 1))) return null;
  }
  return { field, value };
}

export async function listEdps(input: { keyword: string; page: number; pageSize: number }) {
  const employees = await prisma.employee.findMany({
    select: { id: true, employeeId: true, name: true },
    orderBy: { id: "asc" },
  });
  const employeeIds = employees.map((employee) => employee.id);
  const employeeMap = new Map(employees.map((employee) => [employee.id, employee]));

  const edps = await prisma.eDP.findMany({
    where: { employeeId: { in: employeeIds } },
    include: {
      department: { include: { parent: { include: { parent: true } } } },
      position: true,
    },
    orderBy: [{ id: "asc" }],
  });

  let rows = edps.map((edp) => {
    const employee = employeeMap.get(edp.employeeId);
    return {
      id: edp.id,
      employeeId: edp.employeeId,
      employeeName: employee?.name || "",
      departmentId: edp.departmentId,
      departmentName: formatDepartmentPath(edp.department) || edp.department?.name || "",
      positionId: edp.positionId,
      positionName: edp.position?.name || "",
      isPrimary: edp.isPrimary,
      startDate: edp.startDate,
      endDate: edp.endDate,
      reportTo: edp.reportTo,
      workPercent: edp.workPercent,
    };
  });

  if (input.keyword) {
    rows = rows.filter((row) => {
      const employee = employeeMap.get(Number(row.employeeId));
      return matchSearchFields({
        ...row,
        employeeCode: employee?.employeeId,
      }, input.keyword, ["employeeName", "employeeCode", "employeeId", "departmentName", "positionName", "reportTo"]);
    });
  }

  const total = rows.length;
  const start = (input.page - 1) * input.pageSize;
  return { positions: rows.slice(start, start + input.pageSize), total };
}

export async function createEdp(request: Request) {
  const parsed = await parseJson(request, EDPCreateSchema);
  if (!parsed.ok) return { ok: false as const, response: NextResponse.json({ error: parsed.error }, { status: 400 }) };
  for (const field of DATE_FIELDS) {
    if (!isValidDateValue(parsed.data[field as keyof typeof parsed.data])) {
      return { ok: false as const, response: NextResponse.json({ error: "日期格式无效" }, { status: 400 }) };
    }
  }
  const workPercent = parseWorkPercent(parsed.data.workPercent);
  if (Number.isNaN(workPercent) || (workPercent !== null && (workPercent < 0 || workPercent > 1))) {
    return { ok: false as const, response: NextResponse.json({ error: "工作占比必须在 0 到 1 之间" }, { status: 400 }) };
  }
  const positionValidation = await validateFkValue(HR_FK_REGISTRY, {
    fkKey: "hr.edp.position",
    value: parsed.data.positionId ?? null,
    requiredLabel: "岗位",
  });
  if (!positionValidation.ok) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: positionValidation.error }, { status: positionValidation.status || 400 }),
    };
  }
  const reportToValidation = await validateEdpReportTo({
    positionId: positionValidation.value,
    reportTo: parsed.data.reportTo,
  });
  if (!reportToValidation.ok) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: reportToValidation.error }, { status: 400 }),
    };
  }
  const response = await handleCreate(request, { entityType: "EDP", modelKey: "eDP" as const }, async () => {
    const positionId = parsed.data.positionId ?? null;
    const position = positionId
      ? await prisma.position.findUnique({ where: { id: positionId }, select: { departmentId: true } })
      : null;
    return { ...parsed.data, reportTo: reportToValidation.value, departmentId: position?.departmentId ?? null };
  });
  return { ok: true as const, response };
}

export async function updateEdpField(request: Request, params: Promise<{ id: string }>) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkHRWrite(payload.userId, "hr.roster"))) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const { id } = await params;
  const recordId = Number(id);
  if (!Number.isInteger(recordId) || recordId <= 0) return NextResponse.json({ error: "记录ID无效" }, { status: 400 });

  const body = await request.json();
  let { field, value } = body as { field: string; value: unknown };
  const result = await normalizeEdpFieldUpdate(field, value, recordId);
  if (!result) return NextResponse.json({ error: "非法字段" }, { status: 400 });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  field = result.field;
  value = result.value;
  if (!EDP_FIELDS.includes(field)) return NextResponse.json({ error: "非法字段" }, { status: 400 });

  const data: Record<string, unknown> = {
    [field]: value ?? null,
    editedBy: payload.userId,
    editedAt: new Date(),
    version: { increment: 1 },
  };
  if (field === "positionId") {
    const positionId = value === null || value === undefined || value === "" ? null : Number(value);
    const position = positionId
      ? await prisma.position.findUnique({ where: { id: positionId }, select: { departmentId: true } })
      : null;
    data.departmentId = position?.departmentId ?? null;
    data.reportTo = null;
  }

  await prisma.eDP.update({ where: { id: recordId }, data });
  await snapshotHistory("EDP", recordId, payload.userId);
  return NextResponse.json({ success: true });
}

export async function deleteEdp(request: Request, params: Promise<{ id: string }>) {
  return handleDelete(request, params, EDP_CONFIG);
}
