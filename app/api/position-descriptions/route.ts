import { NextResponse } from "next/server";
import { authenticate } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isPharma } from "@/lib/company";
import { getInitials } from "@/lib/search";

export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const search = searchParams.get("search") || "";
  const tree = searchParams.get("tree") === "1";

  // Department tree for docs page
  if (tree) {
    const departments = await prisma.department.findMany({
      where: { level: { in: [1, 2] } },
      select: { id: true, code: true, name: true, level: true, parentId: true },
      orderBy: { code: "asc" },
    });
    const deptMap: Record<string, any> = {};
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
        managementGroup: isPharma(desc.code) ? "GMP" : "常规体系",
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
