import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const deployScript = readFileSync(path.join(root, "ops/deploy-image.sh"), "utf8");

test("production deployment mounts the tenant brand directory into the immutable image", () => {
  assert.match(
    deployScript,
    /runtime_brand_dir="\$REMOTE_DIR\/\.workspace\/assets\/brand\/company"/,
  );
  assert.match(
    deployScript,
    /runtime_mounts\+=\(-v "\$runtime_brand_dir:\/workspace\/workspace\/public\/company:ro"\)/,
  );
  assert.match(deployScript, /tenant brand logo is missing:/);
});

test("production deployment accepts candidate and public traffic only when the logo is an image", () => {
  assert.match(deployScript, /\[\[ "\$content_type" == image\/\* \]\]/);
  assert.match(
    deployScript,
    /probe_logo "http:\/\/127\.0\.0\.1:3101\/workspace\/company\/\$runtime_brand_logo"/,
  );
  assert.match(deployScript, /probe_logo "\$public_base_url\/company\/\$runtime_brand_logo"/);
});
