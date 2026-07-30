export function validateProjectNotificationWriteInput<T extends object>(
  input: T,
): T {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("Project notification write input must be an object");
  }
  return input;
}
