const VALID_STATUSES = ["active", "missing", "archived", "draft"] as const;
export type Status = (typeof VALID_STATUSES)[number];

export interface UpdateBody {
  title?: string;
  summary?: string;
  categoryCode?: string;
  categoryName?: string;
  subcategoryPath?: string;
  confidentialityLevel?: number;
  status?: Status;
}

export function validateBody(raw: unknown): { ok: true; body: UpdateBody } | { ok: false; error: string } {
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, error: "Body must be an object" };
  }
  const body = raw as Record<string, unknown>;
  const out: UpdateBody = {};

  if (body.title !== undefined) {
    if (typeof body.title !== "string") return { ok: false, error: "title must be a string" };
    out.title = body.title;
  }
  if (body.summary !== undefined) {
    if (typeof body.summary !== "string") return { ok: false, error: "summary must be a string" };
    out.summary = body.summary;
  }
  if (body.categoryCode !== undefined) {
    if (typeof body.categoryCode !== "string") return { ok: false, error: "categoryCode must be a string" };
    out.categoryCode = body.categoryCode;
  }
  if (body.categoryName !== undefined) {
    if (typeof body.categoryName !== "string") return { ok: false, error: "categoryName must be a string" };
    out.categoryName = body.categoryName;
  }
  if (body.subcategoryPath !== undefined) {
    if (typeof body.subcategoryPath !== "string") return { ok: false, error: "subcategoryPath must be a string" };
    out.subcategoryPath = body.subcategoryPath;
  }
  if (body.confidentialityLevel !== undefined) {
    if (
      typeof body.confidentialityLevel !== "number" ||
      !Number.isInteger(body.confidentialityLevel) ||
      body.confidentialityLevel < 0 ||
      body.confidentialityLevel > 4
    ) {
      return { ok: false, error: "confidentialityLevel must be an integer between 0 and 4" };
    }
    out.confidentialityLevel = body.confidentialityLevel;
  }
  if (body.status !== undefined) {
    if (!VALID_STATUSES.includes(body.status as Status)) {
      return { ok: false, error: `status must be one of: ${VALID_STATUSES.join(", ")}` };
    }
    out.status = body.status as Status;
  }

  return { ok: true, body: out };
}
