import { describe, it, expect } from 'vitest';
import {
  capitalize,
  camelCase,
  pascalCase,
  singularize,
  schemaConstToTypeName,
  isBooleanLikeEnum,
  getResourcePrefixedParamNames,
  prefixSchemaConst,
  prefixTypeName,
  validateFileName,
  normalizeTypeArrays,
  validateOutputPath,
  isListResponse,
  deriveEntityFromPath,
  isActionWord,
  operationIdToMethodName,
  parsePathSegments,
  getResourcePath,
  buildPathTree,
  cleanSchemaName,
} from '../../src/generator/utils';

describe('capitalize', () => {
  it('capitalizes first letter', () => {
    expect(capitalize('hello')).toBe('Hello');
    expect(capitalize('world')).toBe('World');
  });
});

describe('camelCase', () => {
  it('converts underscore-separated to camelCase', () => {
    expect(camelCase('hello_world')).toBe('helloWorld');
    expect(camelCase('spending_controls')).toBe('spendingControls');
  });

  it('converts dash-separated to camelCase', () => {
    expect(camelCase('hello-world')).toBe('helloWorld');
  });

  it('handles already camelCase', () => {
    expect(camelCase('helloWorld')).toBe('helloWorld');
  });

  it('lowercases first letter', () => {
    expect(camelCase('HelloWorld')).toBe('helloWorld');
  });
});

describe('pascalCase', () => {
  it('converts to PascalCase', () => {
    expect(pascalCase('hello_world')).toBe('HelloWorld');
    expect(pascalCase('spending_controls')).toBe('SpendingControls');
  });
});

describe('singularize', () => {
  it('singularizes simple words', () => {
    expect(singularize('contracts')).toBe('contract');
    expect(singularize('vehicles')).toBe('vehicle');
  });

  it('singularizes compound camelCase words', () => {
    expect(singularize('spendingControls')).toBe('spendingControl');
  });
});

describe('schemaConstToTypeName', () => {
  it('converts schema const to type name', () => {
    expect(schemaConstToTypeName('contractModificationSchema')).toBe('ContractModification');
    expect(schemaConstToTypeName('paginationResponseSchema')).toBe('PaginationResponse');
  });
});

describe('isBooleanLikeEnum', () => {
  it('detects boolean-like enums', () => {
    expect(isBooleanLikeEnum(['true', 'false'])).toBe(true);
    expect(isBooleanLikeEnum(['false', 'true'])).toBe(true);
  });

  it('rejects non-boolean enums', () => {
    expect(isBooleanLikeEnum(['yes', 'no'])).toBe(false);
    expect(isBooleanLikeEnum(['true'])).toBe(false);
    expect(isBooleanLikeEnum(['true', 'false', 'maybe'])).toBe(false);
  });
});

describe('prefixSchemaConst', () => {
  it('returns unprefixed schema const without prefix', () => {
    expect(prefixSchemaConst('Pet')).toBe('petSchema');
    expect(prefixSchemaConst('Pet', undefined)).toBe('petSchema');
    expect(prefixSchemaConst('Pet', '')).toBe('petSchema');
  });

  it('returns prefixed schema const with prefix', () => {
    expect(prefixSchemaConst('Pet', 'Charge')).toBe('chargePetSchema');
    expect(prefixSchemaConst('Owner', 'Charge')).toBe('chargeOwnerSchema');
  });
});

describe('prefixTypeName', () => {
  it('returns unprefixed type name without prefix', () => {
    expect(prefixTypeName('Pet')).toBe('Pet');
    expect(prefixTypeName('Pet', undefined)).toBe('Pet');
  });

  it('returns prefixed type name with prefix', () => {
    expect(prefixTypeName('Pet', 'Charge')).toBe('ChargePet');
    expect(prefixTypeName('Owner', 'Charge')).toBe('ChargeOwner');
  });
});

