import {
  failCommand,
  okCommand,
  type DomainValidationResult,
} from "@workspace/platform/server/domain-validation";

export interface SearchLibraryDocumentSetCommand {
  query: string;
  userId: number;
  limit: number;
}

export function buildSearchLibraryDocumentSetCommand(input: {
  query: string;
  userId: number;
  limit?: number;
}): DomainValidationResult<SearchLibraryDocumentSetCommand> {
  const query = input.query.normalize("NFKC").trim();
  if (query.length < 2 || query.length > 200) return failCommand("Query must be 2..200 characters", 400, "query");
  if (!Number.isInteger(input.userId) || input.userId <= 0) return failCommand("Invalid user id", 400, "userId");
  const limit = input.limit ?? 10;
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) return failCommand("Limit must be 1..20", 400, "limit");
  return okCommand({ query, userId: input.userId, limit });
}
