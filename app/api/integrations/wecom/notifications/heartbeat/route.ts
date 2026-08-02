import { handleWecomNotificationHeartbeatRequest } from "@workspace/platform/server/notification-delivery-worker-api";

export const runtime = "nodejs";

export const POST = handleWecomNotificationHeartbeatRequest;
