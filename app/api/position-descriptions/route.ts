import { NextResponse } from "next/server";
import { authenticate, checkHRAccess, checkHRWrite } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { getManagementGroupByCode } from "@/server/services/hr/company-directory";
import { snapshotHistory } from "@/lib/history";
import { getInitials } from "@/lib/search";

export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkHRAccess(payload.userId, "access", "people.roster"))) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const search = searchParams.get("search") || "";
  const tree = searchParams.get("tree") === "1";

  // Department tree for docs page
  if (tree) {
    const departments = await prisma.department.findMany({
      where: {},
      select: { id: true, code: true, name: true, level: true, parentId: true },
      orderBy: { code: "asc" },
    });
    const deptMap: Record<string, { code: string; name: string; level: number; parentCode: string | null; positions: string[]; ownPositions?: string[] }> = {};
    for (const d of departments) {
      const parent = departments.find(p => p.id === d.parentId);
      deptMap[d.code] = { code: d.code, name: d.name, level: d.level, parentCode: parent?.code || null, positions: [] as string[] };
    }
    const pds = await prisma.positionDescription.findMany({ select: { code: true, name: true }, orderBy: { code: "asc" } });
    for (const d of pds) {
      const dc = (d.code.split("-")[1] || "");
      let match: string | null = null;
      for (const key of Object.keys(deptMap).sort((a, b) => b.length - a.length)) {
        if (dc.startsWith(key)) { match = key; break; }
      }
      if (match && deptMap[match]) deptMap[match].positions.push(d.code + "|" + d.name);
    }
    // Aggregate: each node keeps own positions + subtree total
    function subtreePositions(deptCode: string): string[] {
      const all = [...deptMap[deptCode].positions];
      for (const d of Object.values(deptMap)) {
        if (d.parentCode === deptCode) all.push(...subtreePositions(d.code));
      }
      return [...new Set(all)].sort();
    }
    for (const d of Object.values(deptMap)) {
      d.ownPositions = d.positions;  // direct positions only
      d.positions = subtreePositions(d.code); // subtree total
    }
    return NextResponse.json({ tree: Object.values(deptMap) });
  }

  // Single detail
  if (code) {
    const desc = await prisma.positionDescription.findUnique({ where: { code } });
    if (!desc) return NextResponse.json({ error: "未找到" }, { status: 404 });

    let details = null;
    if (desc.details) { try { details = JSON.parse(desc.details); } catch { details = null; } }

    return NextResponse.json({
      positionDescription: {
        id: desc.id, code: desc.code, name: desc.name,
        departmentName: desc.departmentName, reportTo: desc.reportTo,
        positionPurpose: desc.positionPurpose, summary: desc.summary,
        headcount: desc.headcount, version: desc.version,
        effectiveDate: desc.effectiveDate, sourceFile: desc.sourceFile,
        managementGroup: await getManagementGroupByCode(desc.code),
        details,
      },
    });
  }

  // List
  const descriptions = await prisma.positionDescription.findMany({
    select: {
      id: true, code: true, name: true, departmentName: true,
      reportTo: true, positionPurpose: true, version: true, effectiveDate: true,
    },
    orderBy: { code: "asc" },
  });

  let result = descriptions;
  if (search) {
    const q = search.toLowerCase();
    result = descriptions.filter((d) =>
      d.code.toLowerCase().includes(q) || d.name.toLowerCase().includes(q) ||
      (d.departmentName || "").toLowerCase().includes(q) || getInitials(d.name).includes(q)
    );
  }

  return NextResponse.json({ positionDescriptions: result, total: result.length });
}

export async function PUT(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkHRWrite(payload.userId, "people.roster"))) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const body = await request.json();
  const {
    id,
    code,
    name,
    departmentName,
    reportTo,
    positionPurpose,
    summary,
    headcount,
    version,
    effectiveDate,
    sourceFile,
    details,
  } = body;

  if (!id) return NextResponse.json({ error: "缺少id" }, { status: 400 });
  if (!code || !name) return NextResponse.json({ error: "说明书编码和名称不能为空" }, { status: 400 });

  const headcountValue = headcount === null || headcount === undefined || headcount === "" ? null : Number(headcount);
  if (headcountValue === null || !Number.isInteger(headcountValue) || headcountValue < 1) {
    return NextResponse.json({ error: "编制必须是正整数" }, { status: 400 });
  }

  let detailsText: string | null = null;
  if (details !== undefined && details !== null && details !== "") {
    try {
      const parsed = typeof details === "string" ? JSON.parse(details) : details;
      detailsText = JSON.stringify(parsed);
    } catch {
      return NextResponse.json({ error: "说明书 JSON 不是合法格式" }, { status: 400 });
    }
  }

  try {
    const updated = await prisma.positionDescription.update({
      where: { id: Number(id) },
      data: {
        code: String(code).trim(),
        name: String(name).trim(),
        departmentName: departmentName || null,
        reportTo: reportTo || null,
        positionPurpose: positionPurpose || null,
        summary: summary || null,
        headcount: headcountValue,
        version: version || null,
        effectiveDate: effectiveDate || null,
        sourceFile: sourceFile || "",
        details: detailsText,
        editedBy: payload.userId,
        editedAt: new Date(),
      },
    });
    await snapshotHistory("PositionDescription", Number(id), payload.userId);
    return NextResponse.json({ success: true, positionDescription: updated });
  } catch (e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json({ error: "说明书编码已存在" }, { status: 409 });
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return NextResponse.json({ error: "岗位说明书不存在" }, { status: 404 });
    }
    throw e;
  }
}
