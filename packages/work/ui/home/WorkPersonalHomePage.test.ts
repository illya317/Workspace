import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const homeSource = readFileSync(new URL("./WorkPersonalHomePage.tsx", import.meta.url), "utf8");
const pageSource = readFileSync(new URL("../../../../app/(modules)/work/me/page.tsx", import.meta.url), "utf8");

test("personal home does not block server rendering on the full workspace catalog", () => {
  assert.doesNotMatch(pageSource, /listWorkTaskSpaces/);
  assert.match(homeSource, /await loadWorkPersonalHomeNavigation<WorkTaskSpace>\(\)/);
});

test("personal home uses interruptible client navigation instead of full page reloads", () => {
  assert.doesNotMatch(homeSource, /window\.location\.assign/);
  assert.match(homeSource, /useRouter/);
  assert.match(homeSource, /startNavigation\(\(\) => router\.push/);
  assert.match(homeSource, /opening \? "打开中" : "查看"/);
});
