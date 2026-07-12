import { createHash } from "node:crypto";
import { z } from "zod";

import { prisma } from "@workspace/platform/server/prisma";

import { buildImportCatalogRecordCommand } from "../server/domain/catalog-import-validation";
import { canonicalizeLibraryTagName } from "../server/domain/tag-taxonomy";

const CatalogRecordSchema = z.object({
  path: z.string().min(1),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  title: z.string(),
  content_summary: z.string(),
  file_type: z.string(),
  classification: z.object({
    theme: z.array(z.string()),
    doctype: z.array(z.string()),
    security_level: z.string(),
  }).passthrough(),
  tags: z.array(z.string()),
  keywords: z.array(z.string()),
  entities: z.record(z.string(), z.array(z.string())),
  key_passages: z.array(z.unknown()),
  chunks: z.array(z.object({
    title: z.string().nullish(),
    section_path: z.string().nullish(),
    page: z.number().int().positive().nullish(),
    context: z.string().nullish(),
    text_preview: z.string().nullish(),
  }).passthrough()),
  read_issues: z.string(),
}).passthrough();

export type LibraryCatalogRecord = z.infer<typeof CatalogRecordSchema>;

export type LibraryTaxonomy = {
  version: string;
  dimensions: Record<"theme" | "doctype" | "event", string[]>;
};

