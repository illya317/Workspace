import type { TreasuryWorkspaceDto } from "../../types/treasury";

export type TreasuryMutation = <T>(method: "POST" | "PUT", payload: object) => Promise<T>;

export type TreasuryViewProps = {
  workspace: TreasuryWorkspaceDto;
  canCreate: boolean;
  canUpdate: boolean;
  mutate: TreasuryMutation;
  targetEntityId?: number | null;
};

export function randomToken() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
