import {
  createReferenceOptionsRoute,
  referenceOptionsQuerySchema,
} from "@workspace/platform/server/reference-options";
import { WORK_FK_REGISTRY } from "./fk-registry";

export const listWorkReferenceOptions = createReferenceOptionsRoute({
  registry: WORK_FK_REGISTRY,
  scope: "work",
  validate: (input) => referenceOptionsQuerySchema.safeParse(input),
});
