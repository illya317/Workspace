import { rejectEmploymentDelete, updateEmploymentField } from "@workspace/hr/server";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return updateEmploymentField(request, params);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  void request;
  void params;
  return rejectEmploymentDelete();
}
