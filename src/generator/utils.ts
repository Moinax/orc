import pluralizeLib from 'pluralize';

export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function camelCase(str: string): string {
  const result = str
    .replace(/[-_.]+/g, '_')
    .replace(/_([a-zA-Z])/g, (_, char) => char.toUpperCase())
    .replace(/_+/g, '');

  return result.charAt(0).toLowerCase() + result.slice(1);
}

export function pascalCase(str: string): string {
  return capitalize(camelCase(str));
}

export function schemaConstToTypeName(schemaConstName: string): string {
  const withoutSuffix = schemaConstName.replace(/Schema$/, '');
  return pascalCase(withoutSuffix);
}

export function singularize(str: string): string {
  const match = str.match(/^(.*)([A-Z][a-z]+s)$/);
  if (match) {
    const prefix = match[1];
    const lastWord = match[2];
    return prefix + pluralizeLib.singular(lastWord);
  }
  return pluralizeLib.singular(str);
}

export function isBooleanLikeEnum(values: unknown[]): boolean {
  if (!Array.isArray(values) || values.length !== 2) return false;
  const sorted = [...values].sort();
  return sorted[0] === 'false' && sorted[1] === 'true';
}

export function prefixSchemaConst(name: string, schemaPrefix?: string): string {
  if (!schemaPrefix) return `${camelCase(name)}Schema`;
  return `${camelCase(schemaPrefix)}${pascalCase(name)}Schema`;
}

export function prefixTypeName(name: string, schemaPrefix?: string): string {
  if (!schemaPrefix) return pascalCase(name);
  return `${pascalCase(schemaPrefix)}${pascalCase(name)}`;
}

export function getResourcePrefixedParamNames(
  methodName: string,
  resourceClassName: string,
  schemaPrefix?: string,
): { schemaConstName: string; typeName: string } {
  const singularResource = singularize(resourceClassName);
  const prefix = schemaPrefix ? pascalCase(schemaPrefix) : '';

  if (methodName.startsWith('get')) {
    const rest = methodName.slice(3);
    return {
      schemaConstName: `get${prefix}${singularResource}${rest}ParamsSchema`,
      typeName: `Get${prefix}${singularResource}${rest}Params`,
    };
  }

  return {
    schemaConstName: `${camelCase(methodName)}${prefix}${singularResource}ParamsSchema`,
    typeName: `${pascalCase(methodName)}${prefix}${singularResource}Params`,
  };
}

export function validateFileName(name: string, context: string): void {
  if (!name || typeof name !== 'string') {
    throw new Error(`Invalid ${context}: must be a non-empty string`);
  }
  if (name.includes('..') || name.includes('/') || name.includes('\\')) {
    throw new Error(`Invalid ${context}: contains path traversal characters`);
  }
  if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(name)) {
    throw new Error(`Invalid ${context}: must be alphanumeric starting with a letter`);
  }
}

export function validateOutputPath(outputPath: string): void {
  if (!outputPath || typeof outputPath !== 'string') {
    throw new Error('Invalid output path: must be a non-empty string');
  }
  if (outputPath.includes('..')) {
    throw new Error('Invalid output path: contains path traversal characters');
  }
}

export interface OpenAPISchema {
  type?: string;
  format?: string;
  enum?: (string | null)[];
  const?: unknown;
  nullable?: boolean;
  $ref?: string;
  anyOf?: OpenAPISchema[];
  oneOf?: OpenAPISchema[];
  allOf?: OpenAPISchema[];
  items?: OpenAPISchema;
  properties?: Record<string, OpenAPISchema>;
  additionalProperties?: boolean | OpenAPISchema;
  required?: string[];
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  minimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
  description?: string;
}

export interface OpenAPIParameter {
  name: string;
  in: string;
  required?: boolean;
  schema?: OpenAPISchema;
}

export interface OpenAPIOperation {
  operationId?: string;
  summary?: string;
  tags?: string[];
  parameters?: OpenAPIParameter[];
  requestBody?: {
    content?: {
      'application/json'?: {
        schema?: OpenAPISchema;
      };
    };
  };
  responses?: Record<
    string,
    {
      content?: {
        'application/json'?: {
          schema?: OpenAPISchema;
        };
      };
    }
  >;
}

export interface OpenAPISpec {
  openapi: string;
  info: { title: string; version?: string };
  paths: Record<string, Record<string, OpenAPIOperation | OpenAPIParameter[]>>;
  components?: {
    schemas?: Record<string, OpenAPISchema>;
  };
}

export interface PathSegment {
  name: string;
  isParam: boolean;
  raw: string;
}

