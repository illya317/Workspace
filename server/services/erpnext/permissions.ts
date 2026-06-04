import "server-only";
import type { SessionUser } from "@/lib/types";

export interface ErpNextSnapshotPolicy {
  erpnextUserId: string;
  erpnextUsername: string | null;
  workspaceUserId: number;
}

export function hasErpNextBinding(user: SessionUser): boolean {
  return Boolean(user.erpnextUserId || user.erpnextUsername);
}

export function requireErpNextSnapshotPolicy(user: SessionUser): ErpNextSnapshotPolicy {
  if (!user.erpnextUserId && !user.erpnextUsername) {
    throw new Error("ERPNEXT_USER_NOT_BOUND");
  }

  return {
    erpnextUserId: user.erpnextUserId || user.erpnextUsername!,
    erpnextUsername: user.erpnextUsername ?? null,
    workspaceUserId: user.id,
  };
}
