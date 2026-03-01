import { describe, it, expect } from 'vitest';
import {
  capitalize,
  camelCase,
  pascalCase,
  singularize,
  schemaConstToTypeName,
  isBooleanLikeEnum,
  getResourcePrefixedParamNames,
  validateFileName,
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

describe('getResourcePrefixedParamNames', () => {
  it('prefixes get methods correctly', () => {
    const result = getResourcePrefixedParamNames('getList', 'Vehicles');
    expect(result.schemaConstName).toBe('getVehicleListParamsSchema');
    expect(result.typeName).toBe('GetVehicleListParams');
  });

  it('prefixes non-get methods correctly', () => {
    const result = getResourcePrefixedParamNames('create', 'Vehicles');
    expect(result.schemaConstName).toBe('createVehicleParamsSchema');
    expect(result.typeName).toBe('CreateVehicleParams');
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
