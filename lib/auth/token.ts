import { SignJWT, jwtVerify } from "jose";

export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const SESSION_EXPIRATION = "30d";

function getSecret() {
  const secretRaw = process.env.NEXTAUTH_SECRET;
  if (!secretRaw && process.env.NODE_ENV === "production") {
    throw new Error("NEXTAUTH_SECRET is required in production");
  }
  return new TextEncoder().encode(secretRaw || "weekly-report-secret-key-2026-dev-only");
}

export async function createToken(payload: {
  userId: number;
  wxUserId: string;
  name: string;
  departmentId: number;
  departmentName?: string | null;
  sessionVersion: number;
}) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(SESSION_EXPIRATION)
    .setIssuedAt()
    .sign(getSecret());
}

export async function verifyToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      clockTolerance: 60,
    });
    return payload as unknown as {
      userId: number;
      wxUserId: string;
      name: string;
      departmentId: number;
      departmentName?: string | null;
      sessionVersion: number;
    };
  } catch {
    return null;
  }
}

export function getTokenFromCookie(request: Request) {
  const cookie = request.headers.get("cookie");
  if (!cookie) return null;
  const match = cookie.match(/token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export type AuthPayload = {
  userId: number;
  wxUserId: string;
  name: string;
  departmentId: number;
  departmentName?: string | null;
};
