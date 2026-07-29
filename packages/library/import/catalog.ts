import { z } from "zod";

import {
  commitLibraryCatalogImport,
  type LibraryCatalogRecord,
  type LibraryTaxonomy,
} from "../server/catalog-import-service";
import { buildImportCatalogRecordCommand } from "../server/domain/catalog-import-validation";

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

export type { LibraryCatalogRecord, LibraryTaxonomy } from "../server/catalog-import-service";

export async function importLibraryCatalog(input: {
  records: unknown[];
  taxonomy: LibraryTaxonomy;
  rootKey?: string;
  promptVersion?: string;
}) {
  const rootKey = input.rootKey || "default";
  const records = input.records.map((raw) => {
    const record = CatalogRecordSchema.parse(raw) as LibraryCatalogRecord;
    const command = buildImportCatalogRecordCommand({
      rootKey,
      path: record.path,
      checksumSha256: record.sha256,
    });
    if (!command.ok) throw new Error(command.issue.message);
    return { record, command: command.data };
  });

  return commitLibraryCatalogImport({
    records,
    taxonomy: input.taxonomy,
    promptVersion: input.promptVersion || "catalog-v3",
  });
}
