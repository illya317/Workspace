type GuardSectionSpec = {
  key: string | number;
  header?: object;
  body: GuardBodySpec;
};

type GuardBodySpec = {
  kind: string;
  description?: unknown;
  layout?: string;
  master?: { body: GuardBodySpec; mobileBody?: GuardBodySpec };
  detail?: GuardBodySpec;
  sections?: GuardSectionSpec[];
  modals?: { key: string | number; sections: GuardSectionSpec[] }[];
};

export function assertNoSurfaceExplanatoryText(body: GuardBodySpec, path = "body") {
  if (body.kind !== "section") return;
  if ("description" in body && body.description != null) {
    throw new Error(`${path}.description is not allowed on BodySurface/PageSurface sections.`);
  }
  if (body.layout === "split") {
    for (const child of [body.master?.body, body.master?.mobileBody, body.detail]) {
      if (child) assertNoSurfaceExplanatoryText(child, path);
    }
    return;
  }
  for (const section of body.sections ?? []) {
    if (hasSubtitle(section.header)) {
      throw new Error(`${path}.sections[${section.key}].header.subtitle is not allowed on BodySurface/PageSurface sections.`);
    }
    assertNoSurfaceExplanatoryText(section.body, `${path}.sections[${section.key}].body`);
  }
  for (const modal of body.modals ?? []) {
    for (const section of modal.sections) {
      if (hasSubtitle(section.header)) {
        throw new Error(`${path}.modals[${modal.key}].sections[${section.key}].header.subtitle is not allowed on BodySurface/PageSurface sections.`);
      }
      assertNoSurfaceExplanatoryText(section.body, `${path}.modals[${modal.key}].sections[${section.key}].body`);
    }
  }
}

function hasSubtitle(header: object | undefined) {
  return Boolean(header && "subtitle" in header && header.subtitle != null);
}
