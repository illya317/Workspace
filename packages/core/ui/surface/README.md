# Core UI Surface

Surface is the declaration layer. Business packages may import Surface types and declaration objects from this layer once the migration starts.

Rules:

- Surface files describe UI intent and structure.
- Surface files do not render React nodes directly.
- Surface declarations stay small and delegate detailed protocols to the owning surface.
- Page surface owns page shell declarations only; form, data, document, visualization, block, and selection protocols belong to their own surfaces.

Current status: Surface declaration types live here. The root `packages/core/ui/*.types.ts` files are compatibility re-export shims while imports are migrated.
