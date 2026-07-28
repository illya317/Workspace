import { expect, test } from "@playwright/test";

const deployUnitId = process.env.E2E_DEPLOY_UNIT_ID?.trim();
const deploymentId = process.env.E2E_DEPLOYMENT_ID?.trim();

if (deployUnitId) {
  test("独立部署单元健康与版本身份一致", {
    tag: ["@deploy-unit-runtime"],
  }, async ({ request }) => {
    expect(deploymentId, "E2E_DEPLOYMENT_ID").toBeTruthy();

    for (const path of ["/workspace/api/internal/health", "/workspace/api/settings/version"]) {
      const response = await request.get(path);
      expect(response.ok(), path).toBeTruthy();
      const payload = await response.json();
      expect(payload.unitId, `${path} unitId`).toBe(deployUnitId);
      expect(payload.version, `${path} version`).toBe(deploymentId);
    }
  });
}
