import { readFileSync } from "node:fs";

const PAGE_SURFACE_FILE = "packages/core/ui/PageSurface.tsx";

function directoryRendererSource(source: string) {
  const start = source.indexOf("function renderDirectorySurface");
  if (start < 0) return null;
  const bodyStart = source.indexOf("{", start);
  if (bodyStart < 0) return null;
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  return source.slice(start);
}

export function checkPageSurfaceDirectoryRenderer() {
  const source = readFileSync(PAGE_SURFACE_FILE, "utf8");
  const renderer = directoryRendererSource(source);
  const failures: string[] = [];

  if (!renderer) {
    failures.push("PageSurface must keep a dedicated renderDirectorySurface renderer.");
  } else {
    if (!renderer.includes('<PageContent className="py-10">')) {
      failures.push("Directory renderer must preserve the historical py-10 module directory spacing.");
    }
    if (!source.includes("section.surface.kind === \"moduleGrid\"") || !source.includes("centered />")) {
      failures.push("Directory renderer must force moduleGrid centered rendering.");
    }
    if (/\brenderCompleteBody\b|\brenderSectionStack\b|\bDatabasePageFrame\b/.test(renderer)) {
      failures.push("Directory renderer must not use the standard page or section renderer.");
    }
  }

  if (failures.length) {
    console.error("PageSurface directory renderer regression:");
    for (const failure of failures) console.error(`- ${failure}`);
    return false;
  }

  return true;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"))) {
  process.exit(checkPageSurfaceDirectoryRenderer() ? 0 : 1);
}