export async function importLibraryCatalog(input: {
  records: unknown[];
  taxonomy: LibraryTaxonomy;
  rootKey?: string;
  promptVersion?: string;
}) {
  const rootKey = input.rootKey || "default";
  const promptVersion = input.promptVersion || "catalog-v3";
  const dimensionByTag = new Map<string, "theme" | "doctype" | "event">();
  for (const [dimension, tags] of Object.entries(input.taxonomy.dimensions)) {
    for (const tag of tags) dimensionByTag.set(tag, dimension as "theme" | "doctype" | "event");
  }
  const tagByName = new Map<string, { id: number; key: string }>();
  for (const [name, dimension] of dimensionByTag) {
    const key = name.normalize("NFKC").trim().toLocaleLowerCase("zh-CN");
    const tag = await prisma.libraryTag.upsert({
      where: { key },
      create: { key, name, dimension, taxonomyVersion: input.taxonomy.version },
      update: { name, dimension, taxonomyVersion: input.taxonomy.version, status: "active" },
      select: { id: true, key: true },
    });
    tagByName.set(name, tag);
  }

  const stats = { total: input.records.length, imported: 0, checksumMismatch: 0, missingDocument: 0, tagCandidates: 0, chunks: 0, excludedFileFactTags: 0 };
  for (const raw of input.records) {
    const record = CatalogRecordSchema.parse(raw);
    const command = buildImportCatalogRecordCommand({ rootKey, path: record.path, checksumSha256: record.sha256 });
    if (!command.ok) throw new Error(command.issue.message);
    const document = await prisma.libraryDocument.findUnique({
      where: { stableKey: command.data.stableKey },
      include: { currentVersion: { select: { id: true, checksumSha256: true } } },
    });
    if (!document?.currentVersion) {
      stats.missingDocument += 1;
      continue;
    }
    if (document.currentVersion.checksumSha256 !== command.data.checksumSha256) {
      stats.checksumMismatch += 1;
      continue;
    }
    const normalizedRecordTags = [...new Set(record.tags.map(canonicalizeLibraryTagName))];
    const formalTags = normalizedRecordTags.filter((tag) => dimensionByTag.has(tag));
    const excludedTags = normalizedRecordTags.filter((tag) => !dimensionByTag.has(tag));
    const chunks = record.chunks
      .map((chunk) => ({ ...chunk, content: (chunk.text_preview || chunk.context || "").trim() }))
      .filter((chunk) => chunk.content);
    await prisma.$transaction(async (tx) => {
      await tx.libraryMetadataCandidate.upsert({
        where: { versionId_promptVersion: { versionId: document.currentVersion!.id, promptVersion } },
        create: {
          documentId: document.id,
          versionId: document.currentVersion!.id,
          title: record.title.trim() || null,
          summary: record.content_summary.trim() || null,
          keywordsJson: JSON.stringify(record.keywords),
          entitiesJson: JSON.stringify(record.entities),
          keyPassagesJson: JSON.stringify(record.key_passages),
          fileFactsJson: JSON.stringify({
            fileType: record.file_type,
            readIssues: record.read_issues,
            excludedTags,
            securityLevelCandidate: record.classification.security_level,
          }),
          source: "legacy-catalog",
          providerKey: "legacy-index",
          modelKey: "unknown",
          promptVersion,
        },
        update: {
          title: record.title.trim() || null,
          summary: record.content_summary.trim() || null,
          keywordsJson: JSON.stringify(record.keywords),
          entitiesJson: JSON.stringify(record.entities),
          keyPassagesJson: JSON.stringify(record.key_passages),
          fileFactsJson: JSON.stringify({
            fileType: record.file_type,
            readIssues: record.read_issues,
            excludedTags,
            securityLevelCandidate: record.classification.security_level,
          }),
          status: "pending",
          reviewedBy: null,
          reviewedAt: null,
        },
      });
      await tx.libraryDocument.update({
        where: { id: document.id },
        data: {
          ...(document.title ? {} : { title: record.title.trim() || null }),
          ...(document.summary ? {} : { summary: record.content_summary.trim() || null }),
          reviewStatus: "pending",
        },
      });
      for (const name of formalTags) {
        const tag = tagByName.get(name)!;
        await tx.libraryTagCandidate.upsert({
          where: {
            versionId_proposedKey_promptVersion: {
              versionId: document.currentVersion!.id,
              proposedKey: tag.key,
              promptVersion,
            },
          },
          create: {
            documentId: document.id,
            versionId: document.currentVersion!.id,
            tagId: tag.id,
            dimension: dimensionByTag.get(name)!,
            proposedKey: tag.key,
            proposedName: name,
            confidence: 0.8,
            evidenceJson: JSON.stringify({ source: "legacy-catalog", requiresReview: true }),
            providerKey: "legacy-index",
            modelKey: "unknown",
            promptVersion,
          },
          update: { tagId: tag.id, proposedName: name, status: "pending", reviewedBy: null, reviewedAt: null },
        });
      }
      for (const [ordinal, chunk] of chunks.entries()) {
        await tx.libraryContentChunk.upsert({
          where: { versionId_ordinal: { versionId: document.currentVersion!.id, ordinal } },
          create: {
            versionId: document.currentVersion!.id,
            ordinal,
            content: chunk.content,
            contentSha256: createHash("sha256").update(chunk.content).digest("hex"),
            locatorJson: JSON.stringify(chunk.page
              ? { schemaVersion: "v1", page: chunk.page }
              : { schemaVersion: "v1", sectionPath: [chunk.section_path || chunk.title || record.title] }),
            headingPathJson: JSON.stringify({ source: "legacy-catalog", path: [chunk.title, chunk.section_path].filter(Boolean) }),
            language: "zh",
          },
          update: {
            content: chunk.content,
            contentSha256: createHash("sha256").update(chunk.content).digest("hex"),
            locatorJson: JSON.stringify(chunk.page
              ? { schemaVersion: "v1", page: chunk.page }
              : { schemaVersion: "v1", sectionPath: [chunk.section_path || chunk.title || record.title] }),
            headingPathJson: JSON.stringify({ source: "legacy-catalog", path: [chunk.title, chunk.section_path].filter(Boolean) }),
            language: "zh",
          },
        });
      }
      await tx.libraryContentChunk.deleteMany({
        where: { versionId: document.currentVersion!.id, artifactId: null, ordinal: { gte: chunks.length } },
      });
    });
    stats.imported += 1;
    stats.tagCandidates += formalTags.length;
    stats.chunks += chunks.length;
    stats.excludedFileFactTags += excludedTags.length;
  }
  return stats;
}
