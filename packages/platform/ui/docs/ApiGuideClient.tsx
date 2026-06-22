"use client";

import { workspacePath } from "@workspace/core/routing";
import {
  CodeBlock,
  DataTable,
  DatabasePageFrame,
  SectionCard,
  getToolbarActionClassName,
  type DataTableColumn,
} from "@workspace/core/ui";
import type { SessionUser } from "@workspace/platform/types";

type EndpointRow = {
  method: string;
  path: string;
  scope: string;
  note: string;
  params: string;
};

const OPEN_ENDPOINTS: EndpointRow[] = [
  {
    method: "GET",
    path: "/api/open/v1/hr/generated/roster",
    scope: "hr.generated.roster.read",
    note: "读取 HR 生成资料花名册",
    params: "variant, keyword, status, filterField, filterValue, page, pageSize",
  },
];

const endpointColumns: DataTableColumn<EndpointRow>[] = [
  {
    key: "method",
    label: "方法",
    required: true,
    render: (endpoint) => (
      <span className="inline-block rounded bg-cyan-50 px-1.5 py-0.5 font-mono text-xs font-medium text-cyan-700">
        {endpoint.method}
      </span>
    ),
  },
  {
    key: "path",
    label: "路径",
    required: true,
    render: (endpoint) => <span className="font-mono text-xs text-slate-700">{endpoint.path}</span>,
  },
  {
    key: "scope",
    label: "Scope",
    required: true,
    render: (endpoint) => <span className="font-mono text-xs text-slate-600">{endpoint.scope}</span>,
  },
  {
    key: "params",
    label: "参数",
    required: true,
    render: (endpoint) => <span className="text-xs text-slate-500">{endpoint.params}</span>,
  },
  {
    key: "note",
    label: "说明",
    required: true,
    render: (endpoint) => <span className="text-slate-700">{endpoint.note}</span>,
  },
];

export default function ApiGuidePage({
  initialUser,
}: {
  hideShell?: boolean;
  initialUser?: SessionUser;
}) {
  const canManageApi = (initialUser?.visibleResourceKeys || []).includes("settings.api");

  return (
    <DatabasePageFrame contentClassName="py-8">
      <SectionCard
        title="Open API 认证"
        actions={canManageApi && (
          <a className={getToolbarActionClassName()} href={workspacePath("/settings/api")}>
            管理 Client
          </a>
        )}
      >
        <CodeBlock className="space-y-1">
          <div>Authorization: Bearer {"<open-api-client-secret>"}</div>
          <div>Content-Type: application/json</div>
        </CodeBlock>
      </SectionCard>

      <SectionCard title="调用示例">
        <CodeBlock>
          <pre className="whitespace-pre-wrap text-xs">
{`curl -H "Authorization: Bearer <open-api-client-secret>" \\
  "/api/open/v1/hr/generated/roster?variant=management&page=1&pageSize=50"`}
          </pre>
        </CodeBlock>
      </SectionCard>

      <SectionCard title="Open API Endpoints" bodyClassName="p-0">
        <DataTable
          rows={OPEN_ENDPOINTS}
          columns={endpointColumns}
          visibleColumns={[]}
          density="compact"
          rowKey={(endpoint) => `${endpoint.method}:${endpoint.path}`}
        />
      </SectionCard>
    </DatabasePageFrame>
  );
}
