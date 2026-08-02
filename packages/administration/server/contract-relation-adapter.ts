import type { MutationImpactAdapter } from "@workspace/platform/server/mutation-impact";
import type { Prisma } from "@workspace/platform/server/prisma";

type AdministrationMutationImpactContext = {
  tx: Prisma.TransactionClient;
};

function records(contracts: Array<{ id: number; name: string; version: number }>) {
  return contracts.map((contract) => ({
    entity: "Contract",
    id: String(contract.id),
    label: contract.name,
    expectedVersion: contract.version,
  }));
}

export function administrationMutationImpactAdapters(): MutationImpactAdapter<AdministrationMutationImpactContext>[] {
  return [
    {
      relationKey: "administration.contracts.owning.company",
      sourceEntity: "Company",
      intents: ["delete", "archive"],
      async inspect({ context, current }) {
        const contracts = await context.tx.contract.findMany({
          where: { owningCompanyId: Number(current.id) },
          select: { id: true, name: true, version: true },
          orderBy: { id: "asc" },
        });
        return contracts.length ? { policy: "block", records: records(contracts), reason: "公司仍是合同归属公司，请先调整合同归属" } : null;
      },
    },
    {
      relationKey: "administration.contracts.owner.department",
      sourceEntity: "Department",
      intents: ["delete", "archive"],
      async inspect({ context, current }) {
        const contracts = await context.tx.contract.findMany({
          where: { ownerDepartmentId: Number(current.id) },
          select: { id: true, name: true, version: true },
          orderBy: { id: "asc" },
        });
        return contracts.length ? { policy: "block", records: records(contracts), reason: "部门仍是合同归口部门，请先调整合同归属" } : null;
      },
    },
    ...(["partyAId", "partyBId"] as const).map((field, index): MutationImpactAdapter<AdministrationMutationImpactContext> => ({
      relationKey: index === 0 ? "administration.contracts.party.a" : "administration.contracts.party.b",
      sourceEntity: "Party",
      intents: ["delete"],
      async inspect({ context, current }) {
        const contracts = await context.tx.contract.findMany({
          where: { [field]: Number(current.id) },
          select: { id: true, name: true, version: true },
          orderBy: { id: "asc" },
        });
        return contracts.length ? { policy: "block", records: records(contracts), reason: "法定主体仍被合同引用，请先调整签约主体" } : null;
      },
    })),
    {
      relationKey: "administration.contracts.handler.employee",
      sourceEntity: "Employee",
      intents: ["delete"],
      async inspect({ context, current }) {
        const contracts = await context.tx.contract.findMany({
          where: { handlerEmployeeId: Number(current.id) },
          select: { id: true, name: true, version: true },
          orderBy: { id: "asc" },
        });
        return contracts.length ? { policy: "block", records: records(contracts), reason: "员工仍是合同经办人，请先调整合同经办人关联" } : null;
      },
    },
  ];
}
