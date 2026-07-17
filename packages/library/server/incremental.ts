import { prisma } from "@workspace/platform/server/prisma";

import { buildRunLibraryIncrementalCommand } from "./domain/incremental-validation";
import { previewLibraryVersion, supportsLibraryPreview } from "./preview";
import { scanLibrary } from "./scan";

export async function runLibraryIncremental(input: {
  rootKey?: string;
  preview?: boolean;
  maxPreviews?: number;
}) {
  const validated = buildRunLibraryIncrementalCommand(input);
  if (!validated.ok) throw new Error(validated.issue.message);
  const scan = await scanLibrary(validated.data.rootKey);
  if (scan.errors.length > 0) {
    return { status: "failed" as const, scan, previews: [], ocrMarkdown: "paused" as const };
  }

  const previews = [];
  if (validated.data.preview) {
    for (const versionUid of scan.changedVersionUids.slice(0, validated.data.maxPreviews)) {
      try {
        const version = await prisma.libraryDocumentVersion.findUnique({
          where: { versionUid },
          select: { extension: true },
        });
        if (!supportsLibraryPreview(version?.extension)) {
          previews.push({ versionUid, status: "skipped" as const, reused: false });
          continue;
        }
        const result = await previewLibraryVersion({ versionUid });
        previews.push({ versionUid, status: result.status, reused: result.reused });
      } catch (error) {
        previews.push({ versionUid, status: "failed", error: error instanceof Error ? error.message : String(error) });
      }
    }
  }
  return {
    status: previews.some((item) => item.status === "failed") ? "warning" as const : "succeeded" as const,
    scan,
    previews,
    deferredPreviewCount: validated.data.preview ? Math.max(0, scan.changedVersionUids.length - previews.length) : scan.changedVersionUids.length,
    ocrMarkdown: "paused" as const,
  };
}
