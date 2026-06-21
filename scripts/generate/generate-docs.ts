import * as fs from "fs";
import * as path from "path";

// ═══════════════════════════════════════════════════════════
//  PART 1 — Prisma Schema → tables.html + tables.md
// ═══════════════════════════════════════════════════════════

interface Field {
  name: string;
  type: string;
  required: boolean;
  comment: string;
  isRelation: boolean;
}

interface Relation {
  name: string;
  targetModel: string;
  fields: string[];
  references: string[];
  optional: boolean;
}

interface Model {
  name: string;
  comment: string;
  fields: Field[];
  relations: Relation[];
  pkFields: string[];    // @id (auto-increment) + @@id compound
  ukFields: string[];    // @unique single-field only
  compUkFields: string[]; // @@unique compound
  inboundFrom: string[];
}

function parseSchema(schemaPath: string): { models: Model[]; groups: string[] } {
  const content = fs.readFileSync(schemaPath, "utf-8");
  const lines = content.split("\n");

  const models: Model[] = [];
  const groups: string[] = [];
  let currentGroup = "";
  let currentModel: Model | null = null;

  for (const line of lines) {
    const groupMatch = line.match(/\/\/\s*───\s*(.+?)\s*───/);
    if (groupMatch) {
      if (currentGroup) groups.push(currentGroup);
      currentGroup = groupMatch[1].trim();
      continue;
    }

    const modelMatch = line.match(/^model\s+(\w+)\s*\{/);
    if (modelMatch) {
      currentModel = {
        name: modelMatch[1],
        comment: currentGroup,
        fields: [],
        relations: [],
        pkFields: [],
        ukFields: [],
        compUkFields: [],
        inboundFrom: [],
      };
      continue;
    }

    if (line.trim() === "}" && currentModel) {
      models.push(currentModel);
      currentModel = null;
      continue;
    }

    if (currentModel) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("//")) continue;

      // Parse @@id (composite PK) vs @@unique (composite UK)
      const idMatch = trimmed.match(/^@@id\s*\(\s*\[([^\]]+)\]\s*\)/);
      if (idMatch) {
        const keys = idMatch[1].split(",").map((s) => s.trim());
        currentModel.pkFields.push(...keys);
        continue;
      }
      const compUniqueMatch = trimmed.match(/^@@unique\s*\(\s*\[([^\]]+)\]\s*\)/);
      if (compUniqueMatch) {
        const keys = compUniqueMatch[1].split(",").map((s) => s.trim());
        currentModel.compUkFields.push(...keys);
        continue;
      }
      if (trimmed.startsWith("@@")) continue;

      const fieldMatch = trimmed.match(/^(\w+)\s+(\w+)(\?)?(\[\])?\s*(.*)$/);
      if (fieldMatch) {
        const [, name, type, optional, isArray, rest] = fieldMatch;
        const isRelation = rest.includes("@relation");
        const commentMatch = rest.match(/\/\/\s*(.+)/);
        const comment = commentMatch ? commentMatch[1] : "";

        // Detect @unique on individual fields
        if (rest.includes("@unique")) {
          currentModel.ukFields.push(name);
        }

        currentModel.fields.push({
          name,
          type: type + (isArray ? "[]" : ""),
          required: !optional,
          comment,
          isRelation,
        });

        const relRegex = /fields:\s*\[([^\]]+)\],\s*references:\s*\[([^\]]+)\]/;
        const relMatch = rest.match(relRegex);
        if (relMatch) {
          currentModel.relations.push({
            name,
            targetModel: type.replace("?", "").replace("[]", ""),
            fields: relMatch[1].split(",").map((s) => s.trim()),
            references: relMatch[2].split(",").map((s) => s.trim()),
            optional: !!optional,
          });
        }
      }
    }
  }

  if (currentGroup) groups.push(currentGroup);

  for (const model of models) {
    for (const other of models) {
      if (other === model) continue;
      for (const rel of other.relations) {
        if (rel.targetModel === model.name) {
          model.inboundFrom.push(other.name);
        }
      }
    }
  }

  return { models, groups };
}

function typeBadge(type: string): string {
  if (type === "String" || type === "String?") return "str";
  if (type === "Int" || type === "Int?") return "int";
  if (type === "Boolean" || type === "Boolean?") return "bool";
  if (type === "DateTime" || type === "DateTime?") return "time";
  if (type.includes("[]")) return "FK[]";
  return type.toLowerCase();
}

function typeColor(type: string): string {
  if (type.startsWith("String")) return "#059669";
  if (type.startsWith("Int")) return "#2563eb";
  if (type.startsWith("Boolean")) return "#7c3aed";
  if (type.startsWith("DateTime")) return "#d97706";
  if (type.includes("[]")) return "#dc2626";
  return "#6b7280";
}