export function isListResponse(responseSchema: OpenAPISchema | undefined): boolean {
  if (!responseSchema) return false;

  if (responseSchema.type === 'object' && responseSchema.properties?.pagination) {
    return true;
  }
  if (responseSchema.type === 'array') {
    return true;
  }
  if (responseSchema.type === 'object' && responseSchema.properties) {
    for (const arrayProp of ['data', 'items', 'results']) {
      const prop = responseSchema.properties[arrayProp];
      if (prop?.type === 'array') return true;
    }
  }
  if (responseSchema.$ref) {
    const refName = responseSchema.$ref.split('/').pop()!;
    if (refName.includes('Paginated') || refName.includes('List')) {
      return true;
    }
  }
  return false;
}

export function deriveEntityFromPath(pathPattern: string, includeParentContext = false): string | null {
  const segments = pathPattern.split('/').filter((seg) => seg && !seg.startsWith('{'));
  if (segments.length === 0) return null;

  if (includeParentContext && segments.length >= 2) {
    const parentSegment = segments[segments.length - 2];
    const lastSegment = segments[segments.length - 1];
    const singularParent = parentSegment.endsWith('s') ? parentSegment.slice(0, -1) : parentSegment;
    return pascalCase(singularParent) + pascalCase(lastSegment);
  }

  const lastSegment = segments[segments.length - 1];
  return pascalCase(lastSegment);
}

export function isActionWord(word: string): boolean {
  const knownActions = ['status', 'approve', 'cancel', 'current', 'download_link', 'preferences'];
  if (knownActions.includes(word.toLowerCase())) return true;
  if (word.endsWith('s') && !word.endsWith('ss') && !word.endsWith('us')) {
    return false;
  }
  return true;
}

export function operationIdToMethodName(
  operationId: string | undefined,
  httpMethod: string,
  pathPattern: string,
  resourceName: string,
  responseSchema: OpenAPISchema | undefined,
): string {
  const isList = isListResponse(responseSchema);

  switch (httpMethod) {
    case 'get':
      return isList ? 'getList' : 'getDetail';
    case 'post':
      return 'create';
    case 'put':
      return 'replace';
    case 'patch':
      return 'update';
    case 'delete':
      return 'delete';
    default:
      return operationId ? camelCase(operationId) : httpMethod;
  }
}

export function parsePathSegments(pathPattern: string): PathSegment[] {
  return pathPattern
    .split('/')
    .filter((seg) => seg)
    .map((seg) => ({
      name: seg.startsWith('{') ? seg.slice(1, -1) : seg,
      isParam: seg.startsWith('{'),
      raw: seg,
    }));
}

export function getResourcePath(pathPattern: string): string[] {
  const segments = parsePathSegments(pathPattern);
  const resourcePath: string[] = [];
  for (const seg of segments) {
    if (!seg.isParam) {
      resourcePath.push(seg.name);
    }
  }
  return resourcePath;
}

export interface PathTreeNode {
  name: string;
  children: Map<string, PathTreeNode>;
  operations: Array<{
    pathPattern: string;
    httpMethod: string;
    operation: OpenAPIOperation;
  }>;
}

export function buildPathTree(paths: Record<string, Record<string, OpenAPIOperation | OpenAPIParameter[]>>): PathTreeNode {
  const tree: PathTreeNode = {
    name: 'root',
    children: new Map(),
    operations: [],
  };

  for (const [pathPattern, methods] of Object.entries(paths)) {
    for (const [httpMethod, operation] of Object.entries(methods)) {
      if (httpMethod === 'parameters') continue;

      const resourcePath = getResourcePath(pathPattern);

      let current = tree;
      for (const segment of resourcePath) {
        if (!current.children.has(segment)) {
          current.children.set(segment, {
            name: segment,
            children: new Map(),
            operations: [],
          });
        }
        current = current.children.get(segment)!;
      }

      current.operations.push({
        pathPattern,
        httpMethod,
        operation: operation as OpenAPIOperation,
      });
    }
  }

  return tree;
}

export function cleanSchemaName(name: string): string {
  if (name.endsWith('SchemaInput')) {
    name = name.replace('SchemaInput', 'Input');
  } else if (name.endsWith('Schema')) {
    name = name.replace('Schema', '');
  }

  if (name.includes('__')) {
    const parts = name.split('__');
    name = parts[parts.length - 1];
  }

  name = name.replace(/_+$/, '');
  name = name.replace(/_([A-Za-z])/g, (_, char) => char.toUpperCase());

  return name;
}
