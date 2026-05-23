const fs = require('fs');
const path = require('path');

const SCHEMA_PATH = path.join(__dirname, '..', 'prisma', 'schema.prisma');
const OUTPUT_PATH = path.join(__dirname, '..', 'docs', 'tables.html');

const GROUPS = [
  { title: '1. System', models: ['User', 'SystemConfig'] },
  { title: '2. RBAC', models: ['Resource', 'Role', 'UserResourceRole', 'PositionResourceRole', 'DepartmentResourceRole'] },
  { title: '3. Reports', models: ['Report', 'ReportItem', 'ReportHistory'] },
  { title: '4. Tasks', models: ['WorkItem', 'WorkParticipant'] },
  { title: '5. Roster & Org', models: ['Employee', 'Employment', 'Company', 'CompanyRelation', 'Department', 'Position', 'EDP', 'Project', 'EmployeeProject'] },
  { title: '6. 岗位说明书', models: ['PositionDescription'] },
  { title: '7. Edit History', models: ['EditHistory'] },
];

// ─── Parse schema.prisma ──────────────────────────────────

const schemaText = fs.readFileSync(SCHEMA_PATH, 'utf8');

// Remove comments that are on their own line (keep inline comments)
const lines = schemaText.split('\n');

const models = {};
let currentModel = null;
let modelOrder = [];

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const modelMatch = line.match(/^model\s+(\w+)\s*\{/);
  if (modelMatch) {
    currentModel = {
      name: modelMatch[1],
      fields: [],
      uniqueConstraints: [], // @@unique
      indexConstraints: [],  // @@index
    };
    models[currentModel.name] = currentModel;
    modelOrder.push(currentModel.name);
    continue;
  }
  if (currentModel && line.trim() === '}') {
    currentModel = null;
    continue;
  }
  if (!currentModel) continue;

  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('//')) continue;

  // Table-level constraints
  const uniqueMatch = trimmed.match(/@@unique\(\[(.*?)\]\)/);
  if (uniqueMatch) {
    const fields = uniqueMatch[1].split(',').map(s => s.trim());
    currentModel.uniqueConstraints.push(fields);
    continue;
  }
  const indexMatch = trimmed.match(/@@index\(\[(.*?)\]\)/);
  if (indexMatch) {
    currentModel.indexConstraints.push(indexMatch[1].split(',').map(s => s.trim()));
    continue;
  }

  // Field definition
  // fieldName  Type?  @attr... // comment
  const fieldMatch = trimmed.match(/^(\w+)\s+(\??[\w\[\]]+\??)\s*(.*)$/);
  if (!fieldMatch) continue;

  const fieldName = fieldMatch[1];
  let rawType = fieldMatch[2];
  let rest = fieldMatch[3];

  // Extract inline comment
  let comment = '';
  const commentIdx = rest.indexOf('//');
  if (commentIdx !== -1) {
    comment = rest.slice(commentIdx + 2).trim();
    rest = rest.slice(0, commentIdx).trim();
  }

  // Check nullable
  const isRequired = !rawType.endsWith('?');
  const baseType = rawType.replace(/\?$/, '');

  const field = {
    name: fieldName,
    type: baseType,
    isRequired,
    comment,
    rest,
    isPk: /@id\b/.test(rest),
    isUk: /@unique\b/.test(rest),
    // FK info populated later
    fkTarget: null,
    isFk: false,
    // CUK info populated later
    cukIndices: [], // [{ constraintIndex, fieldIndex }]
    isRef: false,
    refSources: [], // [{ model, field }]
  };

  // Parse @relation for FK
  const relationMatch = rest.match(/@relation\([^)]*fields:\s*\[([^\]]+)\][^)]*references:\s*\[([^\]]+)\]/);
  if (relationMatch) {
    const fkFields = relationMatch[1].split(',').map(s => s.trim());
    const refParts = relationMatch[2].split(',').map(s => s.trim());
    // refParts like ['id'] or ['OtherModel.field'] ?
    // In Prisma, references usually points to fields in the target model
    // If single field, it's just the field name in the target model
    // We need to find which model this relation points to
    const relNameMatch = rest.match(/@relation\(\s*"([^"]+)"[^)]*fields:/);
    const relName = relNameMatch ? relNameMatch[1] : null;

    // Find target model from the relation field type or relation name
    // The relation field type is the model name (e.g., `user User @relation(...)`)
    // But we don't have that info here... we need to look at the field type
    // Wait, in Prisma, the relation attribute is on a relation field whose type is the target model
    // But in our parser, we only see the scalar fields with @relation? No!
    // In Prisma, @relation is on the RELATION field, not the FK field.
    // Example:
    //   parentId   Int?
    //   parent     Resource?  @relation("ResHierarchy", fields: [parentId], references: [id])
    // The FK field is parentId (scalar), the relation field is parent (with @relation).
    // But in some schemas, people put @relation on the scalar field? No, that's not valid Prisma.
    // Actually in our schema, @relation is on the relation field, not the scalar field.
    //
    // Looking at schema.prisma line 54:
    //   parent          Resource?                @relation("ResHierarchy", fields: [parentId], references: [id])
    //
    // So the field WITH @relation is a relation field, and the fields: [parentId] specifies the FK scalar field.
    // We need to mark parentId as FK, not the relation field itself.
    //
    // But wait, looking at our current tables.html, it shows `parentId` as FK, not `parent`.
    // So the current tables.html was manually constructed with this understanding.
    //
    // In our parser, when we encounter `parent` with @relation(fields: [parentId], references: [id]),
    // we should record that parentId (in the CURRENT model) is a FK referencing Resource.id.
    //
    // We need to know the target model. The field type gives us that!
    // In this case, the field `parent` has type `Resource?`, so target model is `Resource`.

    const targetModel = baseType.replace(/\[\]$/, '').replace(/\?$/, '');
    const targetField = refParts[0];

    // We don't mark the relation field as FK; we mark the scalar fields in `fields: [...]`
    // But we need to store this info somewhere to apply to the scalar fields.
    // Since we parse sequentially, the scalar field might have been parsed already or will be parsed.
    // We'll do a second pass for FK assignment.
    field._fkScalarFields = fkFields;
    field._fkTargetModel = targetModel;
    field._fkTargetField = targetField;
  }

  currentModel.fields.push(field);
}

