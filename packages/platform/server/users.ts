import { listUsersWithEffectiveResourceRoles } from "./auth";
import { prisma } from "./prisma";

export type CreateAdminUserInput = {
  name: string;
  username?: string | null;
};

export async function listAdminUsers() {
  return listUsersWithEffectiveResourceRoles();
}

export async function createAdminUser(input: CreateAdminUserInput) {
  return prisma.user.create({
    data: {
      name: input.name,
      username: input.username || null,
      canLogin: true,
    },
  });
}
