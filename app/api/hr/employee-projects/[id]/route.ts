import { handleUpdateField, handleDelete } from "@/lib/crud";
import { prisma } from "@/lib/prisma";
import { rejectInvalidDateField } from "@/lib/hr-field-validation";

const DATE_FIELDS = ["startDate", "endDate"];

async function onBeforeUpdate(field: string, value: unknown) {
  const dateResult = rejectInvalidDateField(field, value, DATE_FIELDS);
  if (!dateResult) return null;
  if (field === "projectId") {
    if (value === null || value === undefined || value === "") return { field, value: null };
    const id = Number(value);
    if (!Number.isInteger(id)) return null;
    const project = await prisma.project.findUnique({ where: { id }, select: { id: true } });
    if (!project) return null;
    return { field, value: id };
  }
  return { field, value };
}

const CONFIG = { entityType: "EmployeeProject", modelKey: "employeeProject" as const, allowedFields: ["employeeId","projectId","role","startDate","endDate"], onBeforeUpdate };

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleUpdateField(request, params, CONFIG);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleDelete(request, params, CONFIG);
}
