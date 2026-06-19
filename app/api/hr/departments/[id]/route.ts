import { deleteDepartmentByParams, updateDepartmentField } from "@workspace/hr/server";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return updateDepartmentField(request, params);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return deleteDepartmentByParams(request, params);
}