describe('getResourcePrefixedParamNames', () => {
  it('drops the get verb from get-method names', () => {
    const result = getResourcePrefixedParamNames('getList', 'Vehicles');
    expect(result.schemaConstName).toBe('vehicleListParamsSchema');
    expect(result.typeName).toBe('VehicleListParams');
  });

  it('prefixes non-get methods correctly', () => {
    const result = getResourcePrefixedParamNames('create', 'Vehicles');
    expect(result.schemaConstName).toBe('createVehicleParamsSchema');
    expect(result.typeName).toBe('CreateVehicleParams');
  });

  it('applies schemaPrefix to get methods', () => {
    const result = getResourcePrefixedParamNames('getList', 'Vehicles', 'Charge');
    expect(result.schemaConstName).toBe('chargeVehicleListParamsSchema');
    expect(result.typeName).toBe('ChargeVehicleListParams');
  });

  it('applies schemaPrefix to non-get methods', () => {
    const result = getResourcePrefixedParamNames('create', 'Vehicles', 'Charge');
    expect(result.schemaConstName).toBe('createChargeVehicleParamsSchema');
    expect(result.typeName).toBe('CreateChargeVehicleParams');
  });
});

describe('validateFileName', () => {
  it('accepts valid names', () => {
    expect(() => validateFileName('MyClient', 'test')).not.toThrow();
    expect(() => validateFileName('Resource123', 'test')).not.toThrow();
  });

  it('rejects path traversal', () => {
    expect(() => validateFileName('../etc', 'test')).toThrow();
    expect(() => validateFileName('path/to', 'test')).toThrow();
  });

  it('rejects empty/invalid names', () => {
    expect(() => validateFileName('', 'test')).toThrow();
    expect(() => validateFileName('123abc', 'test')).toThrow();
  });
});

describe('validateOutputPath', () => {
  it('accepts valid paths', () => {
    expect(() => validateOutputPath('src/lib/api')).not.toThrow();
  });

  it('rejects path traversal', () => {
    expect(() => validateOutputPath('../outside')).toThrow();
  });

  it('rejects empty paths', () => {
    expect(() => validateOutputPath('')).toThrow();
  });
});

describe('isListResponse', () => {
  it('detects paginated responses', () => {
    expect(
      isListResponse({
        type: 'object',
        properties: {
          pagination: { type: 'object' },
          data: { type: 'array' },
        },
      }),
    ).toBe(true);
  });

  it('detects array responses', () => {
    expect(isListResponse({ type: 'array' })).toBe(true);
  });

  it('detects data array responses', () => {
    expect(
      isListResponse({
        type: 'object',
        properties: { data: { type: 'array' } },
      }),
    ).toBe(true);
  });

  it('rejects non-list responses', () => {
    expect(isListResponse({ type: 'object', properties: { id: { type: 'string' } } })).toBe(false);
    expect(isListResponse(undefined)).toBe(false);
  });
});

describe('operationIdToMethodName', () => {
  it('maps GET list to getList', () => {
    expect(
      operationIdToMethodName('listPets', 'get', '/pets', 'Pets', {
        type: 'object',
        properties: { pagination: { type: 'object' }, data: { type: 'array' } },
      }),
    ).toBe('getList');
  });

  it('maps GET detail to getDetail', () => {
    expect(
      operationIdToMethodName('getPet', 'get', '/pets/{id}', 'Pets', {
        type: 'object',
        properties: { id: { type: 'string' } },
      }),
    ).toBe('getDetail');
  });

  it('maps POST to create', () => {
    expect(operationIdToMethodName('createPet', 'post', '/pets', 'Pets', undefined)).toBe('create');
  });

  it('maps PATCH to update', () => {
    expect(operationIdToMethodName('updatePet', 'patch', '/pets/{id}', 'Pets', undefined)).toBe('update');
  });

  it('maps DELETE to delete', () => {
    expect(operationIdToMethodName('deletePet', 'delete', '/pets/{id}', 'Pets', undefined)).toBe('delete');
  });
});

