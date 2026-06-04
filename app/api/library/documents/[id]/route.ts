import { NextResponse } from "next/server";
import { withLibraryAccess, withLibraryWrite } from "@/lib/with-auth";
import type { RouteContext } from "@/lib/with-auth";
import { getDocument, updateDocumentMetadata } from "@/server/services/library/metadata";
import { getMaxConfidentialityLevel } from "@/server/services/library/permissions";

const VALID_STATUSES = ["active", "missing", "archived", "draft"] as const;

type Status = typeof VALID_STATUSES[number];

interface UpdateBody {
  title?: string;
  summary?: string;
  categoryCode?: string;
  categoryName?: string;
  subcategoryPath?: string;
  confidentialityLevel?: number;
  status?: Status;
}

function validateBody(raw: unknown): { ok: true; body: UpdateBody } | { ok: false; error: string } {
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
    if (typeof body.confidentialityLevel !== "number" || !Number.isInteger(body.confidentialityLevel) || body.confidentialityLevel < 0 || body.confidentialityLevel > 4) {
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

async function checkDocAccess(docId: number, userId: number) {
  const doc = await getDocument(docId);
  if (!doc) return { ok: false as const, status: 404, error: "Not found" };
  const maxLevel = await getMaxConfidentialityLevel(userId);
  if (doc.confidentialityLevel > maxLevel) {
    return { ok: false as const, status: 403, error: "Higher confidentiality required" };
  }
  return { ok: true as const, doc };
}

export const GET = withLibraryAccess(async (_req, user, ctx?: RouteContext) => {
  const { id } = await ctx!.params;
  const docId = parseInt(id, 10);
  if (isNaN(docId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const check = await checkDocAccess(docId, user.userId);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status });

  return NextResponse.json(check.doc);
});

export const PATCH = withLibraryWrite(async (request, user, ctx?: RouteContext) => {
  const { id } = await ctx!.params;
  const docId = parseInt(id, 10);
  if (isNaN(docId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const check = await checkDocAccess(docId, user.userId);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status });

  const raw = await request.json();
  const validated = validateBody(raw);
  if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 });

  // 禁止将保密等级提升到用户可见范围之外
  if (validated.body.confidentialityLevel !== undefined) {
    const maxLevel = await getMaxConfidentialityLevel(user.userId);
    if (validated.body.confidentialityLevel > maxLevel) {
      return NextResponse.json(
        { error: `Cannot set confidentialityLevel above your access level (${maxLevel})` },
        { status: 403 },
      );
    }
  }

  const updated = await updateDocumentMetadata(docId, validated.body, user.userId);
  return NextResponse.json(updated);
});
