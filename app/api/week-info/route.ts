import { NextResponse } from "next/server";
import { getCurrentWeekInfo } from "@/lib/week";

export async function GET() {
  const info = getCurrentWeekInfo();
  return NextResponse.json(info);
}
