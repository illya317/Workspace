import "server-only";

import path from "path";
import { readdir, readFile } from "fs/promises";
import type {
  DocsEditorDb,
  DocsEditorSpaceRow,
} from "./db";

type GeneratedQcPayload = {
  productKey: string;
  productName: string;
  generatedAt?: string;
  document: unknown;
  fieldModel: unknown;
  audit?: {
    stages?: number;
    fields?: number;
    formulas?: number;
    tables?: number;
  };
};

export async function syncGeneratedQcTemplates(input: {
  db: DocsEditorDb;
  space: DocsEditorSpaceRow;
}) {
  const files = (await readdir(generatedQcProductsRoot()).catch(() => []))
    .filter((file) => file.endsWith(".json"))
    .sort();
  for (const file of files) {
    const payload = await readGeneratedQcPayload(path.join(generatedQcProductsRoot(), file));
    if (!payload) continue;
    await upsertGeneratedQcTemplate(input.db, input.space, payload);
  }
}

async function upsertGeneratedQcTemplate(
  db: DocsEditorDb,
  space: DocsEditorSpaceRow,
  payload: GeneratedQcPayload,
) {
  const existing = await db.documentTemplate.findFirst({
    where: {
      spaceId: space.id,
      sourceKind: "production.qc.official",
      sourceProductKey: payload.productKey,
      deletedAt: null,
    },
    orderBy: { id: "asc" },
  });
  const data = {
    title: `批检验记录：${payload.productName}`,
    type: "qc",
    status: "published",
    ownerUserId: null,
    spaceId: space.id,
    documentJson: JSON.stringify(payload.document),
    fieldModelJson: JSON.stringify(payload.fieldModel),
    sourceKind: "production.qc.official",
    sourceProductKey: payload.productKey,
    sourceStageKeys: JSON.stringify(["intermediate", "packaging", "finished"]),
    publishedAt: payload.generatedAt ? new Date(payload.generatedAt) : null,
    publishedByUserId: null,
  };
  if (existing) {
    await db.documentTemplate.update({
      where: { id: existing.id },
      data: {
        ...data,
        version: { increment: 1 },
        publishRequestedAt: null,
      },
    });
    return;
  }
  await db.documentTemplate.create({ data });
}

function generatedQcProductsRoot() {
  return path.resolve(process.cwd(), "generated", "docs-editor", "qc", "products");
}

async function readGeneratedQcPayload(filePath: string): Promise<GeneratedQcPayload | null> {
  const raw = await readFile(filePath, "utf8").catch(() => "");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<GeneratedQcPayload>;
    return typeof parsed.productKey === "string" && typeof parsed.productName === "string"
      ? parsed as GeneratedQcPayload
      : null;
  } catch {
    return null;
  }
}
