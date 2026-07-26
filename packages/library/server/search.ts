import { buildSearchLibraryDocumentSetCommand } from "./domain/search-validation";
import { getLibraryDocumentAccessPolicy } from "./permissions";
import { queryLibraryDocumentSet } from "./search-query";

export async function searchLibraryDocumentSet(input: { query: string; userId: number; limit?: number }) {
  const validated = buildSearchLibraryDocumentSetCommand(input);
  if (!validated.ok) throw new Error(validated.issue.message);
  const command = validated.data;
  const accessPolicy = await getLibraryDocumentAccessPolicy(command.userId);
  if (accessPolicy.maxConfidentialityLevel <= 0) throw new Error("No Library read permission");
  return queryLibraryDocumentSet({ query: command.query, limit: command.limit, accessPolicy });
}
