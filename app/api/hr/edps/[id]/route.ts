import { deleteEdp, updateEdpField } from "@workspace/hr/server";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return updateEdpField(request, params);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return deleteEdp(request, params);
}
