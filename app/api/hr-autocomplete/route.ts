import { NextResponse } from "next/server";
import { authenticate, checkHRAccess } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const SEARCH_CONFIG: Record<string, {
  model: keyof typeof prisma;
  searchFields: string[];
  select: Record<string, boolean>;
  labelField: string;
  subtitleField?: string;
  take: number;
}> = {
  employee: {
    model: "employee",
    searchFields: ["name", "employeeId"],
    select: { id: true, name: true, employeeId: true },
    labelField: "name",
    subtitleField: "employeeId",
    take: 20,
  },
  department: {
    model: "department",
    searchFields: ["name", "code"],
    select: { id: true, name: true, code: true },
    labelField: "name",
    subtitleField: "code",
    take: 20,
  },
  position: {
    model: "position",
    searchFields: ["name", "code"],
    select: { id: true, name: true, code: true },
    labelField: "name",
    subtitleField: "code",
    take: 20,
  },
  project: {
    model: "project",
    searchFields: ["name"],
    select: { id: true, name: true },
    labelField: "name",
    take: 20,
  },
  company: {
    model: "company",
    searchFields: ["name", "code"],
    select: { id: true, name: true, code: true },
    labelField: "name",
    subtitleField: "code",
    take: 20,
  },
  user: {
    model: "user",
    searchFields: ["name", "username"],
    select: { id: true, name: true, username: true },
    labelField: "name",
    subtitleField: "username",
    take: 20,
  },
  positionDescription: {
    model: "positionDescription",
    searchFields: ["name", "code"],
    select: { id: true, name: true, code: true },
    labelField: "name",
    subtitleField: "code",
    take: 20,
  },
};

export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  if (!(await checkHRAccess(payload.userId))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const entity = searchParams.get("entity") || "";
  const keyword = searchParams.get("keyword") || "";

  const config = SEARCH_CONFIG[entity];
  if (!config) {
    return NextResponse.json({ error: "不支持的实体类型" }, { status: 400 });
  }

  const model = prisma[config.model] as any;
  const where: any = {};

  if (keyword) {
    where.OR = config.searchFields.map((field) => ({
      [field]: { contains: keyword },
    }));
  }

  const items = await model.findMany({
    where,
    select: config.select,
    take: config.take,
    orderBy: { id: "asc" },
  });

  return NextResponse.json({
    items: items.map((item: any) => ({
      id: item.id,
      name: item[config.labelField],
      subtitle: config.subtitleField ? item[config.subtitleField] : undefined,
    })),
  });
}