// ─── Second pass: assign FK to scalar fields, CUK to fields ─

for (const modelName of modelOrder) {
  const model = models[modelName];

  // Map field name -> field index
  const fieldMap = {};
  model.fields.forEach((f, idx) => { fieldMap[f.name] = idx; });

  // Assign CUK
  model.uniqueConstraints.forEach((fields, cukIdx) => {
    fields.forEach((fn, fIdx) => {
      if (fieldMap[fn] !== undefined) {
        model.fields[fieldMap[fn]].cukIndices.push({ constraintIndex: cukIdx, fieldIndex: fIdx });
      }
    });
  });

  // Assign FK from relation fields
  for (const field of model.fields) {
    if (field._fkScalarFields) {
      for (const scalarName of field._fkScalarFields) {
        const scalarIdx = fieldMap[scalarName];
        if (scalarIdx !== undefined) {
          model.fields[scalarIdx].isFk = true;
          model.fields[scalarIdx].fkTarget = `${field._fkTargetModel}.${field._fkTargetField}`;
        }
      }
      delete field._fkScalarFields;
      delete field._fkTargetModel;
      delete field._fkTargetField;
    }
  }
}

// ─── Third pass: compute REF (which fields are referenced by FKs) ─

const refMap = {}; // "ModelName.fieldName" -> [{ sourceModel, sourceField }]

for (const modelName of modelOrder) {
  const model = models[modelName];
  for (const field of model.fields) {
    if (field.fkTarget) {
      const [targetModel, targetField] = field.fkTarget.split('.');
      const key = `${targetModel}.${targetField}`;
      if (!refMap[key]) refMap[key] = [];
      refMap[key].push({ sourceModel: modelName, sourceField: field.name });
    }
  }
}

