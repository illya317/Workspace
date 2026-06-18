import { handleUpdateField, handleDelete } from "@/lib/crud";
import { rejectInvalidDateField } from "@/lib/hr-field-validation";

const DATE_FIELDS = ["startDate", "endDate"];

async function onBeforeUpdate(field: string, value: unknown) {
  const dateResult = rejectInvalidDateField(field, value, DATE_FIELDS);
  if (!dateResult) return null;
  if (DATE_FIELDS.includes(field)) {
    return { field, value: value ? new Date(`${value}T00:00:00`) : null };
  }
  return { field, value };
}

const CONFIG = { entityType: "Project", modelKey: "project" as const, allowedFields: ["name","type","description","startDate","endDate"], onBeforeUpdate };

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleUpdateField(request, params, CONFIG);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleDelete(request, params, CONFIG);
}
