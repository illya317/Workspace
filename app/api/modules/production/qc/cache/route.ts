import { createInternalApiRoute } from "@workspace/platform/server/api-route";
import { buildQcTemplateCache } from "@workspace/production/server/qc";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const POST = createInternalApiRoute({
  authorize: ({ request }) => request.headers.get("x-qc-cache-warmup") === process.env.NEXTAUTH_SECRET,
  handler: async () => {
    const cache = await buildQcTemplateCache();
    return {
    ok: true,
    builtAt: cache.builtAt,
    contentHash: cache.contentHash,
    productCount: Object.keys(cache.templates).length,
    };
  },
});
