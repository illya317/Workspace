import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { prisma } from "./prisma";

const PERSONAL_API_KEY_PREFIX = "wsk_personal_";
const HASH_PATTERN = /^[a-f0-9]{64}$/i;

let hashMigrationPromise: Promise<void> | null = null;

export function generatePersonalApiKey() {
  return `${PERSONAL_API_KEY_PREFIX}${randomBytes(32).toString("base64url")}`;
}

export function hashPersonalApiKey(apiKey: string) {
  return createHash("sha256").update(apiKey, "utf8").digest("hex");
}

function isStoredHash(value: string) {
  return HASH_PATTERN.test(value);
}

export async function ensurePersonalApiKeysHashed() {
  if (!hashMigrationPromise) {
    hashMigrationPromise = (async () => {
      const users = await prisma.user.findMany({
        where: { apiKeyHash: { not: null } },
        select: { id: true, apiKeyHash: true },
      });
      for (const user of users) {
        const stored = user.apiKeyHash;
        if (!stored || isStoredHash(stored)) continue;
        await prisma.user.update({
          where: { id: user.id },
          data: { apiKeyHash: hashPersonalApiKey(stored) },
        });
      }
    })();
  }
  await hashMigrationPromise;
}

export async function findUserByPersonalApiKey(apiKey: string) {
  await ensurePersonalApiKeysHashed();
  return prisma.user.findUnique({
    where: { apiKeyHash: hashPersonalApiKey(apiKey) },
    select: {
      id: true,
      wxUserId: true,
      username: true,
      canLogin: true,
      sessionVersion: true,
    },
  });
}

export async function getUserApiKeyStatus(userId: number) {
  await ensurePersonalApiKeysHashed();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { apiKeyHash: true },
  });
  return { hasApiKey: Boolean(user?.apiKeyHash) };
}

export async function rotateUserApiKey(userId: number) {
  const apiKey = generatePersonalApiKey();
  await prisma.user.update({
    where: { id: userId },
    data: { apiKeyHash: hashPersonalApiKey(apiKey) },
  });
  return apiKey;
}