describe('parsePathSegments', () => {
  it('parses path segments', () => {
    const segments = parsePathSegments('/pets/{id}/vaccinations');
    expect(segments).toEqual([
      { name: 'pets', isParam: false, raw: 'pets' },
      { name: 'id', isParam: true, raw: '{id}' },
      { name: 'vaccinations', isParam: false, raw: 'vaccinations' },
    ]);
  });
});

describe('getResourcePath', () => {
  it('extracts resource path', () => {
    expect(getResourcePath('/pets/{id}/vaccinations')).toEqual(['pets', 'vaccinations']);
    expect(getResourcePath('/pets/{id}')).toEqual(['pets']);
  });
});

describe('buildPathTree', () => {
  it('builds a tree from paths', () => {
    const paths = {
      '/pets': {
        get: { operationId: 'listPets', responses: {} },
      },
      '/pets/{id}': {
        get: { operationId: 'getPet', parameters: [{ name: 'id', in: 'path' }], responses: {} },
      },
    };
    const tree = buildPathTree(paths as any);
    expect(tree.children.has('pets')).toBe(true);
    expect(tree.children.get('pets')!.operations.length).toBe(2);
  });
});

describe('cleanSchemaName', () => {
  it('removes Schema suffix', () => {
    expect(cleanSchemaName('PetSchema')).toBe('Pet');
  });

  it('converts SchemaInput to Input', () => {
    expect(cleanSchemaName('PetSchemaInput')).toBe('PetInput');
  });

  it('handles Python module paths', () => {
    expect(cleanSchemaName('mbrella_charge__components__reports__ClassName')).toBe('ClassName');
  });

  it('removes trailing underscores', () => {
    expect(cleanSchemaName('PaginatedResult_VehiclesResult_')).toBe('PaginatedResultVehiclesResult');
  });
});

describe('deriveEntityFromPath', () => {
  it('derives entity from path', () => {
    expect(deriveEntityFromPath('/organisations/{id}/spending_controls')).toBe('SpendingControls');
  });

  it('includes parent context when requested', () => {
    expect(deriveEntityFromPath('/organisations/{id}/sessions', true)).toBe('OrganisationSessions');
  });
});

describe('isActionWord', () => {
  it('identifies action words', () => {
    expect(isActionWord('status')).toBe(true);
    expect(isActionWord('approve')).toBe(true);
  });

  it('identifies sub-resources (plural)', () => {
    expect(isActionWord('sessions')).toBe(false);
    expect(isActionWord('vehicles')).toBe(false);
  });
});

