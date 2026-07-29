import assert from "node:assert/strict";
import test from "node:test";

import { prisma } from "@workspace/platform/server/prisma";

import { searchFinanceAssetCategoryOptions } from "./fk-registry";

test("资产分类候选不因公司年度政策尚未保存而消失", async () => {
  let receivedWhere: unknown;
  const client = {
    financeAssetCategory: {
      findMany: async (args: { where: unknown }) => {
        receivedWhere = args.where;
        return [{ id: 7, code: "IA-SOFTWARE", name: "软件", isActive: true }];
      },
    },
  } as unknown as Pick<typeof prisma, "financeAssetCategory">;

  const options = await searchFinanceAssetCategoryOptions({
    keyword: "",
    lifecycleScope: "active",
    params: { assetKind: "intangible", companyCode: "02", year: "2026" },
  }, client);

  assert.deepEqual(receivedWhere, {
    assetKind: "intangible",
    reviewStatus: "confirmed",
    isActive: true,
  });
  assert.deepEqual(options, [{
    id: 7,
    name: "软件",
    subtitle: "IA-SOFTWARE",
    lifecycleStatus: "active",
  }]);
});
