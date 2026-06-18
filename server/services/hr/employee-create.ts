import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { snapshotHistory } from "@/lib/history";

const EMPLOYEE_ID_PATTERN = /^\d{5}$/;
const USERNAME_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";

function randomUsername() {
  const bytes = randomBytes(8);
  return Array.from(bytes, (byte) => USERNAME_CHARS[byte % USERNAME_CHARS.length]).join("");
}

async function nextEmployeeId() {
  const employees = await prisma.employee.findMany({ select: { employeeId: true } });
  const usedIds = new Set(
    employees.filter((employee) => EMPLOYEE_ID_PATTERN.test(employee.employeeId)).map((employee) => employee.employeeId),
  );

  for (let next = 1; next <= 99999; next += 1) {
    const employeeId = String(next).padStart(5, "0");
    if (!usedIds.has(employeeId)) return employeeId;
  }

  throw new Error("员工编号已用尽");
}

async function uniqueUsername() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const username = randomUsername();
    const exists = await prisma.user.findUnique({ where: { username }, select: { id: true } });
    if (!exists) return username;
  }
  throw new Error("账号生成失败，请重试");
}

export async function createEmployeeWithAccount(name: string, editorUserId: number) {
  const cleanName = name.trim();
  if (!cleanName) {
    return { ok: false as const, error: "姓名必填", status: 400 };
  }

  const employeeId = await nextEmployeeId();
  const username = await uniqueUsername();

  try {
    const result = await prisma.$transaction(async (tx) => {
      const linkedUser = await tx.user.create({
        data: {
          name: cleanName,
          username,
          employeeId,
          canLogin: true,
        },
        select: { id: true, name: true, username: true, employeeId: true },
      });
      const employee = await tx.employee.create({
        data: {
          employeeId,
          name: cleanName,
          userId: linkedUser.id,
        },
      });
      return { employee, user: linkedUser };
    });

    await snapshotHistory("Employee", result.employee.id, editorUserId);
    return { ok: true as const, ...result };
  } catch (error) {
    if (error instanceof Error && error.message.includes("Unique constraint failed")) {
      return { ok: false as const, error: "员工编号或账号生成冲突，请重试", status: 409 };
    }
    throw error;
  }
}
