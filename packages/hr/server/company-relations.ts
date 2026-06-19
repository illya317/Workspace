import { prisma } from "@workspace/platform/server/prisma";
import { handleCreate, handleDelete, handleUpdateField } from "./hr-crud";

const COMPANY_RELATION_CONFIG = {
  entityType: "CompanyRelation",
  modelKey: "companyRelation" as const,
  allowedFields: ["parentId", "childId", "shareRatio", "isConsolidated"],
};

export async function listCompanyRelations(input: { keyword: string; page: number; pageSize: number }) {
  const relations = await prisma.companyRelation.findMany({
    include: { parent: { select: { id: true, name: true } }, child: { select: { id: true, name: true } } },
    orderBy: { id: "asc" },
  });

  const mapped = relations.map((relation) => ({
    id: relation.id,
    parentId: relation.parentId,
    parentName: relation.parent?.name || "",
    childId: relation.childId,
    childName: relation.child?.name || "",
    shareRatio: relation.shareRatio,
    isConsolidated: relation.isConsolidated,
  }));

  let result = mapped;
  if (input.keyword) {
    const q = input.keyword.toLowerCase();
    result = mapped.filter(
      (relation) =>
        (relation.parentName || "").toLowerCase().includes(q) ||
        (relation.childName || "").toLowerCase().includes(q),
    );
  }

  const total = result.length;
  const start = (input.page - 1) * input.pageSize;
  return { relations: result.slice(start, start + input.pageSize), total };
}

export async function createCompanyRelation(request: Request) {
  return handleCreate(request, { entityType: "CompanyRelation", modelKey: "companyRelation" as const }, (body) => {
    for (const field of ["parentId", "childId"]) if (!body[field]) return null;
    return body;
  });
}

export async function updateCompanyRelationField(request: Request, params: Promise<{ id: string }>) {
  return handleUpdateField(request, params, COMPANY_RELATION_CONFIG);
}

export async function deleteCompanyRelation(request: Request, params: Promise<{ id: string }>) {
  return handleDelete(request, params, COMPANY_RELATION_CONFIG);
}
