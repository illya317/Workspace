import {
  createReferenceOptionsRoute,
  referenceOptionsQuerySchema,
} from "@workspace/platform/server/reference-options";
import { withHRAccess } from "@workspace/platform/server/with-auth";

export const GET = withHRAccess(
  createReferenceOptionsRoute({
    scope: "hr",
    validate: (input) => referenceOptionsQuerySchema.safeParse(input),
  }),
);
