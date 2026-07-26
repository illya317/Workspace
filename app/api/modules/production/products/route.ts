import { createCommandRoute } from "@workspace/platform/server/api-route";
import { okCommand } from "@workspace/platform/server/domain-validation";
import { executeCreateProductCommand, listProducts, ProductCreateSchema, ProductQuerySchema } from "@workspace/production/server";

export const GET = createCommandRoute({
  querySchema: ProductQuerySchema,
  buildCommand: ({ query }) => okCommand(query),
  action: listProducts,
});

export const POST = createCommandRoute({
  bodySchema: ProductCreateSchema,
  buildCommand: ({ body, user }) => okCommand({ body, userId: user.userId }),
  action: executeCreateProductCommand,
});
