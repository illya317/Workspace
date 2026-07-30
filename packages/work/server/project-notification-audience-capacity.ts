import { NOTIFICATION_RECIPIENT_MAX_COUNT } from "@workspace/platform/server/notification-definition-dsl";

export const PROJECT_NOTIFICATION_AUDIENCE_MAX_COUNT = NOTIFICATION_RECIPIENT_MAX_COUNT;

export function projectNotificationAudienceCapacity(count: number) {
  return {
    count,
    maxCount: PROJECT_NOTIFICATION_AUDIENCE_MAX_COUNT,
    exceeded: count > PROJECT_NOTIFICATION_AUDIENCE_MAX_COUNT,
  };
}

export function projectNotificationAudienceCapacityMessage(count: number) {
  return `当前 RASCI 受众 ${count} 人，超过单次通知上限 ${PROJECT_NOTIFICATION_AUDIENCE_MAX_COUNT} 人`;
}
