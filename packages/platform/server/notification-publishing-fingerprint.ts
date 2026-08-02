import { createHash } from "node:crypto";

export type NotificationPublicationFingerprintSource = {
  kind: "internal" | "user-api" | "open-api";
  id: string;
};

export type NotificationPublicationFingerprintRequest = {
  definitionKey: string;
  usernames: string[];
  variables: Record<string, string | number | boolean>;
  deliveryChannels?: readonly ("workspace" | "wecom")[];
};

export function canonicalNotificationPublicationFingerprint(
  source: NotificationPublicationFingerprintSource,
  request: NotificationPublicationFingerprintRequest,
) {
  const usernames = [...new Set(request.usernames)].sort(compareText);
  const variables = Object.fromEntries(
    Object.entries(request.variables).sort(([left], [right]) => compareText(left, right)),
  );
  const deliveryChannels = [...new Set(request.deliveryChannels ?? ["workspace"])].sort(compareText);
  return createHash("sha256").update(JSON.stringify({
    source: { kind: source.kind, id: source.id },
    request: { definitionKey: request.definitionKey, usernames, variables, deliveryChannels },
  })).digest("hex");
}

export function legacyNotificationPublicationFingerprint(
  source: NotificationPublicationFingerprintSource,
  request: NotificationPublicationFingerprintRequest,
) {
  const usernames = [...new Set(request.usernames)].sort(compareText);
  const variables = Object.fromEntries(
    Object.entries(request.variables).sort(([left], [right]) => compareText(left, right)),
  );
  return createHash("sha256").update(JSON.stringify({
    source: { kind: source.kind, id: source.id },
    request: { definitionKey: request.definitionKey, usernames, variables },
  })).digest("hex");
}

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}
