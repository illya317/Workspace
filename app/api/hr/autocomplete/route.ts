import { NextResponse } from "next/server";
import { authenticate, checkHRAccess } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getInitials } from "@/lib/search";

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
    select: { id: true, name: true, employeeId: true, alias: true },
    labelField: "name",
    subtitleField: "employeeId",
    take: 100,
  },
  department: {
    model: "department",
    searchFields: ["name", "code"],
    select: { id: true, name: true, code: true },
    labelField: "name",
    subtitleField: "code",
    take: 100,
  },
  position: {
    model: "position",
    searchFields: ["name", "code"],
    select: { id: true, name: true, code: true },
    labelField: "name",
    subtitleField: "code",
    take: 100,
  },
  project: {
    model: "project",
    searchFields: ["name"],
    select: { id: true, name: true },
    labelField: "name",
    take: 100,
  },
  company: {
    model: "company",
    searchFields: ["name", "code"],
    select: { id: true, name: true, code: true },
    labelField: "name",
    subtitleField: "code",
    take: 100,
  },
  user: {
    model: "user",
    searchFields: ["name", "username"],
    select: { id: true, name: true, username: true },
    labelField: "name",
    subtitleField: "username",
    take: 100,
  },
  positionDescription: {
    model: "positionDescription",
    searchFields: ["name", "code"],
    select: { id: true, name: true, code: true },
    labelField: "name",
    subtitleField: "code",
    take: 100,
  },
};

function matchRecord(record: any, keyword: string, searchFields: string[]): boolean {
  const q = keyword.toLowerCase();
  // 字段包含匹配
  for (const field of searchFields) {
    const val = String(record[field] || "").toLowerCase();
    if (val.includes(q)) return true;
  }
  // 拼音首字母匹配（对 name 字段）
  const name = record.name || "";
  if (name) {
    const initials = getInitials(name);
    if (initials.includes(q)) return true;
  }
  return false;
}

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
  const MAX_RESULTS = 50;
  // 短关键字（1-3 chars）可能是拼音首字母，跳过 DB contains 直接用拼音匹配
  const isShort = keyword.length <= 3;

  if (keyword) {
    const where = isShort ? {} : { OR: config.searchFields.map((f) => ({ [f]: { contains: keyword } })) };
    const take = isShort ? 1000 : MAX_RESULTS;
    const items = await model.findMany({ where, select: config.select, take, orderBy: { id: "asc" } });
    const mapped = items.map((item: any) => ({
      id: item.id,
      name: item[config.labelField],
      subtitle: config.subtitleField ? item[config.subtitleField] : undefined,
    }));
    const filtered = mapped.filter((item: any) => matchRecord(item, keyword, config.searchFields));
    return NextResponse.json({ items: filtered });
  }

  const items = await model.findMany({
    select: config.select,
    take: MAX_RESULTS,
    orderBy: { id: "asc" },
  });
  const mapped = items.map((item: any) => ({
    id: item.id,
    name: item[config.labelField],
    subtitle: config.subtitleField ? item[config.subtitleField] : undefined,
  }));
  return NextResponse.json({ items: mapped });
}
