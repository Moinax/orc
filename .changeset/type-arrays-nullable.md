---
'@moinax/orc': patch
---

Support JSON Schema 2020-12 / OpenAPI 3.1 type arrays (e.g. `["string", "null"]`). The spec is normalized once at load time, before any generator reads `type`: `[type, "null"]` becomes the OpenAPI 3.0 `nullable` form, a single-type array collapses to its scalar type, and multi-type arrays expand to `anyOf` branches keeping their sibling keywords. Nullable fields no longer fall through to `z.unknown()`. Path and query parameters now honour `anyOf`, `nullable` and `$ref` too (`["integer", "null"]` → `z.number().int().nullable()`, `["string", "number"]` → `z.union([...])`, `anyOf: [{ $ref: Status }, { type: "null" }]` → `statusSchema.nullable()` instead of `z.string()`), enum consts used by a parameter are always imported by the resource, a `null` enum value maps to `.nullable()`, and `null` query values are skipped when building the URL, like `undefined`.
