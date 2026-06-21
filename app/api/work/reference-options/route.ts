import {
  createReferenceOptionsRoute,
  referenceOptionsQuerySchema,
} from "@workspace/platform/server/reference-options";
import { withWorkAccess } from "@workspace/platform/server/with-auth";

export const GET = withWorkAccess(
  createReferenceOptionsRoute({
    scope: "work",
    validate: (input) => referenceOptionsQuerySchema.safeParse(input),
  }),
);