describe('normalizeTypeArrays', () => {
  it('turns [type, null] into the nullable form', () => {
    expect(normalizeTypeArrays({ type: ['string', 'null'] })).toEqual({ type: 'string', nullable: true });
    expect(normalizeTypeArrays({ type: ['integer', 'null'], minimum: 0 })).toEqual({
      type: 'integer',
      minimum: 0,
      nullable: true,
    });
  });

  it('collapses a single-type array to its scalar type', () => {
    expect(normalizeTypeArrays({ type: ['string'] })).toEqual({ type: 'string' });
    expect(normalizeTypeArrays({ type: ['null'] })).toEqual({ type: 'null' });
  });

  it('expands multi-type arrays to anyOf branches keeping sibling keywords', () => {
    expect(normalizeTypeArrays({ type: ['string', 'number'], description: 'id' })).toEqual({
      description: 'id',
      anyOf: [
        { type: 'string', description: 'id' },
        { type: 'number', description: 'id' },
      ],
    });
    expect(normalizeTypeArrays({ type: ['string', 'number', 'null'] })).toEqual({
      anyOf: [{ type: 'string' }, { type: 'number' }, { type: 'null' }],
    });
  });

  it('walks the whole spec: properties, items, parameters and responses', () => {
    const spec = {
      paths: {
        '/things': {
          get: {
            parameters: [{ name: 'limit', in: 'query', schema: { type: ['integer', 'null'] } }],
            responses: {
              '200': {
                content: { 'application/json': { schema: { type: ['object', 'null'], properties: {} } } },
              },
            },
          },
        },
      },
      components: {
        schemas: {
          Thing: {
            type: 'object',
            required: ['id', 'tags'],
            properties: {
              id: { type: ['string', 'null'], format: 'uuid' },
              tags: { type: 'array', items: { type: ['string', 'null'] } },
              kind: { type: 'string', enum: ['a', 'b'] },
            },
          },
        },
      },
    };
    expect(normalizeTypeArrays(spec)).toEqual({
      paths: {
        '/things': {
          get: {
            parameters: [{ name: 'limit', in: 'query', schema: { type: 'integer', nullable: true } }],
            responses: {
              '200': {
                content: { 'application/json': { schema: { type: 'object', nullable: true, properties: {} } } },
              },
            },
          },
        },
      },
      components: {
        schemas: {
          Thing: {
            type: 'object',
            required: ['id', 'tags'],
            properties: {
              id: { type: 'string', format: 'uuid', nullable: true },
              tags: { type: 'array', items: { type: 'string', nullable: true } },
              kind: { type: 'string', enum: ['a', 'b'] },
            },
          },
        },
      },
    });
  });

  it('keeps the type-independent keywords on the null branch too', () => {
    expect(normalizeTypeArrays({ type: ['string', 'number', 'null'], description: 'd' })).toEqual({
      description: 'd',
      anyOf: [
        { type: 'string', description: 'd' },
        { type: 'number', description: 'd' },
        { type: 'null', description: 'd' },
      ],
    });
  });

  it('narrows enum values to each branch type and drops empty branches', () => {
    expect(normalizeTypeArrays({ type: ['string', 'number'], enum: ['a', 1] })).toEqual({
      anyOf: [
        { type: 'string', enum: ['a'] },
        { type: 'number', enum: [1] },
      ],
    });
    expect(normalizeTypeArrays({ type: ['string', 'number'], enum: ['a', 'b'] })).toEqual({
      type: 'string',
      enum: ['a', 'b'],
    });
  });

  it('degrades a schema admitting no value to null instead of an empty union', () => {
    expect(normalizeTypeArrays({ type: [], description: 'd' })).toEqual({ type: 'null', description: 'd' });
    expect(normalizeTypeArrays({ type: ['string', 'number'], enum: [true, false] })).toEqual({ type: 'null' });
  });

  it('does not rewrite data values: example, examples, default, const, enum, vendor extensions', () => {
    const data = { type: ['a', 'b'] };
    const spec = {
      type: 'object',
      example: data,
      examples: [data],
      default: data,
      const: data,
      'x-vendor': data,
      properties: { kind: { type: 'string', enum: ['x'] } },
    };
    expect(normalizeTypeArrays(spec)).toEqual(spec);
  });

  it('still rewrites schemas whose field or component name is a data keyword', () => {
    const nullableBool = { type: ['boolean', 'null'] };
    const spec = {
      components: {
        schemas: {
          default: {
            type: 'object',
            properties: { default: nullableBool, enum: nullableBool, 'x-flag': nullableBool },
          },
        },
      },
    };
    const normalized = { type: 'boolean', nullable: true };
    expect(normalizeTypeArrays(spec)).toEqual({
      components: {
        schemas: {
          default: {
            type: 'object',
            properties: { default: normalized, enum: normalized, 'x-flag': normalized },
          },
        },
      },
    });
  });

  it('leaves specs without type arrays untouched', () => {
    const spec = { type: 'object', properties: { type: { type: 'string' } }, required: ['type'] };
    expect(normalizeTypeArrays(spec)).toEqual(spec);
  });
});
