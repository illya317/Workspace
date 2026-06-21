import { withWorkAccess } from "@workspace/platform/server/with-auth";
import { listWorkReferenceOptions } from "@workspace/work/server";

export const GET = withWorkAccess(listWorkReferenceOptions);
