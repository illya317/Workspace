import {
  formatFinanceAssetCode,
  parseFinanceAssetCodeRule,
  type BusinessCodeConfig,
} from "@workspace/platform/business-code-config";
import {
  businessCodeSequenceSettings,
} from "@workspace/platform/business-code-rule";
import {
  allocateBusinessCodeSequence,
  businessCodeScopeKey,
  previewBusinessCodeSequence,
} from "../business-code-sequence";
import { Prisma, prisma } from "../prisma";

export type BusinessCodeInput = {
  objectKey: "finance.asset";
  companyCode: string;
  fiscalYear: number;
  attributes: {
    assetCategoryCode: string;
  };
  idempotencyKey?: string;
};

type BusinessCodeClient = Pick<Prisma.TransactionClient, "$queryRaw">;

type RuleRow = {
  id: number;
  objectKey: string;
  configJson: unknown;
  version: number;
  isActive: boolean;
};

type AllocationRow = {
  code: string;
  sequence: number;
  ruleId: number;
  ruleVersion: number;
  scopeKey: string;
  inputFingerprint: string;
};

type FinanceAssetRule = BusinessCodeConfig["financeAsset"];

function normalizedInput(input: BusinessCodeInput) {
  if (input.objectKey !== "finance.asset") throw new Error("不支持的业务编码对象");
  const companyCode = input.companyCode.trim();
  const assetCategoryCode = input.attributes.assetCategoryCode.trim();
  if (!companyCode) throw new Error("资产编码缺少公司编码");
  if (!assetCategoryCode) throw new Error("资产编码缺少资产分类编码");
  if (!Number.isInteger(input.fiscalYear) || input.fiscalYear < 1900 || input.fiscalYear > 9999) {
    throw new Error("资产编码账期年度无效");
  }
  return {
    objectKey: input.objectKey,
    companyCode,
    fiscalYear: input.fiscalYear,
    attributes: { assetCategoryCode },
  } as const;
}

function inputFingerprint(input: ReturnType<typeof normalizedInput>) {
  return JSON.stringify(input);
}

function financeAssetRule(value: unknown): FinanceAssetRule {
  return parseFinanceAssetCodeRule(value);
}

function financeAssetScopeKey(
  input: ReturnType<typeof normalizedInput>,
) {
  return businessCodeScopeKey({
    objectKey: input.objectKey,
    companyCode: input.companyCode,
    assetCategoryCode: input.attributes.assetCategoryCode,
    fiscalYear: input.fiscalYear,
  });
}

async function activeRule(client: BusinessCodeClient, objectKey: BusinessCodeInput["objectKey"]) {
  const rows = await client.$queryRaw<RuleRow[]>(Prisma.sql`
    SELECT "id", "objectKey", "configJson", "version", "isActive"
    FROM "BusinessCodeRule"
    WHERE "objectKey" = ${objectKey}
    LIMIT 1
  `);
  const rule = rows[0];
  if (!rule || !rule.isActive) throw new Error(`未配置生效的业务编码规则：${objectKey}`);
  if (!Number.isInteger(rule.id) || !Number.isInteger(rule.version) || rule.version < 1) {
    throw new Error(`业务编码规则版本无效：${objectKey}`);
  }
  return rule;
}

async function existingAllocation(
  client: BusinessCodeClient,
  objectKey: string,
  idempotencyKey: string,
) {
  const rows = await client.$queryRaw<AllocationRow[]>(Prisma.sql`
    SELECT
      "code",
      "sequence",
      "ruleId",
      "ruleVersion",
      "scopeKey",
      "inputFingerprint"
    FROM "BusinessCodeAllocation"
    WHERE "objectKey" = ${objectKey}
      AND "idempotencyKey" = ${idempotencyKey}
    LIMIT 1
  `);
  return rows[0] ?? null;
}

function allocationResult(row: AllocationRow) {
  return {
    code: row.code,
    sequence: Number(row.sequence),
    ruleId: Number(row.ruleId),
    ruleVersion: Number(row.ruleVersion),
  };
}

export async function previewBusinessCode(
  client: BusinessCodeClient = prisma,
  input: BusinessCodeInput,
) {
  const normalized = normalizedInput(input);
  const rule = await activeRule(client, normalized.objectKey);
  const config = financeAssetRule(rule.configJson);
  const sequenceSettings = businessCodeSequenceSettings(config);
  const scopeKey = financeAssetScopeKey(normalized);
  const sequence = await previewBusinessCodeSequence({
    ruleKey: normalized.objectKey,
    scopeKey,
    sequenceStart: sequenceSettings.start,
  }, client);
  if (sequence > sequenceSettings.maximum) throw new Error("资产编码 5 位流水已用尽");
  return {
    code: formatFinanceAssetCode({
      companyCode: normalized.companyCode,
      categoryCode: normalized.attributes.assetCategoryCode,
      year: normalized.fiscalYear,
      sequence,
      rule: config,
    }),
    provisional: true as const,
    ruleId: Number(rule.id),
    ruleVersion: Number(rule.version),
  };
}

