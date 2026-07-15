export type StoredWorkOkrControlScope = {
  type: "global" | "company" | "committee" | "department";
  id: string;
  targetType?: "company" | "committee" | "department";
  targetId?: number;
};

export function normalizeStoredWorkOkrControlScope(
  scopeType: string | null | undefined,
  scopeId: string | null | undefined,
): StoredWorkOkrControlScope | null {
  if (!scopeType) return null;
  if (scopeType === "global") return { type: "global", id: "" };
  if (scopeType !== "department" && scopeType !== "company" && scopeType !== "committee") return null;
  const id = Number(scopeId);
  if (!Number.isInteger(id) || id <= 0) return null;
  return { type: scopeType, id: String(id), targetType: scopeType, targetId: id };
}
