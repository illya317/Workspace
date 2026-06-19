import { deleteCompanyByParams, updateCompanyField } from "@workspace/hr/server";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return updateCompanyField(request, params);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return deleteCompanyByParams(request, params);
}