export async function allocateBusinessCode(
  tx: BusinessCodeClient,
  input: BusinessCodeInput & { idempotencyKey: string },
) {
  const normalized = normalizedInput(input);
  const idempotencyKey = input.idempotencyKey.trim();
  if (!idempotencyKey) throw new Error("业务编码分配缺少 idempotencyKey");
  if (idempotencyKey.length > 240) throw new Error("业务编码 idempotencyKey 过长");
  const fingerprint = inputFingerprint(normalized);
  const replay = await existingAllocation(tx, normalized.objectKey, idempotencyKey);
  if (replay) {
    if (replay.inputFingerprint !== fingerprint) {
      throw new Error("业务编码 idempotencyKey 已用于其他输入");
    }
    return allocationResult(replay);
  }

  const rule = await activeRule(tx, normalized.objectKey);
  const config = financeAssetRule(rule.configJson);
  const sequenceSettings = businessCodeSequenceSettings(config);
  const scopeKey = financeAssetScopeKey(normalized);
  const sequence = await allocateBusinessCodeSequence(tx, {
    ruleKey: normalized.objectKey,
    scopeKey,
    sequenceStart: sequenceSettings.start,
  });
  if (sequence > sequenceSettings.maximum) throw new Error("资产编码 5 位流水已用尽");
  const code = formatFinanceAssetCode({
    companyCode: normalized.companyCode,
    categoryCode: normalized.attributes.assetCategoryCode,
    year: normalized.fiscalYear,
    sequence,
    rule: config,
  });
  const inserted = await tx.$queryRaw<AllocationRow[]>(Prisma.sql`
    INSERT INTO "BusinessCodeAllocation" (
      "objectKey",
      "idempotencyKey",
      "inputFingerprint",
      "ruleId",
      "ruleVersion",
      "scopeKey",
      "sequence",
      "code"
    )
    VALUES (
      ${normalized.objectKey},
      ${idempotencyKey},
      ${fingerprint},
      ${rule.id},
      ${rule.version},
      ${scopeKey},
      ${sequence},
      ${code}
    )
    ON CONFLICT ("objectKey", "idempotencyKey") DO NOTHING
    RETURNING
      "code",
      "sequence",
      "ruleId",
      "ruleVersion",
      "scopeKey",
      "inputFingerprint"
  `);
  const allocation = inserted[0] ?? await existingAllocation(tx, normalized.objectKey, idempotencyKey);
  if (!allocation) throw new Error("业务编码分配失败");
  if (allocation.inputFingerprint !== fingerprint) {
    throw new Error("业务编码 idempotencyKey 已用于其他输入");
  }
  return allocationResult(allocation);
}

export async function upsertBusinessCodeRule(
  tx: BusinessCodeClient,
  input: {
    objectKey: BusinessCodeInput["objectKey"];
    config: FinanceAssetRule;
  },
) {
  const config = financeAssetRule(input.config);
  const configJson = JSON.stringify(config);
  const rows = await tx.$queryRaw<RuleRow[]>(Prisma.sql`
    INSERT INTO "BusinessCodeRule" (
      "objectKey",
      "configJson",
      "version",
      "isActive",
      "updatedAt"
    )
    VALUES (
      ${input.objectKey},
      CAST(${configJson} AS jsonb),
      1,
      true,
      CURRENT_TIMESTAMP
    )
    ON CONFLICT ("objectKey")
    DO UPDATE SET
      "configJson" = EXCLUDED."configJson",
      "version" = CASE
        WHEN "BusinessCodeRule"."configJson" = EXCLUDED."configJson"
          AND "BusinessCodeRule"."isActive" = true
        THEN "BusinessCodeRule"."version"
        ELSE "BusinessCodeRule"."version" + 1
      END,
      "isActive" = true,
      "updatedAt" = CASE
        WHEN "BusinessCodeRule"."configJson" = EXCLUDED."configJson"
          AND "BusinessCodeRule"."isActive" = true
        THEN "BusinessCodeRule"."updatedAt"
        ELSE CURRENT_TIMESTAMP
      END
    RETURNING "id", "objectKey", "configJson", "version", "isActive"
  `);
  const rule = rows[0];
  if (!rule) throw new Error("业务编码规则保存失败");
  return { ruleId: Number(rule.id), ruleVersion: Number(rule.version) };
}
