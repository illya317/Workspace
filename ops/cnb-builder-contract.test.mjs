import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dockerfile = readFileSync(new URL("./cnb-builder.Dockerfile", import.meta.url), "utf8");
const verifyBuilder = readFileSync(new URL("./verify-cnb-builder.sh", import.meta.url), "utf8");
const stageRunner = readFileSync(new URL("./run-cnb-release-stage.sh", import.meta.url), "utf8");

test("CNB Builder pins Node Bookworm by digest and removes apt metadata", () => {
  assert.match(
    dockerfile,
    /^FROM node:24-bookworm@sha256:5711a0d445a1af54af9589066c646df387d1831a608226f4cd694fc59e745059$/m,
  );
  assert.match(dockerfile, /openssh-client/);
  assert.match(dockerfile, /rsync/);
  assert.match(dockerfile, /rm -rf \/var\/lib\/apt\/lists\/\*/);
});

test("Builder smoke enforces repository Node and every release tool", () => {
  assert.match(verifyBuilder, /\.node-version/);
  for (const command of ["node", "npm", "ssh", "rsync", "git", "tar", "python3", "make", "g++"]) {
    assert.ok(verifyBuilder.includes(command), `missing Builder smoke command: ${command}`);
  }
  assert.match(verifyBuilder, /uname -s/);
});

test("timed CNB stage runner binds records to the exact injection parent", () => {
  assert.match(stageRunner, /\.cnb-release\.json\\n\.cnb\.yml/);
  assert.match(stageRunner, /git rev-parse HEAD\^/);
  assert.match(stageRunner, /RELEASE_TIMING_FILE/);
  assert.match(stageRunner, /release_timing_run "\$stage" "\$@"/);
  assert.doesNotMatch(stageRunner, /echo .*"\$@"|printf .*"\$@"/);
});
