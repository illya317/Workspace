import { NextResponse } from "next/server";

export function inventoryApiGone() {
  return NextResponse.json(
    { error: "旧库存管理已关闭，请使用生产管理下的批次检验或检验模板入口。" },
    { status: 410 },
  );
}