const GROUP_EN: Record<string, string> = {
  "用户与认证": "1. System",
  "RBAC 权限": "2. RBAC",
  "报告模块": "3. Reports",
  "工作清单模块（独立）": "4. Tasks",
  "花名册与组织架构": "5. Roster & Org",
  "编辑历史": "6. Edit History",
};

function generateTablesHTML(models: Model[]): string {
  const modelMap = new Map(models.map((m) => [m.name, m]));
  const uniqueGroups = [...new Set(models.map((m) => m.comment))];

  const modelNumbers = new Map<string, string>();
  let globalIdx = 0;
  for (const g of uniqueGroups) {
    globalIdx++;
    let seq = 0;
    for (const m of models) {
      if (m.comment === g) {
        seq++;
        modelNumbers.set(m.name, `${globalIdx}-${seq}`);
      }
    }
  }

  const rows: string[] = [];
  rows.push(`<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>HR Database Schema</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f8fafc; color: #1e293b; display: flex; min-height: 100vh; }
  nav { width: 260px; background: #fff; border-right: 1px solid #e2e8f0; padding: 24px 16px; position: sticky; top: 0; height: 100vh; overflow-y: auto; flex-shrink: 0; }
  nav h1 { font-size: 17px; font-weight: 700; margin-bottom: 20px; color: #0f172a; }
  nav .group { margin-bottom: 16px; }
  nav .group-title { font-size: 12px; font-weight: 600; text-transform: uppercase; color: #94a3b8; letter-spacing: 0.5px; margin-bottom: 4px; }
  nav a { display: block; padding: 5px 8px; font-size: 14px; color: #475569; text-decoration: none; border-radius: 4px; }
  nav a:hover { background: #f1f5f9; color: #0f172a; }
  main { flex: 1; padding: 40px 48px; max-width: 1024px; min-width: 0; }
  @media (max-width: 768px) { main { padding: 24px 16px; } }
  .section { margin-bottom: 48px; }
  .section-title { font-size: 22px; font-weight: 700; margin-bottom: 20px; padding-bottom: 8px; border-bottom: 2px solid #e2e8f0; color: #0f172a; }
  .table-block { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 24px; overflow-x: auto; }
  .table-header { padding: 16px 20px; border-bottom: 1px solid #f1f5f9; }
  .table-header h3 { font-size: 16px; font-weight: 600; display: flex; align-items: center; gap: 8px; }
  .table-num { display: inline-block; background: #0f172a; color: #fff; font-size: 12px; padding: 2px 8px; border-radius: 4px; font-weight: 500; }
  .field-table { width: 100%; border-collapse: collapse; }
  .field-table th { text-align: left; padding: 10px 20px; font-size: 12px; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; background: #fafbfc; border-bottom: 1px solid #f1f5f9; }
  .field-table td { padding: 10px 20px; font-size: 14px; border-bottom: 1px solid #f8fafc; }
  .field-table tr:last-child td { border-bottom: none; }
  .field-name { font-family: "SF Mono", "Menlo", monospace; font-size: 13px; color: #0f172a; }
  .field-type { display: inline-block; font-size: 11px; padding: 1px 6px; border-radius: 3px; font-weight: 600; }
  .field-comment { color: #64748b; font-size: 13px; }
  .field-required { color: #ef4444; font-size: 10px; font-weight: 700; margin-left: 2px; }
  .table-footer { padding: 12px 20px; background: #fafbfc; border-top: 1px solid #f1f5f9; display: flex; flex-direction: column; gap: 8px; font-size: 13px; }
  .dep-out, .dep-in { display: flex; align-items: flex-start; gap: 6px; flex-wrap: wrap; }
  .dep-label { color: #94a3b8; white-space: nowrap; }
  .dep-link { display: inline-block; background: #f1f5f9; padding: 1px 8px; border-radius: 3px; font-family: "SF Mono", "Menlo", monospace; font-size: 12px; color: #475569; text-decoration: none; }
  .dep-link:hover { background: #e2e8f0; }
  .dep-none { color: #cbd5e1; }
  .pk-border td:first-child { border-left: 3px solid #10b981; }
  .uk-bg td { background: #ecfeff; }
  .uk-border td:first-child { border-left: 3px solid #06b6d4; }
  .fk-underline .field-name { text-decoration: underline; text-decoration-color: #f59e0b; text-underline-offset: 3px; text-decoration-style: solid; }
  .ref-underline .field-name { text-decoration: underline; text-decoration-color: #f59e0b; text-underline-offset: 3px; text-decoration-style: dashed; }
  .legend { display: flex; gap: 16px; margin-top: 16px; font-size: 11px; color: #94a3b8; }
  .legend span { display: inline-flex; align-items: center; gap: 4px; }
  .legend-swatch { display: inline-block; width: 12px; height: 12px; border-radius: 2px; }
</style>
</head>
<body>
<nav>
<h1>HR Database Schema</h1>
<p style="font-size:12px;color:#94a3b8;margin-bottom:20px">${models.length} tables</p>
`);

  let navGroupIdx = 0;
  for (const g of uniqueGroups) {
    navGroupIdx++;
    const enTitle = GROUP_EN[g] || `${navGroupIdx}. ${g}`;
    rows.push(`<div class="group"><div class="group-title">${enTitle}</div>`);
    let seq = 0;
    for (const m of models) {
      if (m.comment === g) {
        seq++;
        const num = modelNumbers.get(m.name)!;
        rows.push(`<a href="#${m.name}">${num} ${m.name}</a>`);
      }
    }
    rows.push(`</div>`);
  }

  rows.push(`<div class="legend">
    <span><span style="color:#ef4444;font-weight:700">*</span> = Required</span>
    <span><span class="legend-swatch" style="background:#fef9e7;border:2px solid #f59e0b"></span> FK</span>
    <span><span class="legend-swatch" style="background:#ecfdf5;border:2px solid #10b981"></span> Referenced</span>
  </div>`);
  rows.push(`</nav><main>`);

  let contentGroupIdx = 0;
  for (const g of uniqueGroups) {
    contentGroupIdx++;
    const enTitle = GROUP_EN[g] || `${contentGroupIdx}. ${g}`;
    rows.push(`<div class="section"><div class="section-title">${enTitle}</div>`);

    let seq = 0;
    for (const m of models) {
      if (m.comment !== g) continue;
      seq++;
      const num = modelNumbers.get(m.name)!;

      rows.push(`<div class="table-block" id="${m.name}">`);
      rows.push(`<div class="table-header"><h3><span class="table-num">${num}</span> ${m.name}</h3></div>`);

      const fkOutFields = new Set(m.relations.flatMap((r) => r.fields));
      const fkInFields = new Set<string>();
      for (const other of models) {
        if (other === m) continue;
        for (const rel of other.relations) {
          if (rel.targetModel === m.name) {
            for (const ref of rel.references) fkInFields.add(ref);
          }
        }
      }
      const pkSet = new Set(m.pkFields);
      const ukSet = new Set(m.ukFields);
      const compUkSet = new Set(m.compUkFields);

      rows.push(`<table class="field-table"><thead><tr><th style="width:160px">Field</th><th style="width:60px">Type</th><th>Description</th></tr></thead><tbody>`);
      for (const f of m.fields) {
        if (f.type.endsWith("[]")) continue;
        if (f.isRelation && !m.relations.some((r) => r.fields.includes(f.name))) continue;
        const rel = m.relations.find((r) => r.fields.includes(f.name));
        const comment = f.comment || (rel ? `→ ${rel.targetModel}.${rel.references[0]}` : "");
        const isPK = pkSet.has(f.name) || (f.name === "id" && f.required);
        const isUK = ukSet.has(f.name) && !isPK;
        const isCompUK = compUkSet.has(f.name) && !isPK && !isUK;
        const isFK = fkOutFields.has(f.name) && !isPK && !isUK && !isCompUK;
        const isRef = fkInFields.has(f.name) && !isPK && !isUK && !isCompUK;
        const classes = [
          isPK ? "pk-border" : "",
          isUK ? "uk-bg" : "",
          isCompUK ? "uk-bg uk-border" : "",
          isFK ? "fk-underline" : "",
          isRef ? "ref-underline" : "",
        ].filter(Boolean).join(" ");
        const fkSuffix = (isFK || isRef) && rel ? ` <span style="font-size:11px;color:#d97706">→ <a href="#${rel.targetModel}" class="dep-link">${rel.targetModel}</a></span>` : "";
        rows.push(`<tr class="${classes}">
          <td><span class="field-name">${f.name}</span>${f.required ? ' <span class="field-required">*</span>' : ""}</td>
          <td><span class="field-type" style="background:${typeColor(f.type)}15;color:${typeColor(f.type)}">${typeBadge(f.type)}</span></td>
          <td class="field-comment">${comment}${fkSuffix}</td>
        </tr>`);
      }
      rows.push(`</tbody></table>`);

      const outDeps = m.relations.map((r) => r.targetModel).filter((t) => modelMap.has(t));
      const inDeps = m.inboundFrom.filter((t) => modelMap.has(t));
      rows.push(`<div class="table-footer">`);
      rows.push(`<div class="dep-out"><span class="dep-label">Depends on:</span>`);
      if (outDeps.length === 0) {
        rows.push(`<span class="dep-none">无</span>`);
      } else {
        for (const d of outDeps) {
          const dNum = modelNumbers.get(d) || "";
          rows.push(`<a href="#${d}" class="dep-link">${dNum} ${d}</a>`);
        }
      }
      rows.push(`</div>`);
      rows.push(`<div class="dep-in"><span class="dep-label">Referenced by:</span>`);
      if (inDeps.length === 0) {
        rows.push(`<span class="dep-none">无</span>`);
      } else {
        for (const d of inDeps) {
          const dNum = modelNumbers.get(d) || "";
          rows.push(`<a href="#${d}" class="dep-link">${dNum} ${d}</a>`);
        }
      }
      rows.push(`</div>`);
      rows.push(`</div>`);
      rows.push(`</div>`);
    }
    rows.push(`</div>`);
  }

  rows.push(`</main></body></html>`);
  return rows.join("\n");
}

