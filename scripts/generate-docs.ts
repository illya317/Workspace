import * as fs from "fs";
import * as path from "path";

// ─── Parse Prisma Schema ─────────────────────────────────

interface Field {
  name: string;
  type: string;
  required: boolean;
  comment: string;
  isRelation: boolean;
}

interface Relation {
  name: string;        // field name in this model
  targetModel: string; // what it points to
  fields: string[];    // FK columns
  references: string[];// referenced columns
  optional: boolean;   // is the FK nullable?
}

interface Model {
  name: string;
  comment: string;      // group comment above it
  fields: Field[];
  relations: Relation[];// outbound: this model → others
  inboundFrom: string[];// inbound: other models → this model
}

function parseSchema(schemaPath: string): { models: Model[], groups: string[] } {
  const content = fs.readFileSync(schemaPath, "utf-8");
  const lines = content.split("\n");

  const models: Model[] = [];
  const groups: string[] = [];
  let currentGroup = "";
  let currentModel: Model | null = null;
  let currentField: Partial<Field> | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Group comment: // ─── xxx ───
    const groupMatch = line.match(/\/\/\s*───\s*(.+?)\s*───/);
    if (groupMatch) {
      if (currentGroup) groups.push(currentGroup);
      currentGroup = groupMatch[1].trim();
      continue;
    }

    // Model start
    const modelMatch = line.match(/^model\s+(\w+)\s*\{/);
    if (modelMatch) {
      currentModel = {
        name: modelMatch[1],
        comment: currentGroup,
        fields: [],
        relations: [],
        inboundFrom: [],
      };
      continue;
    }

    // Model end
    if (line.trim() === "}" && currentModel) {
      models.push(currentModel);
      currentModel = null;
      continue;
    }

    // Field line
    if (currentModel) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("@@")) continue;

      // Parse field: name Type @attributes // comment
      const fieldMatch = trimmed.match(/^(\w+)\s+(\w+)(\?)?(\[\])?\s*(.*)$/);
      if (fieldMatch) {
        const [, name, type, optional, isArray, rest] = fieldMatch;
        const isRelation = rest.includes("@relation");

        // Extract comment
        const commentMatch = rest.match(/\/\/\s*(.+)/);
        const comment = commentMatch ? commentMatch[1] : "";

        currentModel.fields.push({
          name,
          type: type + (isArray ? "[]" : ""),
          required: !optional,
          comment,
          isRelation,
        });

        // Parse @relation — handle all variations
        // @relation(fields: [x], references: [y], onDelete: Cascade)
        // @relation("Name", fields: [x], references: [y])
        const relRegex = /fields:\s*\[([^\]]+)\],\s*references:\s*\[([^\]]+)\]/;
        const relMatch = rest.match(relRegex);
        if (relMatch) {
          currentModel.relations.push({
            name,
            targetModel: type.replace("?", "").replace("[]", ""),
            fields: relMatch[1].split(",").map((s: string) => s.trim()),
            references: relMatch[2].split(",").map((s: string) => s.trim()),
            optional: !!optional,
          });
        }
      }
    }
  }

  if (currentGroup) groups.push(currentGroup);

  // Compute inbound references
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

// ─── Generate HTML ───────────────────────────────────────

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
  "周报模块": "3. Reports",
  "工作清单模块（独立）": "4. Tasks",
  "花名册与组织架构": "5. Roster & Org",
  "编辑历史": "6. Edit History",
};

