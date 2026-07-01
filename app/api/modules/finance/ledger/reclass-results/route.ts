import {
  buildBuildReclassResultsCommand,
  buildListReclassResultsCommand,
  executeBuildReclassResultsCommand,
  executeListReclassResultsCommand,
} from "@workspace/finance/server/route-commands";
import {
  buildReclassResultsSchema,
  listReclassResultsSchema,
} from "@workspace/finance/server/ledger/reclass-results/schemas";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { checkFinanceLedgerAccess, checkFinanceLedgerRevise } from "@workspace/platform/server/auth";

export const GET = createCommandRoute({
  access: checkFinanceLedgerAccess,
  querySchema: listReclassResultsSchema,
  queryError: "periodId 为必填参数",
  buildCommand: ({ query }) => buildListReclassResultsCommand(query),
  action: executeListReclassResultsCommand,
});

export const POST = createCommandRoute({
  access: checkFinanceLedgerRevise,
  bodySchema: buildReclassResultsSchema,
  bodyError: "periodId 为必填且为数字",
  buildCommand: ({ body }) => buildBuildReclassResultsCommand(body),
  action: executeBuildReclassResultsCommand,
});
