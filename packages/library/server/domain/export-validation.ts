import {
  failCommand,
  okCommand,
  type DomainValidationResult,
} from "@workspace/platform/server/domain-validation";

export interface LibraryExportSelectionItem {
  documentUid: string;
  versionUid: string;
}

export interface CreateLibraryExportCommand {
  userId: number;
  selection: LibraryExportSelectionItem[];
  includePreviews: boolean;
}

export function buildRunLibraryExportCommand(input: { exportUid: string }) {
  const exportUid = input.exportUid.trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(exportUid)) {
    return failCommand("Invalid export uid", 400, "exportUid");
  }
  return okCommand({ exportUid });
}

export function buildCreateLibraryExportCommand(input: {
  userId: number;
  selection: LibraryExportSelectionItem[];
  includePreviews?: boolean;
}): DomainValidationResult<CreateLibraryExportCommand> {
  if (!Number.isInteger(input.userId) || input.userId <= 0) return failCommand("Invalid user id", 400, "userId");
  if (input.selection.length < 1 || input.selection.length > 100) {
    return failCommand("selection must contain 1..100 versions", 400, "selection");
  }
  const seen = new Set<string>();
  for (const [index, item] of input.selection.entries()) {
    if (!item.documentUid || !item.versionUid) return failCommand("Invalid selection item", 400, `selection.${index}`);
    const key = `${item.documentUid}:${item.versionUid}`;
    if (seen.has(key)) return failCommand("Duplicate selection item", 400, `selection.${index}`);
    seen.add(key);
  }
  return okCommand({
    userId: input.userId,
    selection: input.selection,
    includePreviews: input.includePreviews ?? false,
  });
}
