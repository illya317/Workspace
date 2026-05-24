import { handleUpdateField, handleDelete } from "@/lib/crud";

const CONFIG = { entityType: "Employment", modelKey: "employment" as const, allowedFields: ["employeeId","isActive","currentCompany","joinDate","leaveDate","leaveReason","officeLocation","attendanceType","contracts"] };

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleUpdateField(request, params, CONFIG);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleDelete(request, params, CONFIG);
}
