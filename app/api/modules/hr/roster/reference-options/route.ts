import { HR_FK_REGISTRY } from "@workspace/hr/server/fk-registry";
import {
  createReferenceOptionsRoute,
  referenceOptionsQuerySchema,
} from "@workspace/platform/server/reference-options";
import { withHRAccess } from "@workspace/platform/server/with-auth";

const genericReferenceOptionsRoute = createReferenceOptionsRoute({
  registry: HR_FK_REGISTRY,
  scope: "hr",
  validate: (input) => referenceOptionsQuerySchema.safeParse(input),
});

export const GET = withHRAccess(genericReferenceOptionsRoute);
