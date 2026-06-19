import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth/session";
import { cancelProposal } from "@workspace/platform/server/agent";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const proposalId = parseInt(id);
  if (isNaN(proposalId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  try {
    const result = await cancelProposal(proposalId, user);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "取消失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
