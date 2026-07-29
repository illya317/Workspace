import { Prisma, prisma } from "./prisma";

type SequenceClient = Pick<Prisma.TransactionClient, "$queryRaw">;

type SequenceRow = {
  value: number;
};

function positiveInteger(value: number, label: string) {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${label} 必须是正整数`);
  }
  return value;
}

function sequenceIdentity(input: {
  ruleKey: string;
  scopeKey: string;
  sequenceStart: number;
}) {
  const ruleKey = input.ruleKey.trim();
  const scopeKey = input.scopeKey.trim();
  if (!ruleKey) throw new Error("业务编码规则 key 不能为空");
  if (!scopeKey) throw new Error("业务编码流水 scope 不能为空");
  return {
    ruleKey,
    scopeKey,
    sequenceStart: positiveInteger(input.sequenceStart, "流水起始值"),
  };
}

export function businessCodeScopeKey(
  parts: Readonly<Record<string, string | number>>,
) {
  return Object.entries(parts)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`)
    .join("&");
}

/**
 * 在调用方业务事务内原子占用一个流水号。
 *
 * 本函数只维护流水，不负责写最终业务记录；调用方必须在同一个 transaction
 * 中完成唯一约束校验和业务记录写入。预览不得替代本函数。
 */
export async function allocateBusinessCodeSequence(
  tx: SequenceClient,
  input: { ruleKey: string; scopeKey: string; sequenceStart: number },
) {
  const identity = sequenceIdentity(input);
  const rows = await tx.$queryRaw<SequenceRow[]>(Prisma.sql`
    INSERT INTO "BusinessCodeSequence" ("ruleKey", "scopeKey", "nextValue", "updatedAt")
    VALUES (
      ${identity.ruleKey},
      ${identity.scopeKey},
      ${identity.sequenceStart + 1},
      CURRENT_TIMESTAMP
    )
    ON CONFLICT ("ruleKey", "scopeKey")
    DO UPDATE SET
      "nextValue" = GREATEST(
        "BusinessCodeSequence"."nextValue",
        ${identity.sequenceStart}
      ) + 1,
      "updatedAt" = CURRENT_TIMESTAMP
    RETURNING "nextValue" - 1 AS "value"
  `);
  const value = Number(rows[0]?.value);
  return positiveInteger(value, "已分配流水号");
}

/**
 * 仅用于 UI 展示下一编号的预览。并发保存时最终流水可能不同。
 */
export async function previewBusinessCodeSequence(
  input: { ruleKey: string; scopeKey: string; sequenceStart: number },
  client: SequenceClient = prisma,
) {
  const identity = sequenceIdentity(input);
  const rows = await client.$queryRaw<SequenceRow[]>(Prisma.sql`
    SELECT "nextValue" AS "value"
    FROM "BusinessCodeSequence"
    WHERE "ruleKey" = ${identity.ruleKey}
      AND "scopeKey" = ${identity.scopeKey}
    LIMIT 1
  `);
  const value = Number(rows[0]?.value ?? identity.sequenceStart);
  return positiveInteger(value, "预览流水号");
}
