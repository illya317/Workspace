import { NextResponse } from "next/server";
import { jsonErrorResponse } from "../api";

export function ok(data?: Record<string, unknown>) {
  return NextResponse.json({ success: true, ...data });
}

export function error(message: string, status: number = 400) {
  return jsonErrorResponse(message, status);
}

export function unauthorized(message = "未登录") {
  return jsonErrorResponse(message, 401);
}

export function forbidden(message = "无权限") {
  return jsonErrorResponse(message, 403);
}

export function notFound(message = "未找到") {
  return jsonErrorResponse(message, 404);
}

export function json<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}
