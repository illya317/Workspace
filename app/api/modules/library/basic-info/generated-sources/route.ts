import { executeLibraryGeneratedSourcesCommand } from "@workspace/library/server/route-commands";
import { createCommandRoute } from "@workspace/platform/server/api-route";import { okCommand } from "@workspace/platform/server/domain-validation";

export const GET = createCommandRoute({
  buildCommand: () => okCommand({}),
  action: executeLibraryGeneratedSourcesCommand,
});
