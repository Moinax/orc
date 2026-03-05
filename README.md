# @moinax/orc

**O**penAPI **R**est **C**lient generator — generates typed TypeScript API clients from OpenAPI specs with Zod validation.

## Features

- Generates typed TypeScript API clients from OpenAPI 3.x specs
- Zod schemas for all request/response types with full validation
- Resource-based architecture (`client.pets.getList()`, `client.pets.create()`)
- Automatic enum deduplication across schemas
- Pagination handling built-in
- Date transformation schemas (string ↔ Date via date-fns)
- Configurable via `orc.config.ts`
- Supports both URL and local file specs

## Installation

```bash
npm install @moinax/orc zod
```

## Quick Start

### 1. Create a config file

```bash
npx orc init
```

This creates `orc.config.ts`:

```typescript
import { defineConfig } from '@moinax/orc/config';

export default defineConfig({
  clients: [
    {
      name: 'MyApi',
      spec: 'https://api.example.com/openapi.json',
      output: 'src/lib/api/my-api-client',
    },
  ],
});
```

### 2. Generate clients

```bash
npx orc generate
```

### 3. Use the generated client

```typescript
import { MyApiClient } from './src/lib/api/my-api-client/generated';

const client = new MyApiClient('https://api.example.com', {
  getAccessToken: async () => 'your-token',
});

// Typed, validated API calls
const { data, pagination } = await client.pet.getList({ page: 1, limit: 10 });
const pet = await client.pet.getDetail(petId);
const created = await client.pet.create({ name: 'Buddy', species: 'dog' });
```

## CLI

```
orc generate                          # Generate all clients
orc generate --client MyApi           # Generate a specific client
orc generate --client MyApi --spec <url>  # Override spec URL
orc init                              # Scaffold config file
```

## Config Reference

```typescript
import { defineConfig } from '@moinax/orc/config';

export default defineConfig({
  // Optional: customize the import path for the runtime package
  // Defaults to '@moinax/orc'
  runtimePackage: '@moinax/orc',

  clients: [
    {
      // Name used for the generated client class (e.g., MyApiClient)
      name: 'MyApi',

      // URL or local file path to the OpenAPI spec
      spec: 'https://api.example.com/openapi.json',

      // Output directory for generated files
      output: 'src/lib/api/my-api-client',

      // Optional: strip a prefix from all API paths
      // Useful when the spec includes a base path like /public
      stripPathPrefix: '/public',

      // Optional: prefix all generated schema/type/enum names
      // Useful when generating multiple clients to avoid naming collisions
      // e.g., 'Charge' → chargePetSchema, ChargePet, ChargeContractStatus
      schemaPrefix: 'Charge',
    },
  ],
});
```

## Generated Output

For each client, orc generates:

```
output/generated/
├── schemas.ts              # Zod schemas + TypeScript types
├── MyApiClient.ts          # Client class extending Client
├── Resource.ts             # Base resource class
├── index.ts                # Barrel exports
└── resources/
    ├── index.ts            # Resource exports
    ├── Pets.resource.ts    # Resource with typed methods
    └── Owners.resource.ts
```

## Runtime

The package also exports the runtime that generated code depends on:

```typescript
import {
  Client,           // Base HTTP client
  Resource,         // Base resource class
  parseSchema,      // Zod parse with partial fallback
  ClientError,      // HTTP error class
  ParseError,       // Zod validation error class
  // Date transform schemas
  stringToDateSchema,
  stringToDaySchema,
  dateToStringSchema,
  dayToStringSchema,
} from '@moinax/orc';
```

### Client Options

```typescript
const client = new MyApiClient('https://api.example.com', {
  // Async function returning a bearer token
  getAccessToken: async () => token,

  // Custom response handler
  responseHandler: async (response) => response,

  // Logger (defaults to console)
  logger: console,

  // Number of retries for failed GET requests (5xx)
  retries: 3,
});
```

## Development

```bash
npm install
npm test          # Run tests
npm run build     # Build with tsup
npm run typecheck # Type check with tsc
```

## Publishing

```bash
# Bump version (creates commit + git tag)
npm version patch   # 0.1.0 → 0.1.1
npm version minor   # 0.1.0 → 0.2.0
npm version major   # 0.1.0 → 1.0.0

# Publish (prepublishOnly will run the build automatically)
npm publish --access public

# Push commit and tag to remote
git push --follow-tags
```

Note: `--access public` is required for scoped packages (`@moinax/orc`). You must be logged in via `npm login`.

## License

MIT
