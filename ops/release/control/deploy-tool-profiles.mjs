export const DEPLOY_TOOL_PROFILE_CATALOG_VERSION = 1;

const PROFILES = Object.freeze({
  full: Object.freeze([
    "ops/release/control/deploy-tool-bundle.mjs",
    "ops/release-receipt.mjs",
    "ops/control-plane-receipt.mjs",
    "ops/tenant-config-manifest.mjs",
    "ops/control-plane-requirements.mjs",
    "ops/deploy-unit-release.mjs",
    "ops/gateway-generation.mjs",
    "ops/switch-deploy-gateway.sh",
    "ops/deploy-unit-sidecar.sh",
    "ops/assistant-runtime.mjs",
    "ops/reconcile-runtime-config-permissions.sh",
    "ops/postgresql/production-finance-bot-hook.sh",
    "ops/postgresql/production-finance-bot-deploy-renderer.py",
    "ops/postgresql/production-finance-bot.conf",
  ]),
  "deploy-unit-tools": Object.freeze([
    "ops/release/control/deploy-tool-bundle.mjs",
    "ops/apply-deploy-unit.sh",
    "ops/postgresql/production-runtime-pm2.sh",
    "ops/postgresql/production-finance-bot-hook.sh",
    "ops/postgresql/production-finance-bot-deploy-renderer.py",
    "ops/postgresql/production-finance-bot.conf",
    "ops/release/deploy/unit-lock-qualification.sh",
    "ops/release/deploy/unit-runtime-pm2.sh",
    "ops/deploy-unit-sidecar.sh",
    "ops/internal-unit-identity.mjs",
    "ops/internal-rpc-deployment-guard.mjs",
    "ops/switch-deploy-gateway.sh",
    "ops/gateway-generation.mjs",
    "ops/deploy-unit-release.mjs",
    "ops/deploy-unit-provenance.mjs",
    "ops/deploy-notification.mjs",
    "ops/release-deploy-metadata.mjs",
    "ops/deploy-profile-release.mjs",
    "ops/deployment-profile-promotion.mjs",
    "ops/deploy-fleet-observation.mjs",
    "ops/deploy-fleet-status.mjs",
    "ops/promote-deploy-profile.sh",
    "ops/rollback-deploy-profile.sh",
    "ops/assistant-runtime.mjs",
    "ops/control-plane-receipt.mjs",
    "ops/control-plane-requirements.mjs",
    "ops/tenant-config-manifest.mjs",
  ]),
});

export function deployToolProfileEntries(name) {
  const entries = PROFILES[name];
  if (!entries) throw new Error("unknown deploy tool profile: " + String(name ?? ""));
  return [...entries];
}

export function deployToolProfileNames() {
  return Object.keys(PROFILES).sort();
}
