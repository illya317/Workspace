import { handleUpdateField, handleDelete } from "@/lib/crud";
import { normalizeEmployeeOption, rejectInvalidDateField } from "@/lib/hr-field-validation";
import { serializeHrMajorItems } from "@/lib/hr-field-options";
import { normalizeHrSchoolValue } from "@/lib/hr-school-options";

const FIELDS = ["employeeId","name","alias","gender","birthDate","ethnicity","hometown","politics","education","title","school","major","phone","workStartDate","idNumber","otherId","userId"];
const DATE_FIELDS = ["birthDate", "workStartDate"];

function normalizeAliasUpdate(value: unknown) {
  if (!value) return null;
  const text = String(value).trim();
  if (!text) return null;
  let rawTags: unknown[] = [];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) rawTags = parsed;
  } catch {
    rawTags = text.split(/[,，、;；\n]+/);
  }
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const item of rawTags) {
    const tag = String(item).trim();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    tags.push(tag);
  }
  return tags.length > 0 ? JSON.stringify(tags) : null;
}

async function onBeforeUpdate(field: string, value: unknown) {
  if (field === "employeeId") {
    return { error: "员工编号由系统生成，不能手动修改" };
  }
  const dateResult = rejectInvalidDateField(field, value, DATE_FIELDS);
  if (!dateResult) return null;
  if (field === "alias") {
    return { field, value: normalizeAliasUpdate(value) };
  }
  if (field === "major") {
    return { field, value: serializeHrMajorItems(value) };
  }
  if (field === "school") {
    const result = normalizeHrSchoolValue(value);
    if (!result.ok) return { error: result.error };
    return { field, value: result.value };
  }
  if (field === "gender") {
    if (value === "男" || value === true) return { field, value: true };
    if (value === "女" || value === false) return { field, value: false };
    return { field, value: null };
  }
  if (["ethnicity", "politics", "education", "title", "phone", "idNumber"].includes(field)) {
    return normalizeEmployeeOption(field, value);
  }
  return { field, value };
}

const CONFIG = { entityType: "Employee", modelKey: "employee" as const, allowedFields: FIELDS, onBeforeUpdate };

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleUpdateField(request, params, CONFIG);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleDelete(request, params, CONFIG);
}
