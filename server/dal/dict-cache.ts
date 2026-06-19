import "server-only";
import { unstable_cache, revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";

export const getDepartments = unstable_cache(
  async () => prisma.department.findMany({ orderBy: { code: "asc" } }),
  ["departments"],
  { revalidate: 3600, tags: ["departments"] }
);

export const getPositions = unstable_cache(
  async () => prisma.position.findMany({ orderBy: { code: "asc" } }),
  ["positions"],
  { revalidate: 3600, tags: ["positions"] }
);

export const getCompanies = unstable_cache(
  async () => prisma.company.findMany({ orderBy: { code: "asc" } }),
  ["companies"],
  { revalidate: 3600, tags: ["companies"] }
);

export const getFinanceAccounts = unstable_cache(
  async () => prisma.financeAccount.findMany({ orderBy: { code: "asc" } }),
  ["finance-accounts"],
  { revalidate: 3600, tags: ["finance-accounts"] }
);

export function invalidateDict(tag: string) {
  // Next.js 16 revalidateTag requires a profile argument in this typing;
   
  (revalidateTag as unknown as (tag: string) => void)(tag);
}
