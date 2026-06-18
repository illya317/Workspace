import { handleCreate } from "@/lib/crud";
import { NextResponse } from "next/server";
import { isValidDateValue, validateEmploymentOption } from "@/lib/hr-field-validation";

const CONFIG = { entityType: "Employment", modelKey: "employment" as const };
const DATE_FIELDS = ["joinDate", "leaveDate"];
import { authenticate, checkHRAccess } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { matchEmployee } from "@/lib/search";
import { parseContracts } from "@/server/services/contracts";

function primaryContractCompany(contractsJson: string | null, fallback: string | null) {
  const contracts = parseContracts(contractsJson);
  const primaryCompany = String(contracts.find((contract) => contract.isPrimary === true && contract.company)?.company ?? "");
  const firstCompany = String(contracts.find((contract) => contract.company)?.company ?? "");
  return primaryCompany || firstCompany || fallback || null;
}

export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkHRAccess(payload.userId, "access", "people.roster"))) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const keyword = searchParams.get("keyword") || "";
  const isActive = searchParams.get("isActive");
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const pageSize = Math.min(500, Math.max(1, parseInt(searchParams.get("pageSize") || "50", 10)));

  const where: Prisma.EmploymentWhereInput = {};
  if (isActive !== null && isActive !== "") {
    where.isActive = isActive === "true" ? true : isActive === "false" ? false : undefined;
  }

  const items = await prisma.employment.findMany({
    where,
    include: { employee: { select: { id: true, employeeId: true, name: true } } },
    orderBy: { id: "asc" },
  });

  const mapped = items.map((item) => ({
    id: item.id,
    employeeId: item.employeeId,
    employeeName: item.employee?.name || "",
    isActive: item.isActive,
    currentCompany: primaryContractCompany(item.contracts, item.currentCompany),
    joinDate: item.joinDate,
    leaveDate: item.leaveDate,
    leaveReason: item.leaveReason,
    officeLocation: item.officeLocation,
    personnelType: item.personnelType,
    rank: item.rank,
    title: item.title,
    contracts: item.contracts,
  }));

  let filtered = mapped;
  if (keyword) {
    filtered = mapped.filter((e) =>
      matchEmployee({ name: e.employeeName, employeeId: String(e.employeeId) }, keyword) ||
      e.employeeName?.includes(keyword)
    );
  }

  const total = filtered.length;
  const start = (page - 1) * pageSize;
  const paged = filtered.slice(start, start + pageSize);

  return NextResponse.json({ items: paged, total });
}

export async function POST(request: Request) {
  return handleCreate(request, CONFIG, async (body) => {
    const required = ["employeeId"];
    for (const f of required) if (!body[f]) return null;
    for (const f of DATE_FIELDS) if (!isValidDateValue(body[f])) return null;
    if (!validateEmploymentOption("officeLocation", body.officeLocation)) return null;
    if (!validateEmploymentOption("personnelType", body.personnelType)) return null;
    if (!validateEmploymentOption("rank", body.rank)) return null;
    if (!validateEmploymentOption("title", body.title)) return null;
    const safeBody = { ...body };
    delete safeBody.currentCompany;
    delete safeBody.attendanceType;
    return safeBody;
  });
}
