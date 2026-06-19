import { deleteWorkPlan, updateWorkPlanField } from "@workspace/work/server";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return updateWorkPlanField(request, params);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return deleteWorkPlan(request, params);
}
