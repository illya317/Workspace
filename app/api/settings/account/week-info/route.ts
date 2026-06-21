import { NextResponse } from "next/server";
import { getCurrentWeekInfo } from "@workspace/platform/server/week-info";
import { z } from "zod";

const weekInfoQuerySchema = z.object({}).passthrough();

export async function GET(request: Request) {
  weekInfoQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams.entries()));
  const info = getCurrentWeekInfo();
  return NextResponse.json(info);
}
