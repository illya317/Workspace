/**
 * Exact files owned by semantic production-operation Modules.
 *
 * Keeping these reviewed catalogs outside the declaration engine prevents the
 * recursive contract implementation from becoming another oversized module.
 */
export const OPERATIONS_RELEASE_CI_FILES = [
  "ops/cnb-build-timing-summary.mjs", "ops/cnb-build-timing-summary.test.mjs",
  "ops/cnb-builder-contract.test.mjs", "ops/cnb-release-gate.test.mjs",
  "ops/cnb-release-target.test.mjs", "ops/cnb-release.yml", "ops/publish-cnb.sh",
  "ops/publish-contract.test.mjs", "ops/release-gate-receipt.mjs",
  "ops/release-gate-receipt.test.mjs", "ops/release-process-timing.mjs",
  "ops/release-process-timing.test.mjs", "ops/release-receipt.mjs",
  "ops/release-receipt.test.mjs", "ops/release-timing.mjs", "ops/release-timing.test.mjs",
  "ops/release-to-cnb.sh", "ops/run-cnb-release-gate.sh", "ops/run-cnb-release-stage.sh",
  "ops/run-local-release-action.sh", "ops/run-release-ci.sh", "ops/run-release-e2e.sh",
  "ops/validate-cnb-release-config.mjs", "ops/validate-cnb-release-config.test.mjs",
  "ops/verify-cnb-builder.sh",
] as const;

export const OPERATIONS_ARTIFACT_SUPPLY_FILES = [
  "ops/build-cnb-release-target.sh", "ops/build-deploy-unit-artifact.sh",
  "ops/build-standalone-artifact.sh", "ops/build-standalone-artifact.test.mjs",
  "ops/cnb-release-artifact-cache.sh", "ops/cnb-release-artifact-cache.test.mjs",
  "ops/deploy-cnb-release-target.sh", "ops/deploy-unit-contract.test.mjs",
  "ops/deploy-unit-provenance.mjs", "ops/deploy-unit-provenance.test.mjs",
  "ops/deploy-unit-release.mjs", "ops/deploy-unit-release.test.mjs",
  "ops/deploy-unit-sidecar.sh", "ops/deploy-unit.sh", "ops/install-cnb-release-dependencies.sh",
  "ops/release-deploy-metadata.mjs", "ops/release-deploy-metadata.test.mjs",
] as const;

export const OPERATIONS_DEPLOYMENT_CUTOVER_FILES = [
  "ops/apply-deploy-unit.integration.test.mjs", "ops/apply-deploy-unit.sh",
  "ops/control-plane-receipt.integration.test.mjs", "ops/control-plane-receipt.mjs",
  "ops/control-plane-receipt.test.mjs", "ops/control-plane-requirements.mjs",
  "ops/control-plane-requirements.test.mjs", "ops/deploy-contract.test.mjs",
  "ops/deploy-control-plane.sh", "ops/deploy-cutover-contract.test.mjs", "ops/deploy-fleet-drill.test.mjs",
  "ops/deploy-fleet-observation.mjs", "ops/deploy-fleet-observation.test.mjs",
  "ops/deploy-fleet-status.mjs", "ops/deploy-fleet-status.test.mjs", "ops/deploy-notification.mjs",
  "ops/deploy-notification.test.mjs", "ops/deploy-profile-client-contract.test.mjs",
  "ops/deploy-profile-contract.test.mjs", "ops/deploy-profile-release.mjs",
  "ops/deploy-profile-release.test.mjs", "ops/deploy-profile.sh", "ops/deploy.sh",
  "ops/deployment-profile-promotion.mjs", "ops/deployment-profile-promotion.test.mjs",
  "ops/deployment-profile-rollout.mjs", "ops/deployment-profile-rollout.test.mjs",
  "ops/gateway-generation.mjs", "ops/gateway-generation.test.mjs", "ops/prepare-deploy-profile.sh",
  "ops/promote-deploy-profile.sh", "ops/promote-release-branch.sh", "ops/rollback-deploy-profile.sh",
  "ops/switch-deploy-gateway.integration.test.mjs", "ops/switch-deploy-gateway.sh",
  "ops/verify-deploy-order.mjs", "ops/verify-deploy-order.test.mjs",
] as const;

export const OPERATIONS_RUNTIME_DEPENDENCY_FILES = [
  "ops/assistant-runtime.mjs", "ops/assistant-runtime.test.mjs", "ops/init-workspace-config.mjs",
  "ops/init-workspace-config.test.mjs", "ops/install-kimi-agent-runtime.sh",
  "ops/install-library-embedding-model.sh", "ops/install-library-embedding-model.test.mjs",
  "ops/install-library-runtime-deps.sh", "ops/install-onlyoffice-runtime.sh",
  "ops/internal-rpc-deployment-guard.mjs", "ops/internal-rpc-deployment-guard.test.mjs",
  "ops/internal-unit-identity.mjs", "ops/internal-unit-identity.test.mjs",
  "ops/kimi-agent-sandbox-runner-darwin.sh", "ops/kimi-agent-sandbox-runner.sh",
  "ops/library-create-zip.py", "ops/library-embed-text.py", "ops/library-preview-document.py",
  "ops/library-process-document.py", "ops/library-runtime-smoke.py", "ops/local-runtime-contract.test.mjs",
  "ops/provision-workspace.mjs", "ops/provision-workspace.test.mjs",
  "ops/reconcile-runtime-config-permissions.sh", "ops/sync-tenant-config.sh",
  "ops/tenant-config-manifest.mjs", "ops/tenant-config-manifest.test.mjs",
] as const;

export const OPERATIONS_FOUNDATION_FILES = [
  "scripts/check/check-permission-action-grants.mjs",
  "scripts/check/check-prisma-deploy-status.js",
  "scripts/ci/check-migration-policy.mjs",
  "scripts/ci/verify-artifact-manifest.mjs",
  "scripts/provision-agent-workforce.mjs",
  "scripts/seed-resources-runtime.mjs",
  "scripts/write-resource-manifest.ts",
] as const;

export const OPERATIONS_DATA_RELEASE_FILES = [
  "ops/apply-data-release.mjs", "ops/apply-data-release.test.mjs", "ops/data-release-handlers.mjs",
  "ops/data-release-transfer.mjs", "ops/data-release.mjs", "ops/data-release.test.mjs",
  "ops/database-replacement.mjs", "ops/database-replacement.test.mjs",
  "ops/prepare-database-replacement.sh", "ops/prisma-genesis-cutover.mjs",
  "ops/prisma-genesis-cutover.test.mjs", "ops/publish-database-replacement.sh",
  "ops/replace-production-database.sh", "ops/upload-data-release.sh",
] as const;
