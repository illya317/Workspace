import { prisma } from "./prisma";

const MAX_ATTEMPTS = 4;
const LOCKOUT_MINUTES = 60;

export async function checkBruteForce(
  username: string,
  ip: string,
): Promise<{ blocked: boolean; retryAfter?: number; remaining?: number }> {
  const since = new Date(Date.now() - LOCKOUT_MINUTES * 60 * 1000);

  const recent = await prisma.loginAttempt.count({
    where: {
      OR: [{ username }, { ip }],
      success: false,
      createdAt: { gte: since },
    },
  });

  if (recent >= MAX_ATTEMPTS) {
    const oldest = await prisma.loginAttempt.findFirst({
      where: { OR: [{ username }, { ip }], success: false },
      orderBy: { createdAt: "desc" },
      skip: MAX_ATTEMPTS - 1,
    });
    const retryAfter = oldest
      ? Math.ceil((oldest.createdAt.getTime() + LOCKOUT_MINUTES * 60 * 1000 - Date.now()) / 1000 / 60)
      : LOCKOUT_MINUTES;
    return { blocked: true, retryAfter };
  }

  return { blocked: false, remaining: MAX_ATTEMPTS - recent };
}

export async function recordAttempt(
  username: string,
  ip: string,
  success: boolean,
) {
  await prisma.loginAttempt.create({
    data: { username, ip, success },
  });

  const cutoff = new Date(Date.now() - LOCKOUT_MINUTES * 60 * 1000);
  await prisma.loginAttempt.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
}
