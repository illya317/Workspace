import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { findAntdSurfaceParityViolations } from "./antd-surface-parity";

function write(root: string, relativePath: string, source: string) {
  const file = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, source);
}

function validFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "antd-surface-parity-"));
  const files: Array<[string, string]> = [
    ["packages/core/ui/InputSurface.tsx", "const x = <AntdInputSurface {...props} />;"],
    ["packages/core/ui/DataSurface.tsx", "const x = <AntdDataSurface data={props} />;"],
    ["packages/core/ui/SelectorSurface.tsx", "const x = <AntdSelectorSurface />;"],
    ["packages/core/ui/BodySurface.tsx", "const x = <AntdBodySurface body={props} />;"],
    ["packages/core/ui/FormSurface.tsx", "const x = <AntdFormSurface />;"],
    ["packages/core/ui/CreateSurface.tsx", "const x = <AntdCreatePanel />;"],
    ["packages/core/ui/PageSurface.tsx", "const x = <AntdPageBody />;"],
    ["packages/core/ui/Toolbar.tsx", "const AntdToolbarOptionGroup = AntdToolbarItemRenderer;"],
    ["packages/core/ui/internal/page/antd-page.tsx", "const x = <AntdBodySurface body={body} />;"],
    ["packages/core/ui/internal/body/antd-body.tsx", "const a = <DocumentSurface {...body.document} />; const b = <VisualizationSurface {...body.visualization} />; const c = <BodySurfaceList />;"],
    ["packages/core/ui/SelectorSurface.types.ts", "export type Selector = { id: string };"],
    ["packages/core/ui/internal/data/antd-data-cell.tsx", '["input","group","data","form","create-trigger","create-anchor","interactive","selectionGrid","action","actions"];'],
  ];
  for (const [file, source] of files) write(root, file, source);
  return root;
}

test("Ant Surface parity accepts legal Ant names and reports retired files and exact imports", () => {
  const root = validFixture();
  try {
    assert.deepEqual(findAntdSurfaceParityViolations(root), []);
    write(root, "packages/core/ui/internal/toolbar/ToolbarOptionGroup.tsx", "export default function Old() {};");
    assert.ok(findAntdSurfaceParityViolations(root).some((item) => item.includes("retired general renderer still exists")));
    fs.unlinkSync(path.join(root, "packages/core/ui/internal/toolbar/ToolbarOptionGroup.tsx"));
    write(root, "packages/core/ui/internal/toolbar/consumer.tsx", 'import Old from "./ToolbarOptionGroup"; export const x = <Old />;');
    assert.ok(findAntdSurfaceParityViolations(root).some((item) => item.includes("imports retired ./ToolbarOptionGroup")));
    write(root, "packages/core/ui/internal/toolbar/consumer.tsx", "export const AntdToolbarOptionGroup = () => null;");
    write(root, "packages/core/showcase/internal-ui.ts", 'export { default as Old } from "../ui/internal/create/InlineCreatePanel";');
    assert.ok(findAntdSurfaceParityViolations(root).some((item) => item.includes("packages/core/showcase/internal-ui.ts: imports retired")));
    write(root, "packages/core/showcase/internal-ui.ts", "export const CurrentShowcase = true;");
    write(root, "packages/core/ui/registry/components.ts", 'export const components = [{ id: "CreatePresentationPanel" }];');
    assert.ok(findAntdSurfaceParityViolations(root).some((item) => item.includes("registers retired CreatePresentationPanel")));
    write(root, "packages/core/ui/internal/common/deprecated.tsx", 'export const x = <Divider type="vertical" />;');
    assert.ok(findAntdSurfaceParityViolations(root).some((item) => item.includes("deprecated Ant property Divider.type")));
    write(root, "packages/core/ui/internal/body/antd-body.tsx", "const a = <DocumentSurface {...body.document} />; const b = <VisualizationSurface {...body.visualization} />; const c = <BodySurface />;");
    assert.ok(findAntdSurfaceParityViolations(root).some((item) => item.includes("recursively delegates to BodySurface")));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
