export function getAppVersion() {
  return process.env.NEXT_PUBLIC_BUILD_VERSION || process.env.BUILD_VERSION || "development";
}