function generateTablesMD(models: Model[]): string {
  const modelMap = new Map(models.map((m) => [m.name, m]));
  const uniqueGroups = [...new Set(models.map((m) => m.comment))];
  const lines: string[] = [];

  const modelNumbers = new Map<string, string>();
  let globalIdx = 0;
  for (const g of uniqueGroups) {
    globalIdx++;
    let seq = 0;
    for (const m of models) {
      if (m.comment === g) {
        seq++;
        modelNumbers.set(m.name, `${globalIdx}-${seq}`);
      }
    }
  }

  lines.push(`# HR Database Schema (${models.length} tables)\n`);

  for (const g of uniqueGroups) {
    const enTitle = GROUP_EN[g] || g;
    lines.push(`## ${enTitle}\n`);

    for (const m of models) {
      if (m.comment !== g) continue;
      const num = modelNumbers.get(m.name)!;

      const fkOutFields = new Set(m.relations.flatMap((r) => r.fields));
      const fkInFields = new Set<string>();
      for (const other of models) {
        if (other === m) continue;
        for (const rel of other.relations) {
          if (rel.targetModel === m.name) {
            for (const ref of rel.references) fkInFields.add(ref);
          }
        }
      }
      const pkSet = new Set(m.pkFields);
      const ukSet = new Set(m.ukFields);
      const compUkSet = new Set(m.compUkFields);

      lines.push(`### ${num} ${m.name}\n`);
      lines.push(`| Field | Type | Required | FK | Note |`);
      lines.push(`|-------|------|----------|----|------|`);

      for (const f of m.fields) {
        if (f.type.endsWith("[]")) continue;
        if (f.isRelation && !m.relations.some((r) => r.fields.includes(f.name))) continue;
        const isPK = pkSet.has(f.name) || (f.name === "id" && f.required);
        const isUK = ukSet.has(f.name) && !isPK;
        const isCompUK = compUkSet.has(f.name) && !isPK && !isUK;
        const isFK = fkOutFields.has(f.name);
        const isRef = fkInFields.has(f.name);
        const rel = m.relations.find((r) => r.fields.includes(f.name));
        const comment = f.comment || (rel ? `→ ${rel.targetModel}.${rel.references[0]}` : "");
        const flags = [isPK ? "PK" : "", isUK ? "UK" : "", isCompUK ? "cUK" : "", isFK ? "FK" : "", isRef ? "REF" : ""].filter(Boolean).join("+");
        lines.push(`| \`${f.name}\` | ${f.type} | ${f.required ? "*" : ""} | ${flags} | ${comment} |`);
      }

      const outDeps = m.relations.map((r) => r.targetModel).filter((t) => modelMap.has(t));
      const inDeps = m.inboundFrom.filter((t) => modelMap.has(t));

      if (outDeps.length > 0) {
        const links = outDeps
          .map((d) => {
            const dNum = modelNumbers.get(d) || "";
            return `[${dNum} ${d}](#${d.toLowerCase()})`;
          })
          .join(", ");
        lines.push(`\n→ Depends on: ${links}`);
      }
      if (inDeps.length > 0) {
        const links = inDeps
          .map((d) => {
            const dNum = modelNumbers.get(d) || "";
            return `[${dNum} ${d}](#${d.toLowerCase()})`;
          })
          .join(", ");
        lines.push(`\n← Referenced by: ${links}`);
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}

// ═══════════════════════════════════════════════════════════
//  PART 2 — API Routes → api.html + api.md
// ═══════════════════════════════════════════════════════════

interface ApiEndpoint {
  path: string;
  displayPath: string;
  method: string;
  auth: string;
  description: string;
}

const METHOD_COLOR: Record<string, string> = {
  GET: "#2563eb",
  POST: "#059669",
  PUT: "#d97706",
  DELETE: "#dc2626",
};

function permLabel(resource: string, role: string): string {
  if (resource === "system" && role === "admin") return "系统管理员";
  if (resource === "people" && role === "access") return "人事权限";
  if (resource === "works" && role === "admin") return "工作清单管理";
  if (resource === "works" && role === "access") return "工作清单权限";
  if (resource === "report" && role === "access") return "报告权限";
  return `${resource}.${role}`;
}

function extractAuth(content: string): string {
  const hasAuth = content.includes("authenticate(") || content.includes("getTokenFromCookie(") || content.includes("requireAdmin(");
  const has403 = content.includes("status: 403") || content.includes("status:403") || content.includes("requireAdmin(");

  const checks: string[] = [];
  if (hasAuth) checks.push("登录");

  // 只有文件中存在 403/requireAdmin 时才统计 checkPermission/checkHRAccess
  // （auth/me 等文件也调用 checkPermission 但只是查询用户权限，不控制访问）
  if (has403) {
    if (content.includes("checkHRAccess(")) checks.push("HR权限");
    if (content.includes("requireAdmin(")) checks.push("系统管理员");
    if (content.includes("isAdmin(") && !checks.includes("系统管理员")) checks.push("系统管理员");

    // 只匹配在 if 条件上下文中的 checkPermission 调用
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.includes("checkPermission(")) continue;
      const context = lines
        .slice(Math.max(0, i - 2), Math.min(lines.length, i + 5))
        .join("\n");
      if (context.includes("if") && context.includes("403")) {
        const permMatch = line.match(
          /checkPermission\([^,]+,\s*"([^"]+)",\s*"([^"]+)"\)/
        );
        if (permMatch) {
          const label = permLabel(permMatch[1], permMatch[2]);
          if (!checks.includes(label)) checks.push(label);
        }
      }
    }
  }

  if (checks.length === 0) return "公开";
  if (checks.length === 1) return checks[0];
  return checks.join(" + ");
}

function parseApiRoutes(): ApiEndpoint[] {
  const apiDir = path.resolve(__dirname, "../../app/api");
  const routes: ApiEndpoint[] = [];

  function walk(dir: string, prefix: string) {
    const entries = fs.readdirSync(dir);
    for (const entry of entries) {
      const fullPath = path.join(dir, entry);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        walk(fullPath, path.join(prefix, entry));
      } else if (entry === "route.ts" || entry === "route.tsx") {
        const content = fs.readFileSync(fullPath, "utf-8");
        const methods: string[] = [];
        const methodMatches = content.matchAll(/export async function (GET|POST|PUT|DELETE)/g);
        for (const m of methodMatches) methods.push(m[1]);

        const auth = extractAuth(content);
        const pathParts = prefix.split(/[\\/]/).filter(Boolean);
        const displayParts = pathParts.map((p) => (/^\[/.test(p) ? `:${p.replace(/[\[\]]/g, "")}` : p));
        const displayPath = "/api/" + displayParts.join("/");
        const pathKey = "/api/" + pathParts.join("/");

        for (const method of methods) {
          routes.push({
            path: pathKey,
            displayPath,
            method,
            auth,
            description: generateDescription(pathKey, method),
          });
        }
      }
    }
  }

  walk(apiDir, "");
  return routes.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
}

function generateDescription(path: string, method: string): string {
  const p = path.replace(/^\/api\//, "");
  if (p === "auth/me" && method === "GET") return "获取当前登录用户信息";
  if (p === "auth/change-password" && method === "POST") return "修改密码";
  if (p === "auth/dev-login" && method === "POST") return "开发环境登录";
  if (p === "auth/dev-login" && method === "DELETE") return "退出登录";
  if (p === "employees" && method === "GET") return "员工列表（含岗位信息扁平化）";
  if (p === "employees" && method === "POST") return "创建员工";
  if (p.startsWith("employees/") && p.includes("[id]") && method === "PUT") return "更新员工基础信息";
  if (p === "employees/search" && method === "GET") return "员工搜索（姓名/工号/拼音）";
  if (p === "employees/autocomplete" && method === "GET") return "员工自动补全";
  if (p === "employee-positions" && method === "GET") return "员工岗位关联列表";
  if (p === "employee-positions" && method === "POST") return "创建员工岗位关联";
  if (p.startsWith("employee-positions/") && method === "PUT") return "更新员工岗位关联";
  if (p.startsWith("employee-positions/") && method === "DELETE") return "删除员工岗位关联";
  if (p === "employee-projects" && method === "GET") return "员工项目关联列表";
  if (p === "employee-projects" && method === "POST") return "创建员工项目关联";
  if (p.startsWith("employee-projects/") && method === "PUT") return "更新员工项目关联";
  if (p.startsWith("employee-projects/") && method === "DELETE") return "删除员工项目关联";
  if (p === "departments" && method === "GET") return "部门列表";
  if (p === "departments" && method === "POST") return "创建部门";
  if (p === "departments" && method === "PUT") return "更新部门";
  if (p === "departments" && method === "DELETE") return "删除部门";
  if (p === "department-positions" && method === "GET") return "部门岗位配置列表";
  if (p === "positions" && method === "GET") return "岗位列表";
  if (p === "positions" && method === "POST") return "创建岗位";
  if (p === "positions" && method === "PUT") return "更新岗位";
  if (p === "positions" && method === "DELETE") return "删除岗位";
  if (p === "projects" && method === "GET") return "项目列表";
  if (p === "projects" && method === "POST") return "创建项目";
  if (p.startsWith("projects/") && method === "PUT") return "更新项目";
  if (p.startsWith("projects/") && method === "DELETE") return "删除项目";
  if (p === "modules/work/projects" && method === "GET") return "项目管理列表";
  if (p === "modules/work/projects" && method === "POST") return "新建项目管理记录";
  if (p.startsWith("modules/work/projects/") && method === "PUT") return "更新项目管理记录";
  if (p.startsWith("modules/work/projects/") && method === "DELETE") return "删除项目管理记录";
  if (p === "modules/work/project-members" && method === "GET") return "项目管理人员列表";
  if (p === "modules/work/project-members" && method === "POST") return "新建项目人员";
  if (p.startsWith("modules/work/project-members/") && method === "PUT") return "更新项目人员";
  if (p.startsWith("modules/work/project-members/") && method === "DELETE") return "删除项目人员";
  if (p === "works" && method === "GET") return "工作清单列表";
  if (p === "works" && method === "POST") return "创建工作项";
  if (p.startsWith("works/") && method === "PUT") return "更新工作项";
  if (p.startsWith("works/") && method === "DELETE") return "删除工作项";
  if (p === "reports" && method === "GET") return "周报列表";
  if (p === "reports" && method === "POST") return "提交周报";
  if (p.startsWith("reports/") && p.includes("versions") && method === "GET") return "查看周报版本";
  if (p.startsWith("reports/") && method === "PUT") return "更新周报";
  if (p === "user/routine" && method === "GET") return "获取用户日常模板";
  if (p === "user/routine" && method === "PUT") return "更新用户日常模板";
  if (p === "my-targets" && method === "GET") return "获取我的汇报对象";
  if (p === "my-api-key" && method === "GET") return "获取我的API Key";
  if (p === "my-api-key" && method === "POST") return "申请/重新申请API Key";
  if (p === "week-info" && method === "GET") return "获取当前周期信息";
  if (p === "admin/company-codes" && method === "GET") return "公司编码列表";
  if (p === "admin/company-codes" && method === "PUT") return "更新公司编码";
  if (p === "admin/company-codes" && method === "DELETE") return "删除公司编码";
  if (p === "admin/department-codes" && method === "GET") return "部门编码列表";
  if (p === "admin/department-codes" && method === "PUT") return "更新部门编码";
  if (p === "admin/department-codes" && method === "DELETE") return "删除部门编码";
  if (p === "admin/position-codes" && method === "GET") return "岗位编码列表";
  if (p === "admin/position-codes" && method === "PUT") return "更新岗位编码";
  if (p === "admin/position-codes" && method === "DELETE") return "删除岗位编码";
  if (p === "admin/department-admins" && method === "GET") return "部门管理员列表";
  if (p === "admin/department-admins" && method === "PUT") return "设置部门管理员";
  if (p === "admin/department-admins" && method === "DELETE") return "移除部门管理员";
  if (p === "admin/departments" && method === "GET") return "Admin部门列表";
  if (p === "admin/departments" && method === "DELETE") return "Admin删除部门";
  if (p === "admin/system-config" && method === "GET") return "系统配置列表";
  if (p === "admin/system-config" && method === "PUT") return "更新系统配置";
  if (p === "admin/permissions" && method === "GET") return "权限树";
  if (p === "admin/user-permissions" && method === "PUT") return "切换用户权限";
  if (p === "admin/employee-permissions" && method === "GET") return "员工权限列表";
  if (p === "admin/employee-permissions" && method === "PUT") return "切换员工权限";
  if (p === "admin/department-permissions" && method === "GET") return "部门权限列表";
  if (p === "admin/department-permissions" && method === "PUT") return "切换部门权限";
  if (p === "admin/position-permissions" && method === "GET") return "岗位权限列表";
  if (p === "admin/position-permissions" && method === "PUT") return "切换岗位权限";
  if (p === "admin/users" && method === "GET") return "用户列表";
  if (p.startsWith("admin/users/") && method === "POST") return "重置用户密码";
  if (p.startsWith("admin/users/") && method === "PUT") return "更新用户信息";
  if (p === "admin/edit-history" && method === "GET") return "编辑历史查询";
  return "";
}

function groupEndpoints(endpoints: ApiEndpoint[]): Map<string, ApiEndpoint[]> {
  const groups = new Map<string, ApiEndpoint[]>();
  for (const ep of endpoints) {
    const firstPart = ep.path.replace(/^\/api\//, "").split("/")[0];
    let group = firstPart;
    if (firstPart === "admin") {
      const secondPart = ep.path.replace(/^\/api\/admin\//, "").split("/")[0];
      if (["company-codes", "department-codes", "position-codes"].includes(secondPart)) group = "admin-codes";
      else if (["department-admins", "departments"].includes(secondPart)) group = "admin-dept";
      else if (secondPart === "system-config") group = "admin-config";
      else if (secondPart === "permissions") group = "admin-perms";
      else if (["user-permissions", "employee-permissions", "department-permissions", "position-permissions"].includes(secondPart)) group = "admin-perms";
      else if (secondPart === "users") group = "admin-users";
      else if (secondPart === "edit-history") group = "admin-history";
      else group = "admin-other";
    } else if (["employees", "employee-positions", "employee-projects", "departments", "department-positions", "positions"].includes(firstPart)) {
      group = "roster";
    } else if (["works", "reports", "week-info"].includes(firstPart)) {
      group = "work";
    } else if (["projects", "my-targets"].includes(firstPart) || ep.path.startsWith("/api/modules/work/projects") || ep.path.startsWith("/api/modules/work/project-members")) {
      group = "project";
    } else if (["auth", "my-api-key", "user"].includes(firstPart)) {
      group = "auth";
    }

    const groupName: Record<string, string> = {
      auth: "认证与账户",
      roster: "花名册与组织架构",
      project: "项目管理",
      work: "工作与报告",
      "admin-codes": "Admin — 编码管理",
      "admin-dept": "Admin — 部门管理",
      "admin-config": "Admin — 系统配置",
      "admin-perms": "Admin — 权限管理",
      "admin-users": "Admin — 用户管理",
      "admin-history": "Admin — 编辑历史",
      "admin-other": "Admin — 其他",
    };

    const displayGroup = groupName[group] || group;
    if (!groups.has(displayGroup)) groups.set(displayGroup, []);
    groups.get(displayGroup)!.push(ep);
  }

  // Sort groups
  const order = [
    "认证与账户",
    "花名册与组织架构",
    "项目管理",
    "工作与报告",
    "Admin — 编码管理",
    "Admin — 部门管理",
    "Admin — 系统配置",
    "Admin — 权限管理",
    "Admin — 用户管理",
    "Admin — 编辑历史",
    "Admin — 其他",
  ];
  const sorted = new Map<string, ApiEndpoint[]>();
  for (const key of order) {
    if (groups.has(key)) sorted.set(key, groups.get(key)!);
  }
  for (const [key, val] of groups) {
    if (!sorted.has(key)) sorted.set(key, val);
  }
  return sorted;
}

function generateApiHTML(endpoints: ApiEndpoint[]): string {
  const groups = groupEndpoints(endpoints);
  const rows: string[] = [];

  rows.push(`<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>HR API Reference</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f8fafc; color: #1e293b; }
  .container { max-width: 960px; margin: 0 auto; padding: 48px 24px; }
  h1 { font-size: 28px; font-weight: 700; margin-bottom: 8px; }
  .subtitle { color: #64748b; font-size: 14px; margin-bottom: 40px; }
  .group { margin-bottom: 40px; }
  .group-title { font-size: 18px; font-weight: 700; color: #0f172a; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 2px solid #e2e8f0; }
  .endpoint { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px 20px; margin-bottom: 12px; display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
  .method { font-size: 12px; font-weight: 700; padding: 3px 10px; border-radius: 4px; color: #fff; min-width: 56px; text-align: center; }
  .path { font-family: "SF Mono", "Menlo", monospace; font-size: 14px; color: #0f172a; }
  .auth { font-size: 12px; color: #64748b; background: #f1f5f9; padding: 2px 10px; border-radius: 12px; }
  .desc { font-size: 13px; color: #475569; margin-left: auto; }
  @media (max-width: 640px) {
    .endpoint { flex-direction: column; align-items: flex-start; gap: 6px; }
    .desc { margin-left: 0; }
  }
  .summary { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin-bottom: 40px; }
  .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; text-align: center; }
  .summary-item .num { font-size: 28px; font-weight: 700; color: #0f172a; }
  .summary-item .label { font-size: 12px; color: #94a3b8; margin-top: 4px; }
  @media (max-width: 640px) { .summary-grid { grid-template-columns: repeat(2, 1fr); } }
</style>
</head>
<body>
<div class="container">
<h1>HR API Reference</h1>
<p class="subtitle">${endpoints.length} endpoints across ${groups.size} groups</p>
<div class="summary">
  <div class="summary-grid">
    <div class="summary-item"><div class="num">${endpoints.filter((e) => e.method === "GET").length}</div><div class="label">GET</div></div>
    <div class="summary-item"><div class="num">${endpoints.filter((e) => e.method === "POST").length}</div><div class="label">POST</div></div>
    <div class="summary-item"><div class="num">${endpoints.filter((e) => e.method === "PUT").length}</div><div class="label">PUT</div></div>
    <div class="summary-item"><div class="num">${endpoints.filter((e) => e.method === "DELETE").length}</div><div class="label">DELETE</div></div>
  </div>
</div>
`);

  for (const [groupName, eps] of groups) {
    rows.push(`<div class="group"><div class="group-title">${groupName}</div>`);
    for (const ep of eps) {
      const color = METHOD_COLOR[ep.method] || "#6b7280";
      rows.push(`<div class="endpoint">
  <span class="method" style="background:${color}">${ep.method}</span>
  <span class="path">${ep.displayPath}</span>
  <span class="auth">${ep.auth}</span>
  <span class="desc">${ep.description}</span>
</div>`);
    }
    rows.push(`</div>`);
  }

  rows.push(`</div></body></html>`);
  return rows.join("\n");
}

function generateApiMD(endpoints: ApiEndpoint[]): string {
  const groups = groupEndpoints(endpoints);
  const lines: string[] = [];
  lines.push(`# HR API Reference\n`);
  lines.push(`**${endpoints.length} endpoints** across ${groups.size} groups\n`);

  const stats = [
    `GET: ${endpoints.filter((e) => e.method === "GET").length}`,
    `POST: ${endpoints.filter((e) => e.method === "POST").length}`,
    `PUT: ${endpoints.filter((e) => e.method === "PUT").length}`,
    `DELETE: ${endpoints.filter((e) => e.method === "DELETE").length}`,
  ];
  lines.push(stats.join(" | ") + "\n");

  for (const [groupName, eps] of groups) {
    lines.push(`## ${groupName}\n`);
    lines.push(`| Method | Path | Auth | Description |`);
    lines.push(`|--------|------|------|-------------|`);
    for (const ep of eps) {
      lines.push(`| **${ep.method}** | \`${ep.displayPath}\` | ${ep.auth} | ${ep.description} |`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ═══════════════════════════════════════════════════════════
//  MAIN
// ═══════════════════════════════════════════════════════════

const schemaPath = path.resolve(__dirname, "../../prisma/schema.prisma");
const { models } = parseSchema(schemaPath);

fs.writeFileSync(path.resolve(__dirname, "../../docs/generated/tables.html"), generateTablesHTML(models), "utf-8");
fs.writeFileSync(path.resolve(__dirname, "../../docs/generated/tables.md"), generateTablesMD(models), "utf-8");
console.log(`✓ docs/generated/tables.html  (${models.length} models)`);
console.log(`✓ docs/generated/tables.md`);

const apiEndpoints = parseApiRoutes();
fs.writeFileSync(path.resolve(__dirname, "../../docs/generated/api.html"), generateApiHTML(apiEndpoints), "utf-8");
console.log(`✓ docs/generated/api.html  (${apiEndpoints.length} endpoints)`);

const apiMdPath = path.resolve(__dirname, "../../docs/generated/api.md");
if (!fs.existsSync(apiMdPath)) {
  fs.writeFileSync(apiMdPath, generateApiMD(apiEndpoints), "utf-8");
  console.log(`✓ docs/generated/api.md`);
} else {
  console.log(`✓ docs/generated/api.md (skipped — handwritten, delete to regenerate)`);
}
