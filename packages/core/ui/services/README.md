# Core UI Services

Services are non-visual Core UI APIs, such as feedback and confirmation flows.

Rules:

- Services may be command-style APIs when a pure declaration would be awkward.
- Services do not own page layout or visual renderer protocols.
- Services should stay separate from Surface declarations and Internal renderers.

Current status: feedback service/provider code lives here. The root `FeedbackProvider.tsx` file is a compatibility re-export shim while imports are migrated.
