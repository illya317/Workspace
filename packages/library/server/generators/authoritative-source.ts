import {
  loadRemoteAuthoritativeLibraryArtifact,
} from "@workspace/platform/server/authoritative-library-source-client";
import {
  decodeAuthoritativeLibraryContent,
  type AuthoritativeLibraryArtifact,
} from "@workspace/platform/server/authoritative-library-source-contract";
import * as XLSX from "xlsx";

import type { GeneratorOutput } from "./types";

export type AuthoritativeGeneratorConfig = {
  ownerUnitId: string;
  routeModuleKey?: string;
  sourceKey: string;
};

export function authoritativeArtifactOutput(
  artifact: AuthoritativeLibraryArtifact,
): GeneratorOutput {
  const content = decodeAuthoritativeLibraryContent(artifact);
  return {
    fileName: artifact.fileName,
    title: artifact.title,
    summary: artifact.summary,
    content: artifact.extension === "xlsx" ? fitGeneratedWorkbook(content) : content,
    mimeType: artifact.mimeType,
    extension: artifact.extension,
    identityKey: artifact.identityKey,
    asOfDate: artifact.asOfDate,
    verifiedAt: artifact.verifiedAt,
    reviewStatus: "approved",
  };
}

export async function generateAuthoritativeSource(config: AuthoritativeGeneratorConfig) {
  const artifacts = await loadRemoteAuthoritativeLibraryArtifact(config);
  return artifacts.map(authoritativeArtifactOutput);
}

function displayWidth(value: unknown) {
  return Array.from(String(value ?? "")).reduce((width, character) => (
    width + (/^[\u0000-\u00ff]$/.test(character) ? 1 : 2)
  ), 0);
}

function mergedAnchorColumns(worksheet: XLSX.WorkSheet, row: number, column: number) {
  const merge = worksheet["!merges"]?.find((range) => (
    range.s.r === row && range.s.c === column && range.e.c > range.s.c
  ));
  return merge ? merge.e.c - merge.s.c + 1 : 1;
}

/** Ensure every generated spreadsheet opens with readable, bounded column widths. */
export function fitGeneratedWorkbook(content: Buffer): Buffer {
  const workbook = XLSX.read(content, { type: "buffer", cellStyles: true, cellNF: true });
  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet?.["!ref"]) continue;
    const range = XLSX.utils.decode_range(worksheet["!ref"]);
    const widths: number[] = Array.from({ length: range.e.c + 1 }, (_, column) => (
      column === 0 ? 24 : 12
    ));
    for (let row = range.s.r; row <= range.e.r; row += 1) {
      for (let column = range.s.c; column <= range.e.c; column += 1) {
        const cell = worksheet[XLSX.utils.encode_cell({ r: row, c: column })];
        if (!cell || mergedAnchorColumns(worksheet, row, column) > 1) continue;
        widths[column] = Math.max(widths[column]!, Math.min(50, displayWidth(cell.w ?? cell.v) + 2));
      }
    }
    worksheet["!cols"] = widths.map((wch, column) => ({
      wch: Math.max(wch, worksheet["!cols"]?.[column]?.wch ?? 0),
    }));
  }
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx", cellStyles: true }) as Buffer;
}
