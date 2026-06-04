import { handleUpdateField, handleDelete } from "@/lib/crud";

const CONFIG = { entityType: "Company", modelKey: "company" as const, allowedFields: ["code","name","fullName","registeredCapital","unifiedCode","bankName","registeredAddress","registeredDate","legalPerson","managementGroup","codePoolCode","isActive","sortOrder"] };

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleUpdateField(request, params, CONFIG);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleDelete(request, params, CONFIG);
}
