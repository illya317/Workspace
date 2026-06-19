import { deleteWorkPlanMember, updateWorkPlanMemberField } from "@workspace/work/server";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return updateWorkPlanMemberField(request, params);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return deleteWorkPlanMember(request, params);
}
