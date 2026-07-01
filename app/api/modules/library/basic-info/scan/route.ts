import { z } from "zod";

import {
  executeScanLibraryCommand,
} from "@workspace/library/server";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { okCommand } from "@workspace/platform/server/domain-validation";

const scanRequestSchema = z.object({}).passthrough();

export const POST = createCommandRoute({
  bodySchema: scanRequestSchema,
  optionalJsonBody: true,
  bodyError: "Invalid request body",
  buildCommand: () => okCommand({}),
  action: executeScanLibraryCommand,
});
