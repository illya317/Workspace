import { z } from "zod";

import { commitNewsReactionCommand } from "@workspace/news/server";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { okCommand } from "@workspace/platform/server/domain-validation";

const bodySchema = z.object({
  itemKey: z.string(),
  reportId: z.string().nullish(),
  title: z.string(),
  source: z.string().nullish(),
  url: z.string().nullish(),
  reaction: z.enum(["like", "dislike"]).nullable(),
});

export const POST = createCommandRoute({
  bodySchema,
  buildCommand: ({ body, user }) => okCommand({
    userId: user.userId,
    body,
  }),
  action: commitNewsReactionCommand,
});
