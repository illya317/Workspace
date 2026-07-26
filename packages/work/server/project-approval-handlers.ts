export function remainingProjectConfirmationHandlers(handlerUserIds: number[], submitterUserId: number) {
  const handlers = Array.from(new Set(handlerUserIds.filter((userId) => Number.isInteger(userId) && userId > 0)));
  if (handlers.length > 1 && handlers.includes(submitterUserId)) {
    return handlers.filter((userId) => userId !== submitterUserId);
  }
  return handlers;
}
