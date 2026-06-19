import { NextResponse } from "next/server";
import { authenticate, checkHRAccess, checkHRWrite } from "@workspace/platform/server/auth";
import {
  addContract,
  getContracts,
  isValidCompanyName,
  isValidDateValue,
  validateContractOption,
} from "@workspace/hr/server";

const DATE_FIELDS = [
  "firstContractStartDate", "firstContractEndDate",
  "secondContractStartDate", "secondContractEndDate",
  "thirdContractStartDate", "thirdContractEndDate",
  "permanentContractDate", "confidentialityDate",
  "nonCompeteDate", "endDate",
];

export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkHRAccess(payload.userId, "access", "people.roster"))) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const company = searchParams.get("company") || undefined;
  const keyword = searchParams.get("keyword") || undefined;
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const pageSize = Math.min(500, Math.max(1, parseInt(searchParams.get("pageSize") || "50", 10)));

  const result = await getContracts({ company, keyword, page, pageSize });
  return NextResponse.json(result);
}

export async function POST(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkHRWrite(payload.userId, "people.roster"))) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const body = (await request.json()) as Record<string, unknown>;
  const { employeeId, ...contractData } = body;
  for (const field of DATE_FIELDS) {
    if (!isValidDateValue(contractData[field])) {
      return NextResponse.json({ error: "日期格式无效" }, { status: 400 });
    }
  }
  if (!(await isValidCompanyName(contractData.company))) {
    return NextResponse.json({ error: "公司不存在" }, { status: 400 });
  }
  for (const field of ["legalRelation", "contractType", "employmentForm", "insuranceStatus"]) {
    if (!validateContractOption(field, contractData[field])) {
      return NextResponse.json({ error: "字段值不在允许范围内" }, { status: 400 });
    }
  }

  const result = await addContract(employeeId, contractData, payload.userId);

  if (!result.success) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status || 400 }
    );
  }

  return NextResponse.json({ success: true });
}
