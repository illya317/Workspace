import type { MutationImpactAdapter } from "@workspace/platform/server/mutation-impact";
import type { Prisma } from "@workspace/platform/server/prisma";

const CONTRACT_HANDLER_EMPLOYEE_RELATION_KEY = "administration.contracts.handler.employee";

type AdministrationMutationImpactContext = {
  tx: Prisma.TransactionClient;
};

export function administrationMutationImpactAdapters(): MutationImpactAdapter<AdministrationMutationImpactContext>[] {
  return [{
    relationKey: CONTRACT_HANDLER_EMPLOYEE_RELATION_KEY,
    sourceEntity: "Employee",
    intents: ["delete"],
    async inspect({ context, current }) {
      const contracts = await context.tx.contract.findMany({
        where: { handlerEmployeeId: Number(current.id) },
        select: { id: true, name: true, version: true },
        orderBy: { id: "asc" },
      });
      return contracts.length > 0 ? {
        policy: "block",
        records: contracts.map((contract) => ({
          entity: "Contract",
          id: String(contract.id),
          label: contract.name,
          expectedVersion: contract.version,
        })),
        reason: "员工仍是合同经办人，请先调整合同经办人关联",
      } : null;
    },
  }];
}
