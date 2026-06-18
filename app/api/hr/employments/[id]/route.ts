import { NextResponse } from "next/server";
import { handleUpdateField } from "@/lib/crud";
import { rejectInvalidDateField, validateEmploymentOption } from "@/lib/hr-field-validation";

const DATE_FIELDS = ["joinDate", "leaveDate"];

async function onBeforeUpdate(field: string, value: unknown) {
  const dateResult = rejectInvalidDateField(field, value, DATE_FIELDS);
  if (!dateResult) return null;
  const optionResult = validateEmploymentOption(field, value);
  if (!optionResult) return null;
  return { field, value };
}

const CONFIG = { entityType: "Employment", modelKey: "employment" as const, allowedFields: ["employeeId","isActive","joinDate","leaveDate","leaveReason","officeLocation","personnelType","rank","title","contracts"], onBeforeUpdate };

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleUpdateField(request, params, CONFIG);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  void request;
  void params;
  return NextResponse.json({ error: "雇佣记录不允许删除" }, { status: 405 });
}
