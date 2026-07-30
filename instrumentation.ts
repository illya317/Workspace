export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { preloadModuleRuntimeOverrides } = await import("@workspace/settings/server/module-management");
  const { COMPANY_DOCUMENTATION_REFERENCE } = await import("@workspace/docs/company-documents");
  const { registerPersonalApiDocumentationReference } = await import(
    "@workspace/platform/server/personal-api-catalog"
  );
  registerPersonalApiDocumentationReference(COMPANY_DOCUMENTATION_REFERENCE);
  await preloadModuleRuntimeOverrides();
  const { startPermissionReviewScheduler } = await import("@workspace/platform/server/permission-review-scheduler");
  const { startDataQualityScheduler } = await import("@workspace/platform/server/data-quality-scheduler");
  startPermissionReviewScheduler();
  startDataQualityScheduler();
}
