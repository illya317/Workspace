import { authenticate } from "./authenticate";
import { authorize } from "./authorize";

export async function requireAdmin(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return { error: "未登录", status: 401, payload: null };
  if (await authorize({ user: payload.userId, resourceKey: "system", action: "admin" })) {
    return { error: null, status: 200, payload };
  }
  return { error: "无权限", status: 403, payload: null };
}

export async function isAdmin(request: Request): Promise<boolean> {
  const payload = await authenticate(request);
  if (!payload) return false;
  return isSuperAdmin(payload.userId);
}

export async function isSuperAdmin(userId: number): Promise<boolean> {
  return authorize({ user: userId, resourceKey: "system", action: "admin" });
}
