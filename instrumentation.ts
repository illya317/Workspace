export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { preloadModuleRuntimeOverrides } = await import("@workspace/platform/server/module-management");
  await preloadModuleRuntimeOverrides();
  const { startPermissionReviewScheduler } = await import("@workspace/platform/server/permission-review-scheduler");
  const { startDataQualityScheduler } = await import("@workspace/platform/server/data-quality-scheduler");
  startPermissionReviewScheduler();
  startDataQualityScheduler();
}