function generateHTML(models: Model[], groups: string[]): string {
  const modelMap = new Map(models.map(m => [m.name, m]));
  // Map group titles to English if available
  const navModelGroups = models.map(m => GROUP_EN[m.comment] || m.comment);
  const navUniqueGroups = [...new Set(navModelGroups)];

  // Assign model numbers: group-seq
  const modelNumbers = new Map<string, string>();
  let groupIdx = 0;
  for (const model of models) {
    const g = model.comment;
    if (!groups.includes(g)) {
      groups.push(g);
    }
  }

  // Rebuild groups from models
  const uniqueGroups = [...new Set(models.map(m => m.comment))];

  let seq = 0;
  let globalIdx = 0;
  for (const g of uniqueGroups) {
    globalIdx++;
    seq = 0;
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
  .table-header p { font-size: 14px; color: #64748b; margin-top: 4px; }

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
  .notes-cell { color: #dc2626; font-size: 12px; min-width: 80px; outline: 2px solid transparent; border-radius: 3px; cursor: text; }
  .notes-cell:hover { outline-color: #e2e8f0; }
  .notes-cell:focus { outline-color: #ef4444; background: #fef2f2; }
  .notes-cell:empty::before { content: ''; }
  .export-bar { margin-top: 20px; padding-top: 16px; border-top: 1px solid #e2e8f0; }
  .export-btn { display: block; width: 100%; padding: 8px 12px; background: #0f172a; color: #fff; border: none; border-radius: 6px; font-size: 13px; cursor: pointer; }
  .export-btn:hover { background: #1e293b; }
  .fk-out td { background: #fef9e7; }    /* amber tint — FK pointing out */
  .fk-out td:first-child { border-left: 3px solid #f59e0b; }
  .fk-in td { background: #ecfdf5; }     /* emerald tint — referenced by others */
  .fk-in td:first-child { border-left: 3px solid #10b981; }
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

  // Navigation
  let navGroupIdx = 0;
  for (const g of uniqueGroups) {
    navGroupIdx++;
    const enTitle = GROUP_EN[g] || `${navGroupIdx}. ${g}`;
    rows.push(`<div class="group"><div class="group-title">${enTitle}</div>`);
    seq = 0;
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
  rows.push(`<div class="export-bar">
    <button class="export-btn" onclick="exportChanges()">Copy Changes</button>
    <div id="export-msg" style="font-size:11px;color:#10b981;margin-top:6px;display:none">Copied!</div>
  </div>`);
  rows.push(`</nav><main>`);

  // Content
  let contentGroupIdx = 0;
  for (const g of uniqueGroups) {
    contentGroupIdx++;
    const enTitle = GROUP_EN[g] || `${contentGroupIdx}. ${g}`;
    rows.push(`<div class="section"><div class="section-title">${enTitle}</div>`);

    seq = 0;
    for (const m of models) {
      if (m.comment !== g) continue;
      seq++;
      const num = modelNumbers.get(m.name)!;

      rows.push(`<div class="table-block" id="${m.name}">`);
      rows.push(`<div class="table-header"><h3><span class="table-num">${num}</span> ${m.name}</h3></div>`);

      // Pre-compute FK highlight sets
      // Outbound: fields in THIS model that are FKs pointing elsewhere
      const fkOutFields = new Set(m.relations.flatMap(r => r.fields));
      // Inbound: OTHER models' FK fields that reference THIS model's columns
      const fkInFields = new Set<string>();
      for (const other of models) {
        if (other === m) continue;
        for (const rel of other.relations) {
          if (rel.targetModel === m.name) {
            for (const ref of rel.references) fkInFields.add(ref);
          }
        }
      }

      // Fields
      rows.push(`<table class="field-table"><thead><tr><th style="width:160px">Field</th><th style="width:60px">Type</th><th>Description</th><th style="width:100px">Notes</th></tr></thead><tbody>`);
      for (const f of m.fields) {
        if (f.type.endsWith("[]")) continue;
        if (f.isRelation && !m.relations.some(r => r.fields.includes(f.name))) continue;
        const isFK = m.relations.some(r => r.fields.includes(f.name));
        const rel = m.relations.find(r => r.fields.includes(f.name));
        const comment = f.comment || (rel ? `→ ${rel.targetModel}.${rel.references[0]}` : "");
        const rowClass = fkOutFields.has(f.name) ? 'fk-out' : fkInFields.has(f.name) ? 'fk-in' : '';
        const fkSuffix = isFK && rel ? ` <span class="fk-link">→ <a href="#${rel.targetModel}" class="dep-link">${rel.targetModel}</a></span>` : '';
        rows.push(`<tr class="${rowClass}" data-model="${m.name}" data-field="${f.name}">
          <td><span class="field-name">${f.name}</span>${f.required ? ' <span class="field-required">*</span>' : ''}</td>
          <td><span class="field-type" style="background:${typeColor(f.type)}15;color:${typeColor(f.type)}">${typeBadge(f.type)}</span></td>
          <td class="field-comment">${comment}${fkSuffix}</td>
          <td class="notes-cell" contenteditable="true"></td>
        </tr>`);
      }
      rows.push(`</tbody></table>`);

      // Footer: deps
      const outDeps = m.relations.map(r => r.targetModel).filter(t => modelMap.has(t));
      const inDeps = m.inboundFrom.filter(t => modelMap.has(t));
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

  rows.push(`</main>
<script>
async function exportChanges() {
  const cells = document.querySelectorAll('td.notes-cell:not(:empty)');
  if (cells.length === 0) {
    const msg = document.getElementById('export-msg');
    msg.style.display = 'block'; msg.style.color = '#94a3b8';
    msg.textContent = 'No changes to copy.';
    setTimeout(() => msg.style.display = 'none', 2000);
    return;
  }
  let text = '';
  for (const cell of cells) {
    const row = cell.parentElement;
    text += row.getAttribute('data-model') + '\\t' + row.getAttribute('data-field') + '\\t' + cell.textContent.trim() + '\\n';
  }
  await navigator.clipboard.writeText(text);
  const msg = document.getElementById('export-msg');
  msg.style.display = 'block'; msg.style.color = '#10b981';
  msg.textContent = 'Copied ' + cells.length + ' changes';
  setTimeout(() => msg.style.display = 'none', 2000);
}
</script>
</body></html>`);
  return rows.join("\n");
}

// ─── Main ─────────────────────────────────────────────────

const schemaPath = path.resolve(__dirname, "../prisma/schema.prisma");
const outputPath = path.resolve(__dirname, "../docs/tables.html");

const { models, groups } = parseSchema(schemaPath);
const html = generateHTML(models, groups);
fs.writeFileSync(outputPath, html, "utf-8");

console.log(`Generated ${outputPath}`);
console.log(`  ${models.length} models in ${[...new Set(models.map(m => m.comment))].length} groups`);
for (const m of models) {
  console.log(`  ${m.name}: ${m.fields.length} fields, ${m.relations.length} outbound, ${m.inboundFrom.length} inbound`);
}
