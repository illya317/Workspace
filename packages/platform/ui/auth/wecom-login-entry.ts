export type WecomLoginEntry = "in-app" | "mobile-help" | "desktop-panel";

type WecomLoginEnvironment = {
  userAgent: string;
  maxTouchPoints: number;
  viewportWidth: number;
};

export function resolveWecomLoginEntry({
  userAgent,
  maxTouchPoints,
  viewportWidth,
}: WecomLoginEnvironment): WecomLoginEntry {
  if (/wxwork/i.test(userAgent)) return "in-app";
  if (
    /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent)
    || (maxTouchPoints > 1 && viewportWidth < 1024)
  ) {
    return "mobile-help";
  }
  return "desktop-panel";
}
