import { withOpenApiScope } from "@workspace/platform/server/open-api";
import { listPublishedNotificationDefinitionsForSource } from "@workspace/platform/server/notification-publishing";

export const GET = withOpenApiScope(
  "workspace.notifications.definitions.read",
  "read",
  async (_request, { client }) => Response.json({
    items: await listPublishedNotificationDefinitionsForSource({
      kind: "open-api",
      id: String(client.id),
      label: client.name,
    }),
  }),
);
