export type NotificationResponseAction = "acknowledge" | "reject";

export type NotificationActionResult =
  | { success: true }
  | { success: false; error: string; status: number };

type NotificationActionProvider = {
  handles: (notificationType: string) => boolean;
  respond: (input: {
    userId: number;
    notificationId: number;
    action: NotificationResponseAction;
  }) => Promise<NotificationActionResult>;
};

const notificationActionProviders: NotificationActionProvider[] = [];

export function registerNotificationActionProvider(provider: NotificationActionProvider) {
  if (!notificationActionProviders.includes(provider)) notificationActionProviders.push(provider);
}

export async function respondToRegisteredNotificationAction(input: {
  notificationType: string;
  userId: number;
  notificationId: number;
  action: NotificationResponseAction;
}) {
  const provider = notificationActionProviders.find((candidate) => candidate.handles(input.notificationType));
  return provider
    ? provider.respond({ userId: input.userId, notificationId: input.notificationId, action: input.action })
    : null;
}
