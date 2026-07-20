# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.0] - 2026-07-20

### Added

- Spec-driven download methods: GET operations declaring a non-JSON success
  content type (e.g. `application/pdf`, `application/octet-stream`) now
  generate a method with an optional `filename` parameter that delegates to
  `client.download(url, filename)`.
- Inline `{ data: [...] }` list responses hoist their item object into a named
  schema and type (e.g. `contractsDocumentsListItemSchema` /
  `ContractsDocumentsListItem`) so consumers can reference the item type
  directly instead of indexing into the response type.

### Changed

- Resource method return types are now inferred from `parseSchema` instead of
  emitted as explicit `Promise<...>` annotations; only untyped passthroughs
  keep an explicit `Promise<unknown>`.
- The leading `get` verb is dropped from generated schema and type names:
  `vehicleListParamsSchema` / `VehicleListParams` instead of
  `getVehicleListParamsSchema` / `GetVehicleListParams`.
- Child-resource constructors use a plain `import type` of the client class
  instead of an inline `InstanceType<typeof import(...)>` expression.

## [0.4.1] - 2026-06-17

### Fixed

- Support zod v4 in the `parseSchema` partial fallback ([#3](https://github.com/Moinax/orc/pull/3)).

## [0.4.0] - 2026-05-06

### Added

- `exclude` option to skip paths from generation.

### Fixed

- POST operations without a `requestBody` no longer generate a `body` parameter.

## [0.3.0] - 2026-04-24

### Fixed

- Enum naming is deferred until all usage contexts are collected, producing
  stable names for enums shared across parameters and schemas.

## [0.2.1] - 2026-04-15

### Added

- `ClientError` now carries the request `url` and `method`; added
  `NetworkError` for transport-level failures ([#2](https://github.com/Moinax/orc/pull/2)).

## [0.2.0] - 2026-03-05

### Added

- `schemaPrefix` option to namespace generated schemas and types ([#1](https://github.com/Moinax/orc/pull/1)).

## [0.1.4] - 2026-03-02

### Changed

- Moved prettier to devDependencies and removed runtime formatting of
  generated output.

## [0.1.3] - 2026-03-02

### Fixed

- Empty strings are filtered from enum values.

## [0.1.2] - 2026-03-02

### Fixed

- Crash on `NullEnum` (`enum: [null]`) schemas produced by drf-spectacular.

## [0.1.1] - 2026-03-02

### Fixed

- `camelCase` treats dots as word separators.

## [0.1.0] - 2026-03-02

### Added

- Initial release of `@moinax/orc` — OpenAPI REST client generator with a
  zod-validated runtime.

[0.5.0]: https://github.com/Moinax/orc/compare/v0.4.1...v0.5.0
[0.4.1]: https://github.com/Moinax/orc/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/Moinax/orc/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/Moinax/orc/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/Moinax/orc/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/Moinax/orc/compare/v0.1.4...v0.2.0
[0.1.4]: https://github.com/Moinax/orc/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/Moinax/orc/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/Moinax/orc/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/Moinax/orc/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/Moinax/orc/commit/e3d64c7
