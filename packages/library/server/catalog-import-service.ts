import { createHash } from "node:crypto";

import { prisma } from "@workspace/platform/server/prisma";

import {
  assertImportCatalogRecordCommand,
  type ImportCatalogRecordCommand,
} from "./domain/catalog-import-validation";
import { canonicalizeLibraryTagName } from "./domain/tag-taxonomy";

export type LibraryCatalogRecord = {
  path: string;
  sha256: string;
  title: string;
  content_summary: string;
  file_type: string;
  classification: {
    theme: string[];
    doctype: string[];
    security_level: string;
  };
  tags: string[];
  keywords: string[];
  entities: Record<string, string[]>;
  key_passages: unknown[];
  chunks: Array<{
    title?: string | null;
    section_path?: string | null;
    page?: number | null;
    context?: string | null;
    text_preview?: string | null;
  }>;
  read_issues: string;
};

export type LibraryTaxonomy = {
  version: string;
  dimensions: Record<"theme" | "doctype" | "event", string[]>;
};

type PreparedCatalogRecord = {
  record: LibraryCatalogRecord;
  command: ImportCatalogRecordCommand;
};

export async function commitLibraryCatalogImport(input: {
  records: PreparedCatalogRecord[];
  taxonomy: LibraryTaxonomy;
  promptVersion: string;
}) {
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

  const stats = {
    total: input.records.length,
    imported: 0,
    checksumMismatch: 0,
    missingDocument: 0,
    tagCandidates: 0,
    chunks: 0,
    excludedFileFactTags: 0,
  };
  for (const { record, command: rawCommand } of input.records) {
    const command = assertImportCatalogRecordCommand(rawCommand);
    const document = await prisma.libraryDocument.findUnique({
      where: { stableKey: command.stableKey },
      include: { currentVersion: { select: { id: true, checksumSha256: true } } },
    });
    if (!document?.currentVersion) {
      stats.missingDocument += 1;
      continue;
    }
    if (document.currentVersion.checksumSha256 !== command.checksumSha256) {
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
        where: { versionId_promptVersion: { versionId: document.currentVersion!.id, promptVersion: input.promptVersion } },
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
          promptVersion: input.promptVersion,
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
              promptVersion: input.promptVersion,
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
            promptVersion: input.promptVersion,
          },
          update: {
            tagId: tag.id,
            proposedName: name,
            status: "pending",
            reviewedBy: null,
            reviewedAt: null,
          },
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
            headingPathJson: JSON.stringify({
              source: "legacy-catalog",
              path: [chunk.title, chunk.section_path].filter(Boolean),
            }),
            language: "zh",
          },
          update: {
            content: chunk.content,
            contentSha256: createHash("sha256").update(chunk.content).digest("hex"),
            locatorJson: JSON.stringify(chunk.page
              ? { schemaVersion: "v1", page: chunk.page }
              : { schemaVersion: "v1", sectionPath: [chunk.section_path || chunk.title || record.title] }),
            headingPathJson: JSON.stringify({
              source: "legacy-catalog",
              path: [chunk.title, chunk.section_path].filter(Boolean),
            }),
            language: "zh",
          },
        });
      }
      await tx.libraryContentChunk.deleteMany({
        where: {
          versionId: document.currentVersion!.id,
          artifactId: null,
          ordinal: { gte: chunks.length },
        },
      });
    });
    stats.imported += 1;
    stats.tagCandidates += formalTags.length;
    stats.chunks += chunks.length;
    stats.excludedFileFactTags += excludedTags.length;
  }
  return stats;
}
