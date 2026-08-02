import {
  allocateBusinessCode,
  previewBusinessCode,
  type BusinessCodeInput,
} from "@workspace/platform/server/business-codes";
import { Prisma, prisma } from "@workspace/platform/server/prisma";

export type FinanceAssetCodeScope = {
  companyCode: string;
  fiscalYear: number;
  assetCategoryCode: string;
};

function businessCodeInput(
  scope: FinanceAssetCodeScope,
  idempotencyKey?: string,
): BusinessCodeInput {
  return {
    objectKey: "finance.asset",
    companyCode: scope.companyCode,
    fiscalYear: scope.fiscalYear,
    attributes: {
      assetCategoryCode: scope.assetCategoryCode,
    },
    ...(idempotencyKey ? { idempotencyKey } : {}),
  };
}

/**
 * UI 只读预览；不会占号，最终编号可能因并发保存而变化。
 */
export function previewFinanceAssetCode(
  scope: FinanceAssetCodeScope,
  client: Pick<Prisma.TransactionClient, "$queryRaw"> = prisma,
) {
  return previewBusinessCode(client, businessCodeInput(scope));
}

/**
 * 必须在创建资产卡片或导入资产卡片的同一个 transaction 内调用。
 * fiscalYear 使用建卡/导入账期年度，不使用历史取得日期年份。
 */
export function allocateFinanceAssetCode(
  tx: Pick<Prisma.TransactionClient, "$queryRaw">,
  input: FinanceAssetCodeScope & { idempotencyKey: string },
) {
  return allocateBusinessCode(
    tx,
    businessCodeInput(input, input.idempotencyKey) as BusinessCodeInput & {
      idempotencyKey: string;
    },
  );
}
