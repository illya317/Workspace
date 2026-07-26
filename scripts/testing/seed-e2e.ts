import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { loadTenantProfile } from "../lib/tenant-config";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "../../generated/prisma/client";
import { createToken } from "../../packages/platform/server/auth-token";
import { requireDisposableE2eDatabase } from "./e2e-database";

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: requireDisposableE2eDatabase().connectionString,
    application_name: "workspace-e2e-seed",
  }),
});

async function main() {
  const defaultManagementGroup = loadTenantProfile().organization.managementGroups.default;
  await Promise.all(["01", "02", "03"].map((code, index) => prisma.$transaction(async (tx) => {
    const identityNumber = `E2E-COMPANY-${code}`;
    const party = await tx.party.upsert({
      where: { subjectType_identityNumber: { subjectType: "organization", identityNumber } },
      update: { name: `E2E公司${code}` },
      create: { subjectType: "organization", identityNumber, name: `E2E公司${code}` },
    });
    await tx.company.upsert({
      where: { code },
      update: { partyId: party.id, isActive: true, sortOrder: index },
      create: { code, partyId: party.id, managementGroup: defaultManagementGroup, isActive: true, sortOrder: index },
    });
  })));

  const [admin, userAtId] = await Promise.all([
    prisma.user.findUnique({ where: { username: "admin" }, select: { id: true } }),
    prisma.user.findUnique({ where: { id: 2 }, select: { username: true } }),
  ]);
  if (admin && admin.id !== 2) throw new Error(`E2E admin already exists at unexpected id ${admin.id}`);
  if (userAtId && userAtId.username !== "admin") throw new Error(`E2E user id 2 is already owned by ${userAtId.username}`);

  const e2eAdmin = await prisma.user.upsert({
    where: { id: 2 },
    update: { username: "admin", canLogin: true },
    create: { id: 2, username: "admin", canLogin: true },
    select: { id: true, sessionVersion: true },
  });
  await prisma.$queryRaw`
    SELECT setval(
      pg_get_serial_sequence('"User"', 'id'),
      GREATEST(
        (SELECT MAX(id) FROM "User"),
        (SELECT last_value FROM "User_id_seq")
      ),
      true
    )
  `;
  const token = await createToken({
    userId: e2eAdmin.id,
    wxUserId: "",
    departmentId: 0,
    sessionVersion: e2eAdmin.sessionVersion,
  });
  const storageStatePath = path.resolve("test-results/e2e-admin-storage-state.json");
  fs.mkdirSync(path.dirname(storageStatePath), { recursive: true });
  fs.writeFileSync(storageStatePath, `${JSON.stringify({
    cookies: [{
      name: "token",
      value: token,
      domain: "127.0.0.1",
      path: "/",
      expires: -1,
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
    }],
    origins: [],
  }, null, 2)}\n`, { mode: 0o600 });
  process.stdout.write("E2E companies, admin identity, and signed browser session are ready.\n");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
