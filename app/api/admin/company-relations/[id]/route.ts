import { deleteCompanyRelation, updateCompanyRelationField } from "@workspace/hr/server";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return updateCompanyRelationField(request, params);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return deleteCompanyRelation(request, params);
}
