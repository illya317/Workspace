import { failCommand, okCommand } from "@workspace/platform/server/domain-validation";

export function buildRunLibraryIncrementalCommand(input: {
  rootKey?: string;
  preview?: boolean;
  maxPreviews?: number;
}) {
  const rootKey = input.rootKey?.normalize("NFKC").trim() || "default";
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(rootKey)) return failCommand("Invalid root key", 400, "rootKey");
  const maxPreviews = input.maxPreviews ?? 20;
  if (!Number.isInteger(maxPreviews) || maxPreviews < 0 || maxPreviews > 500) {
    return failCommand("maxPreviews must be 0..500", 400, "maxPreviews");
  }
  return okCommand({ rootKey, preview: input.preview ?? false, maxPreviews });
}