for (const modelName of modelOrder) {
  const model = models[modelName];
  for (const field of model.fields) {
    const key = `${modelName}.${field.name}`;
    if (refMap[key]) {
      field.isRef = true;
      field.refSources = refMap[key];
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function typeBadge(type) {
  const t = type.toLowerCase();
  let bg = '#05966915', color = '#059669';
  if (t === 'int') { bg = '#2563eb15'; color = '#2563eb'; }
  else if (t === 'boolean' || t === 'bool') { bg = '#7c3aed15'; color = '#7c3aed'; }
  else if (t === 'datetime' || t === 'time') { bg = '#d9770615'; color = '#d97706'; }
  else if (t === 'float') { bg = '#6b728015'; color = '#6b7280'; }
  let label = t === 'datetime' ? 'time' : t === 'boolean' ? 'bool' : t === 'string' ? 'str' : t;
  if (type.endsWith('[]')) label = t.replace('[]', '') + '[]';
  return `<span class="field-type" style="background:${bg};color:${color}">${label}</span>`;
}

function buildFieldRow(field, model) {
  const classes = [];

  // Determine border color priority: PK > UK/CUK > REF
  if (field.isPk) classes.push('pk-border');
  else if (field.isUk || field.cukIndices.length > 0) classes.push('uk-border');
  else if (field.isRef) classes.push('ref-border');

  // Background for UK/CUK
  if (field.isUk || field.cukIndices.length > 0) classes.push('uk-bg');

  // Underline for FK / REF
  if (field.isFk) classes.push('fk-underline');
  if (field.isRef) classes.push('ref-underline');

  // Badges
  const badges = [];
  if (field.isPk) badges.push('<span class="kb pk">P</span>');

  if (field.isUk) {
    badges.push('<span class="kb uk">U</span>');
  }
  if (field.cukIndices.length > 0) {
    // Sort by constraint index, then field index, take the first
    const cuk = field.cukIndices.sort((a, b) => {
      if (a.constraintIndex !== b.constraintIndex) return a.constraintIndex - b.constraintIndex;
      return a.fieldIndex - b.fieldIndex;
    })[0];
    const sub = ['₁','₂','₃','₄','₅','₆','₇','₈','₉'][cuk.fieldIndex] || (cuk.fieldIndex + 1);
    badges.push(`<span class="kb uk">U${sub}</span>`);
  }

  if (field.isFk) {
    badges.push('<span class="kb fk">F</span>');
  }
  if (field.isRef) {
    badges.push('<span class="kb ref">R</span>');
  }

  // Description with FK link
  let desc = field.comment || '';
  if (field.isFk && field.fkTarget) {
    const [tModel] = field.fkTarget.split('.');
    const targetNum = tableNum(tModel);
    const link = targetNum ? `<a href="#${tModel}" class="dep-link">${targetNum} ${tModel}</a>` : `<a href="#${tModel}" class="dep-link">${tModel}</a>`;
    if (desc) desc += ' ';
    desc += `<span style="font-size:11px;color:#d97706">→ ${link}</span>`;
  }

  const cls = classes.length ? ` class="${classes.join(' ')}"` : '';
  const req = field.isRequired ? ' <span class="field-required">*</span>' : '';

  return `  <tr${cls}>
    <td><span class="field-name">${field.name}</span>${req}${badges.join('')}</td>
    <td>${typeBadge(field.type)}</td>
    <td class="field-comment">${desc}</td>
  </tr>`;
}

const numMap = {};
let globalNum = 1;
GROUPS.forEach(g => {
  g.models.forEach((m, idx) => {
    numMap[m] = `${globalNum}-${idx + 1}`;
  });
  globalNum++;
});

function tableNum(modelName) {
  return numMap[modelName] || '';
}

function buildConstraints(model) {
  const items = [];

  // PK
  const pkFields = model.fields.filter(f => f.isPk).map(f => f.name);
  if (pkFields.length) items.push(`PK: ${pkFields.join(', ')}`);

  // Single UK
  const ukFields = model.fields.filter(f => f.isUk && !f.cukIndices.length).map(f => f.name);
  if (ukFields.length) items.push(`UK: ${ukFields.join(', ')}`);

  // CUK
  model.uniqueConstraints.forEach((fields, idx) => {
    items.push(`Unique[${idx + 1}]: (${fields.join(', ')})`);
  });

  // FK
  const fkFields = model.fields.filter(f => f.isFk);
  if (fkFields.length) {
    const fkStrs = fkFields.map(f => {
      const [tm] = f.fkTarget.split('.');
      return `${f.name} → ${tm}`;
    });
    items.push(`FK: ${fkStrs.join(', ')}`);
  }

  return items;
}

// ─── Generate HTML ────────────────────────────────────────

let navLinks = '';
let mainContent = '';

GROUPS.forEach(g => {
  navLinks += `\n<div class="group"><div class="group-title">${g.title}</div>\n`;
  g.models.forEach(m => {
    const num = tableNum(m);
    navLinks += `<a href="#${m}">${num} ${m}</a>\n`;
  });
  navLinks += `</div>`;

  mainContent += `\n<div class="section"><div class="section-title">${g.title}</div>\n`;
  g.models.forEach(m => {
    const model = models[m];
    if (!model) return;
    const num = tableNum(m);

    // Depends on
    const deps = new Set();
    model.fields.forEach(f => {
      if (f.fkTarget) {
        const [tm] = f.fkTarget.split('.');
        deps.add(tm);
      }
    });

    // Referenced by
    const refs = new Set();
    model.fields.forEach(f => {
      if (f.refSources) {
        f.refSources.forEach(s => refs.add(s.sourceModel));
      }
    });

    const constraintItems = buildConstraints(model);

    mainContent += `<div class="table-block" id="${m}">\n`;
    mainContent += `<div class="table-header"><h3><span class="table-num">${num}</span> ${m}</h3></div>\n`;
    mainContent += `<table class="field-table"><thead><tr><th style="width:200px">Field</th><th style="width:60px">Type</th><th>Description</th></tr></thead><tbody>\n`;
    model.fields.forEach(f => {
      // Skip relation fields (fields whose type is a model name and have no scalar purpose)
      // In Prisma, relation fields have type = OtherModel or OtherModel[] and don't map to DB columns directly
      // But some fields like `parent` with @relation ARE relation fields.
      // We should skip fields that:
      // 1. Have @relation with fields/references (these are relation fields, not scalar)
      // 2. Type is a model name (starts with uppercase letter typically)
      // However, we also have fields like `details` which are String, so they're scalar.
      //
      // Let's check: if the field has @relation(fields:, references:), it's a relation field.
      // Also if the type is a known model name, it's likely a relation field.
      // But we need to be careful: some scalar fields might accidentally match.
      //
      // Actually in Prisma, relation fields always have @relation. So checking for @relation is enough.
      // But wait, some relation fields might not have @relation explicitly (implicit relations in Prisma).
      // In our schema, all relations seem explicit.
      //
      // Looking at schema, relation fields have types like `User?`, `Resource[]`, etc.
      // These are model names, not scalar types.
      //
      // Skip relation fields (type is another model name, with or without @relation)
      const baseTypeClean = f.type.replace(/\?$/, '').replace(/\[\]$/, '');
      const isRelationField = !!models[baseTypeClean];
      if (isRelationField) return;

      mainContent += buildFieldRow(f, model) + '\n';
    });
    mainContent += `</tbody></table>\n`;

    // Footer
    mainContent += `<div class="table-footer">\n`;

    if (constraintItems.length) {
      mainContent += `<div class="constraints">${constraintItems.map(c => `<span class="constraint-tag">${escapeHtml(c)}</span>`).join('')}</div>\n`;
    }

    mainContent += `<div class="dep-out"><span class="dep-label">Depends on:</span>\n`;
    if (deps.size === 0) {
      mainContent += `<span class="dep-none">无</span>\n`;
    } else {
      Array.from(deps).forEach(d => {
        const dn = tableNum(d);
        mainContent += `<a href="#${d}" class="dep-link">${dn} ${d}</a>\n`;
      });
    }
    mainContent += `</div>\n`;

    mainContent += `<div class="dep-in"><span class="dep-label">Referenced by:</span>\n`;
    if (refs.size === 0) {
      mainContent += `<span class="dep-none">无</span>\n`;
    } else {
      Array.from(refs).forEach(r => {
        const rn = tableNum(r);
        mainContent += `<a href="#${r}" class="dep-link">${rn} ${r}</a>\n`;
      });
    }
    mainContent += `</div>\n`;
    mainContent += `</div>\n`;
    mainContent += `</div>\n`;
  });
  mainContent += `</div>\n`;
});

const totalTables = Object.keys(models).length;

const html = `<!DOCTYPE html>
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
  main { flex: 1; padding: 40px 48px; max-width: 1100px; min-width: 0; }
  @media (max-width: 768px) { main { padding: 24px 16px; } }
  .section { margin-bottom: 48px; }
  .section-title { font-size: 22px; font-weight: 700; margin-bottom: 20px; padding-bottom: 8px; border-bottom: 2px solid #e2e8f0; color: #0f172a; }
  .table-block { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 24px; overflow-x: auto; }
  .table-header { padding: 16px 20px; border-bottom: 1px solid #f1f5f9; }
  .table-header h3 { font-size: 16px; font-weight: 600; display: flex; align-items: center; gap: 8px; }
  .table-num { display: inline-block; background: #0f172a; color: #fff; font-size: 12px; padding: 2px 8px; border-radius: 4px; font-weight: 500; }
  .field-table { width: 100%; border-collapse: collapse; }
  .field-table th { text-align: left; padding: 10px 20px; font-size: 12px; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; background: #fafbfc; border-bottom: 1px solid #f1f5f9; }
  .field-table td { padding: 10px 20px; font-size: 14px; border-bottom: 1px solid #f8fafc; vertical-align: middle; }
  .field-table tr:last-child td { border-bottom: none; }
  .field-name { font-family: "SF Mono", "Menlo", monospace; font-size: 13px; color: #0f172a; }
  .field-type { display: inline-block; font-size: 11px; padding: 1px 6px; border-radius: 3px; font-weight: 600; }
  .field-comment { color: #64748b; font-size: 13px; }
  .field-required { color: #ef4444; font-size: 10px; font-weight: 700; margin-left: 2px; }

  /* Key badges */
  .kb { display: inline-flex; align-items: center; justify-content: center; font-size: 9px; font-weight: 700; padding: 0 3px; border-radius: 3px; margin-left: 4px; height: 14px; line-height: 1; vertical-align: middle; }
  .kb.pk { background: #10b981; color: #fff; }
  .kb.uk { background: #06b6d4; color: #fff; }
  .kb.fk { background: #f59e0b; color: #fff; }
  .kb.ref { background: #8b5cf6; color: #fff; }

  /* Row borders */
  .pk-border td:first-child { border-left: 3px solid #10b981; }
  .uk-border td:first-child { border-left: 3px solid #06b6d4; }
  .ref-border td:first-child { border-left: 3px solid #8b5cf6; }
  .uk-bg td { background: #ecfeff; }

  /* Field underlines */
  .fk-underline .field-name { text-decoration: underline; text-decoration-color: #f59e0b; text-underline-offset: 3px; text-decoration-style: solid; text-decoration-thickness: 2px; }
  .ref-underline .field-name { text-decoration: underline; text-decoration-color: #8b5cf6; text-underline-offset: 3px; text-decoration-style: solid; text-decoration-thickness: 2px; }

  .table-footer { padding: 12px 20px; background: #fafbfc; border-top: 1px solid #f1f5f9; display: flex; flex-direction: column; gap: 8px; font-size: 13px; }
  .constraints { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 4px; }
  .constraint-tag { display: inline-block; background: #e2e8f0; color: #475569; font-size: 11px; padding: 2px 8px; border-radius: 3px; font-family: "SF Mono", "Menlo", monospace; }
  .dep-out, .dep-in { display: flex; align-items: flex-start; gap: 6px; flex-wrap: wrap; }
  .dep-label { color: #94a3b8; white-space: nowrap; }
  .dep-link { display: inline-block; background: #f1f5f9; padding: 1px 8px; border-radius: 3px; font-family: "SF Mono", "Menlo", monospace; font-size: 12px; color: #475569; text-decoration: none; }
  .dep-link:hover { background: #e2e8f0; }
  .dep-none { color: #cbd5e1; }
  .legend { display: flex; gap: 12px; margin-top: 16px; font-size: 11px; color: #94a3b8; flex-wrap: wrap; }
  .legend span { display: inline-flex; align-items: center; gap: 4px; }
  .legend-swatch { display: inline-block; width: 12px; height: 12px; border-radius: 2px; }
</style>
</head>
<body>
<nav>
<h1>HR Database Schema</h1>
<p style="font-size:12px;color:#94a3b8;margin-bottom:20px">${totalTables} tables</p>
${navLinks}
<div class="legend">
  <span><span class="legend-swatch" style="background:#10b981"></span> PK</span>
  <span><span class="legend-swatch" style="background:#06b6d4"></span> UK</span>
  <span><span class="legend-swatch" style="background:#f59e0b"></span> FK</span>
  <span><span class="legend-swatch" style="background:#8b5cf6"></span> REF</span>
  <span><span style="color:#ef4444;font-weight:700">*</span> Required</span>
</div>
</nav>
<main>
${mainContent}
</main>
</body>
</html>
`;

fs.writeFileSync(OUTPUT_PATH, html);
console.log(`Generated ${OUTPUT_PATH} (${totalTables} tables)`);
