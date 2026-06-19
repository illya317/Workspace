import { NextResponse } from "next/server";

export function ok(data?: Record<string, unknown>) {
  return NextResponse.json({ success: true, ...data });
}

export function error(message: string, status: number = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function unauthorized(message = "未登录") {
  return NextResponse.json({ error: message }, { status: 401 });
}

export function forbidden(message = "无权限") {
  return NextResponse.json({ error: message }, { status: 403 });
}

export function notFound(message = "未找到") {
  return NextResponse.json({ error: message }, { status: 404 });
}

export function json<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}
