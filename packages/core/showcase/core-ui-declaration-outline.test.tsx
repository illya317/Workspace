import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { CoreUiDeclarationOutline } from "./CoreUiDeclarationOutline";

test("declaration outline preserves nested semantic levels", () => {
  const html = renderToStaticMarkup(
    CoreUiDeclarationOutline({
      items: [{
        name: "kind",
        description: "正文类型",
        children: [{
          name: "section",
          description: "正文通用编排容器",
          children: [{ name: "sections", description: "递归 section tree" }],
        }],
      }],
    }),
  );

  assert.match(html, /role="tree"/);
  assert.match(html, /aria-level="1"/);
  assert.match(html, /aria-level="2"/);
  assert.match(html, /aria-level="3"/);
  assert.match(html, /aria-selected="false"/);
  assert.match(html, /role="group"/);
});
