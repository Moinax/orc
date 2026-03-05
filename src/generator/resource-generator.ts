import { EnumRegistry } from './enum-registry';
import { ZodGenerator } from './zod-generator';
import {
  camelCase,
  pascalCase,
  singularize,
  capitalize,
  schemaConstToTypeName,
  isBooleanLikeEnum,
  getResourcePrefixedParamNames,
  operationIdToMethodName,
  getResourcePath,
  buildPathTree,
  cleanSchemaName,
  OpenAPISchema,
  OpenAPIOperation,
  OpenAPIParameter,
  PathTreeNode,
} from './utils';

interface ResourceResult {
  className: string;
  code: string;
  children: Array<{ propertyName: string; className: string; fileName: string }>;
}

export class ResourceGenerator {
  private schemas: Record<string, OpenAPISchema>;
  private clientClassName: string;
  private stripPathPrefix: string | null;
  public enumRegistry: EnumRegistry;
  private paths: Record<string, Record<string, OpenAPIOperation | OpenAPIParameter[]>>;
  private pathTree: PathTreeNode;
  private generatedResources = new Map<string, ResourceResult>();
  public collectedInlineSchemas = new Map<
    string,
    { schema: OpenAPISchema; isInput: boolean; typeName: string }
  >();
  private currentResourceName: string | null = null;
  private runtimePackage: string;
  private schemaPrefix: string;

  constructor(
    paths: Record<string, Record<string, OpenAPIOperation | OpenAPIParameter[]>> | undefined,
    schemas: Record<string, OpenAPISchema> | undefined,
    clientClassName: string,
    options: {
      stripPathPrefix?: string;
      enumRegistry?: EnumRegistry;
      runtimePackage?: string;
      schemaPrefix?: string;
    } = {},
  ) {
    this.schemas = schemas || {};
    this.clientClassName = clientClassName;
    this.stripPathPrefix = options.stripPathPrefix || null;
    this.enumRegistry = options.enumRegistry || new EnumRegistry();
    this.runtimePackage = options.runtimePackage || '@moinax/orc';
    this.schemaPrefix = options.schemaPrefix || '';

    this.paths = this.stripPathPrefix ? this.stripPrefixFromPaths(paths || {}) : paths || {};
    this.pathTree = buildPathTree(this.paths);
  }

  collectAllInlineSchemas(): Map<string, { schema: OpenAPISchema; isInput: boolean; typeName: string }> {
    this._collectInlineSchemasFromNode(this.pathTree, []);
    return this.collectedInlineSchemas;
  }

  private _collectInlineSchemasFromNode(node: PathTreeNode, parentPath: string[]): void {
    const nodeName = node.name === 'root' ? '' : node.name;
    const currentPath = [...parentPath, nodeName].filter(Boolean);

    const operationMethodNames = new Map<string, string>();
    for (const { pathPattern, httpMethod, operation } of node.operations) {
      const responseSchemaObj = (
        operation.responses?.['200'] || operation.responses?.['201']
      )?.content?.['application/json']?.schema;
      const methodName = operationIdToMethodName(
        operation.operationId,
        httpMethod,
        pathPattern,
        node.name,
        responseSchemaObj,
      );
      const opKey = this.getOperationKey(pathPattern, httpMethod);
      operationMethodNames.set(opKey, methodName);
    }

    const resourceClassName = this.getResourceClassName(currentPath);

    for (const { pathPattern, httpMethod, operation } of node.operations) {
      if (this.hasInlineRequestBody(operation)) {
        const requestSchema = this.getRequestSchemaName(operation, pathPattern);
        if (!requestSchema) {
          const opKey = this.getOperationKey(pathPattern, httpMethod);
          const methodName = operationMethodNames.get(opKey)!;
          const schemaConstName = this.generateInlineSchemaName(resourceClassName, methodName, 'body');

          const bodySchema = operation.requestBody!.content!['application/json']!.schema!;
          const bodyPrefix = this.schemaPrefix ? pascalCase(this.schemaPrefix) : '';
          this.collectedInlineSchemas.set(schemaConstName, {
            schema: bodySchema,
            isInput: true,
            typeName: `${bodyPrefix}${pascalCase(resourceClassName)}${pascalCase(methodName)}Body`,
          });
        }
      }
    }

    for (const { pathPattern, httpMethod, operation } of node.operations) {
      if (this.hasInlineResponseSchema(operation)) {
        const responseSchema = this.getResponseSchemaName(operation, pathPattern);
        if (!responseSchema) {
          const opKey = this.getOperationKey(pathPattern, httpMethod);
          const methodName = operationMethodNames.get(opKey)!;
          const schemaConstName = this.generateInlineSchemaName(resourceClassName, methodName, 'response');

          const successResponse = operation.responses?.['200'] || operation.responses?.['201'];
          const inlineSchema = successResponse!.content!['application/json']!.schema!;
          const responsePrefix = this.schemaPrefix ? pascalCase(this.schemaPrefix) : '';
          this.collectedInlineSchemas.set(schemaConstName, {
            schema: inlineSchema,
            isInput: false,
            typeName: `${responsePrefix}${pascalCase(resourceClassName)}${pascalCase(methodName)}Response`,
          });
        }
      }
    }

    for (const [, childNode] of node.children) {
      this._collectInlineSchemasFromNode(childNode, currentPath);
    }
  }

  private stripPrefixFromPaths(
    paths: Record<string, Record<string, OpenAPIOperation | OpenAPIParameter[]>>,
  ): Record<string, Record<string, OpenAPIOperation | OpenAPIParameter[]>> {
    const result: Record<string, Record<string, OpenAPIOperation | OpenAPIParameter[]>> = {};
    for (const [pathPattern, methods] of Object.entries(paths)) {
      let newPath = pathPattern;
      if (this.stripPathPrefix && pathPattern.startsWith(this.stripPathPrefix)) {
        newPath = pathPattern.slice(this.stripPathPrefix.length) || '/';
      }
      result[newPath] = methods;
    }
    return result;
  }

  private getResponseSchemaName(operation: OpenAPIOperation, pathPattern: string | null = null): string | null {
    const successResponse = operation.responses?.['200'] || operation.responses?.['201'];
    if (!successResponse) return null;

    const content = successResponse.content?.['application/json'];
    if (!content?.schema) return null;

    const schema = content.schema;
    if (schema.$ref) {
      const rawName = schema.$ref.split('/').pop()!;
      return cleanSchemaName(rawName);
    }

    if (schema.type === 'object') {
      if (operation.operationId) {
        const opId = operation.operationId;
        const patterns = [
          /^create[_-]?(.+)$/i,
          /^update[_-]?(.+)$/i,
          /^get[_-]?(.+)$/i,
          /^(.+)[_-]?create$/i,
          /^(.+)[_-]?update$/i,
          /^(.+)[_-]?get$/i,
        ];

        for (const pattern of patterns) {
          const match = opId.match(pattern);
          if (match) {
            const entityName = pascalCase(match[1].replace(/[_-]/g, ' '));
            const schemaSchemaName = `${entityName}Schema`;
            if (this.schemas[entityName] || this.schemas[schemaSchemaName]) {
              return entityName;
            }
          }
        }
      }

      if (pathPattern) {
        const resourcePath = getResourcePath(pathPattern);
        if (resourcePath.length > 0) {
          const lastSegment = resourcePath[resourcePath.length - 1];
          const entityName = pascalCase(singularize(lastSegment));
          const schemaSchemaName = `${entityName}Schema`;
          if (this.schemas[entityName] || this.schemas[schemaSchemaName]) {
            return entityName;
          }
        }
      }
    }

    if (schema.type === 'object' && schema.properties) {
      return null;
    }

    return null;
  }

  private getRequestSchemaName(operation: OpenAPIOperation, pathPattern: string | null = null): string | null {
    const content = operation.requestBody?.content?.['application/json'];
    if (!content?.schema) return null;

    const schema = content.schema;
    if (schema.$ref) {
      const rawName = schema.$ref.split('/').pop()!;
      return cleanSchemaName(rawName);
    }

    return null;
  }

  private hasInlineRequestBody(operation: OpenAPIOperation): boolean {
    const content = operation.requestBody?.content?.['application/json'];
    if (!content?.schema) return false;
    return !content.schema.$ref && content.schema.type === 'object';
  }

  private hasInlineResponseSchema(operation: OpenAPIOperation): boolean {
    const successResponse = operation.responses?.['200'] || operation.responses?.['201'];
    if (!successResponse) return false;

    const content = successResponse.content?.['application/json'];
    if (!content?.schema) return false;

    const schema = content.schema;
    if (schema.$ref) return false;
    if (schema.type === 'object' && schema.properties?.pagination) return false;
    return schema.type === 'object' && !!schema.properties;
  }

  private prefixSchemaConst(name: string): string {
    if (!this.schemaPrefix) return `${camelCase(name)}Schema`;
    return `${camelCase(this.schemaPrefix)}${pascalCase(name)}Schema`;
  }

  private prefixTypeName(name: string): string {
    if (!this.schemaPrefix) return pascalCase(name);
    return `${pascalCase(this.schemaPrefix)}${pascalCase(name)}`;
  }

  private generateInlineSchemaName(resourceName: string, methodName: string, purpose: string): string {
    const prefix = this.schemaPrefix ? camelCase(this.schemaPrefix) : '';
    const baseName = `${prefix}${prefix ? pascalCase(resourceName) : camelCase(resourceName)}${capitalize(methodName)}${capitalize(purpose)}Schema`;
    return camelCase(baseName);
  }

  private getPathParams(operation: OpenAPIOperation): Array<{ name: string; type: string; required: boolean }> {
    return (operation.parameters || [])
      .filter((p): p is OpenAPIParameter => 'in' in p && p.in === 'path')
      .map((p) => ({
        name: p.name,
        type: this.paramTypeToTs(p.schema),
        required: p.required !== false,
      }));
  }

  private getQueryParams(
    operation: OpenAPIOperation,
  ): Array<{ name: string; type: string; required: boolean; schema?: OpenAPISchema }> {
    return (operation.parameters || [])
      .filter((p): p is OpenAPIParameter => 'in' in p && p.in === 'query')
      .map((p) => ({
        name: p.name,
        type: this.paramTypeToTs(p.schema),
        required: p.required === true,
        schema: p.schema,
      }));
  }

  private paramTypeToTs(schema?: OpenAPISchema): string {
    if (!schema) return 'string';
    if (schema.enum) return schema.enum.map((v) => `'${v}'`).join(' | ');
    switch (schema.type) {
      case 'integer':
      case 'number':
        return 'number';
      case 'boolean':
        return 'boolean';
      default:
        return 'string';
    }
  }

  private paramToZod(
    param: { name: string; required: boolean; schema?: OpenAPISchema },
    resourceName?: string,
  ): string {
    const { schema, name: paramName } = param;
    if (!schema) return 'z.string()';

    let zodType: string;
    if (schema.enum) {
      if (isBooleanLikeEnum(schema.enum)) {
        zodType = 'z.boolean()';
      } else {
        const context = {
          source: 'queryParam' as const,
          resourceName: resourceName || this.currentResourceName || undefined,
          paramName: paramName,
        };
        const enumInfo = this.enumRegistry.register(schema.enum, context);
        zodType = enumInfo.schemaConstName;
      }
    } else {
      switch (schema.type) {
        case 'integer':
          zodType = 'z.number().int()';
          break;
        case 'number':
          zodType = 'z.number()';
          break;
        case 'boolean':
          zodType = 'z.boolean()';
          break;
        default:
          zodType = 'z.string()';
      }
    }

    if (!param.required) {
      zodType = `${zodType}.optional()`;
    }

    return zodType;
  }

  private isPaginationParam(paramName: string): boolean {
    return ['page', 'limit', 'orderBy', 'ordering'].includes(paramName);
  }

  private getUniqueMethodName(
    operationId: string | undefined,
    httpMethod: string,
    pathPattern: string,
    usedNames: Set<string>,
    responseSchema?: OpenAPISchema,
  ): string {
    let methodName = operationIdToMethodName(operationId, httpMethod, pathPattern, '', responseSchema);

    if (usedNames.has(methodName) && operationId) {
      methodName = camelCase(operationId);
    }

    let finalName = methodName;
    let counter = 1;
    while (usedNames.has(finalName)) {
      finalName = `${methodName}${counter}`;
      counter++;
    }

    usedNames.add(finalName);
    return finalName;
  }

  private getOperationKey(pathPattern: string, httpMethod: string): string {
    return `${httpMethod}:${pathPattern}`;
  }

  private getResourceClassName(pathSegments: string[]): string {
    return pathSegments.map((seg) => pascalCase(seg)).join('');
  }

  private generateResourceNode(node: PathTreeNode, pathSegments: string[]): ResourceResult {
    const parentImportPath = '../';
    const resourceClassName = this.getResourceClassName(pathSegments);

    this.currentResourceName = resourceClassName;

    const lines: string[] = [];
    const usedMethodNames = new Set<string>();
    const schemaImports = new Set<string>();
    let hasQueryParams = false;
    let hasPaginatedResponse = false;

    const childResources: Array<{ propertyName: string; className: string; fileName: string }> = [];
    for (const [childName, childNode] of node.children) {
      const childPath = [...pathSegments, childName];
      const childClassName = this.getResourceClassName(childPath);
      childResources.push({
        propertyName: singularize(camelCase(childName)),
        className: childClassName,
        fileName: `${childClassName}.resource`,
      });
    }

    const operationMethodNames = new Map<string, string>();
    let usesInlineZod = false;
    for (const { pathPattern, httpMethod, operation } of node.operations) {
      const successResponse = operation.responses?.['200'] || operation.responses?.['201'];
      const responseContent = successResponse?.content?.['application/json'];
      const responseSchemaObj = responseContent?.schema;

      const methodName = this.getUniqueMethodName(
        operation.operationId,
        httpMethod,
        pathPattern,
        usedMethodNames,
        responseSchemaObj,
      );
      const opKey = this.getOperationKey(pathPattern, httpMethod);
      operationMethodNames.set(opKey, methodName);

      const queryParams = this.getQueryParams(operation);
      if (queryParams.length > 0) {
        hasQueryParams = true;
      }

      if (responseSchemaObj?.type === 'object' && responseSchemaObj?.properties?.pagination) {
        hasPaginatedResponse = true;
      }

      if (
        responseSchemaObj?.type === 'object' &&
        responseSchemaObj?.properties?.pagination &&
        !responseSchemaObj?.properties?.data?.items?.$ref
      ) {
        usesInlineZod = true;
      }
    }

    const typeImports = new Map<string, string>();

    if (hasQueryParams) {
      schemaImports.add('paginationParamsSchema');
    }
    if (hasPaginatedResponse) {
      schemaImports.add('paginationResponseSchema');
      typeImports.set('paginationResponseSchema', 'PaginationResponse');
    }

    for (const { pathPattern, operation } of node.operations) {
      const responseSchema = this.getResponseSchemaName(operation, pathPattern);
      if (responseSchema) {
        const schemaConst = this.prefixSchemaConst(responseSchema);
        schemaImports.add(schemaConst);
        typeImports.set(schemaConst, this.prefixTypeName(responseSchema));
      }
      const requestSchema = this.getRequestSchemaName(operation, pathPattern);
      if (requestSchema) {
        const schemaConst = this.prefixSchemaConst(requestSchema);
        schemaImports.add(schemaConst);
        typeImports.set(schemaConst, this.prefixTypeName(requestSchema));
      }
    }

    const inlineBodySchemas = new Map<string, { schemaConst: string; typeName: string }>();
    for (const { pathPattern, httpMethod, operation } of node.operations) {
      if (this.hasInlineRequestBody(operation)) {
        const requestSchema = this.getRequestSchemaName(operation, pathPattern);
        if (!requestSchema) {
          const opKey = this.getOperationKey(pathPattern, httpMethod);
          const methodName = operationMethodNames.get(opKey)!;
          const schemaConstName = this.generateInlineSchemaName(resourceClassName, methodName, 'body');
          const typeName = schemaConstToTypeName(schemaConstName);
          inlineBodySchemas.set(opKey, { schemaConst: schemaConstName, typeName });
          schemaImports.add(schemaConstName);
          typeImports.set(schemaConstName, typeName);
        }
      }
    }

    const inlineResponseSchemas = new Map<string, { schemaConst: string; typeName: string }>();
    for (const { pathPattern, httpMethod, operation } of node.operations) {
      if (this.hasInlineResponseSchema(operation)) {
        const responseSchema = this.getResponseSchemaName(operation, pathPattern);
        if (!responseSchema) {
          const opKey = this.getOperationKey(pathPattern, httpMethod);
          const methodName = operationMethodNames.get(opKey)!;
          const schemaConstName = this.generateInlineSchemaName(resourceClassName, methodName, 'response');
          const typeName = schemaConstToTypeName(schemaConstName);
          inlineResponseSchemas.set(opKey, { schemaConst: schemaConstName, typeName });
          schemaImports.add(schemaConstName);
          typeImports.set(schemaConstName, typeName);
        }
      }
    }

    const needsZod = hasQueryParams || usesInlineZod;
    if (needsZod) {
      lines.push("import { z } from 'zod';");
      lines.push('');
    }

    const hasParsing = node.operations.some(({ httpMethod, operation }) => {
      const successResponse = operation.responses?.['200'] || operation.responses?.['201'];
      const hasResponseParsing = !!successResponse?.content?.['application/json']?.schema;
      const hasBodyParsing = ['post', 'put', 'patch'].includes(httpMethod) && !!operation.requestBody;
      const hasParamsParsing = this.getQueryParams(operation).length > 0;
      return hasResponseParsing || hasBodyParsing || hasParamsParsing;
    });
    if (hasParsing) {
      lines.push(`import { parseSchema } from '${this.runtimePackage}';`);
    }

    lines.push(`import { Resource } from '${parentImportPath}Resource';`);

    const schemaImportPlaceholderIndex = lines.length;
    lines.push('__SCHEMA_IMPORTS_PLACEHOLDER__');

    for (const child of childResources) {
      lines.push(`import { ${child.className}Resource } from './${child.fileName}';`);
    }
    lines.push('');

    const queryParamsSchemas: string[] = [];
    for (const { pathPattern, httpMethod, operation } of node.operations) {
      const queryParams = this.getQueryParams(operation);
      if (queryParams.length > 0) {
        const opKey = this.getOperationKey(pathPattern, httpMethod);
        const methodName = operationMethodNames.get(opKey)!;
        const { schemaConstName, typeName } = getResourcePrefixedParamNames(methodName, resourceClassName, this.schemaPrefix);

        const specificParams = queryParams.filter((p) => !this.isPaginationParam(p.name));

        if (specificParams.length > 0) {
          const props = specificParams.map((p) => {
            const zodCode = this.paramToZod(p, resourceClassName);
            if (p.schema?.enum) {
              const enumInfo = this.enumRegistry.get(p.schema.enum);
              if (enumInfo) {
                schemaImports.add(enumInfo.schemaConstName);
              }
            }
            return `  ${p.name}: ${zodCode}`;
          });
          queryParamsSchemas.push(
            `export const ${schemaConstName} = paginationParamsSchema.extend({\n${props.join(',\n')},\n});`,
          );
        } else {
          queryParamsSchemas.push(`export const ${schemaConstName} = paginationParamsSchema;`);
        }
        queryParamsSchemas.push(`export type ${typeName} = z.input<typeof ${schemaConstName}>;`);
        queryParamsSchemas.push('');
      }
    }

    if (queryParamsSchemas.length > 0) {
      lines.push('// Query parameter schemas');
      lines.push(queryParamsSchemas.join('\n'));
    }

    lines.push(`export class ${resourceClassName}Resource extends Resource {`);

    for (const child of childResources) {
      lines.push(`  public ${child.propertyName}: ${child.className}Resource;`);
    }

    if (childResources.length > 0) {
      lines.push('');
      lines.push(
        `  constructor(client: InstanceType<typeof import('${parentImportPath}${this.clientClassName}').default>) {`,
      );
      lines.push('    super(client);');
      for (const child of childResources) {
        lines.push(`    this.${child.propertyName} = new ${child.className}Resource(client);`);
      }
      lines.push('  }');
    }

    for (const { pathPattern, httpMethod, operation } of node.operations) {
      const opKey = this.getOperationKey(pathPattern, httpMethod);
      const methodName = operationMethodNames.get(opKey)!;
      const pathParams = this.getPathParams(operation);
      const queryParams = this.getQueryParams(operation);
      const responseSchema = this.getResponseSchemaName(operation, pathPattern);
      const requestSchema = this.getRequestSchemaName(operation, pathPattern);

      const params: string[] = [];
      for (const p of pathParams) {
        params.push(`${p.name}: ${p.type}`);
      }

      if (queryParams.length > 0) {
        const { typeName } = getResourcePrefixedParamNames(methodName, resourceClassName, this.schemaPrefix);
        const hasRequired = queryParams.some((p) => p.required);
        params.push(`params${hasRequired ? '' : '?'}: ${typeName}`);
      }

      const inlineBodySchema = inlineBodySchemas.get(opKey);

      if (['post', 'put', 'patch'].includes(httpMethod) && operation.requestBody) {
        if (requestSchema) {
          const schemaConst = this.prefixSchemaConst(requestSchema);
          const typeName = typeImports.get(schemaConst)!;
          params.push(`body: ${typeName}`);
        } else if (inlineBodySchema) {
          params.push(`body: ${inlineBodySchema.typeName}`);
        } else {
          params.push('body: Record<string, unknown>');
        }
      }

      const fullPath = this.stripPathPrefix ? this.stripPathPrefix + pathPattern : pathPattern;
      let pathTemplate = fullPath.replace(/\{(\w+)\}/g, '${$1}');
      pathTemplate = '`' + pathTemplate + '`';

      const successResponse = operation.responses?.['200'] || operation.responses?.['201'];
      const responseContent = successResponse?.content?.['application/json'];
      const responseSchemaObj = responseContent?.schema;

      let returnType = 'void';
      let parseLogic = '';

      if (responseSchemaObj) {
        if (responseSchemaObj.type === 'object' && responseSchemaObj.properties?.pagination) {
          const dataRef = responseSchemaObj.properties.data?.items?.$ref;
          if (dataRef) {
            const rawItemSchema = dataRef.split('/').pop()!;
            const itemSchema = cleanSchemaName(rawItemSchema);
            const itemSchemaConst = this.prefixSchemaConst(itemSchema);
            const itemTypeName = this.prefixTypeName(itemSchema);
            schemaImports.add(itemSchemaConst);
            typeImports.set(itemSchemaConst, itemTypeName);
            returnType = `{ pagination: PaginationResponse; data: ${itemTypeName}[] }`;
            parseLogic = `const schema = z.object({ pagination: paginationResponseSchema, data: z.array(${itemSchemaConst}) }).describe('Paginated${itemTypeName}List');
    return parseSchema(schema, response);`;
          } else {
            if (responseSchema) {
              const itemSchemaConst = this.prefixSchemaConst(responseSchema);
              const itemTypeName = this.prefixTypeName(responseSchema);
              schemaImports.add(itemSchemaConst);
              typeImports.set(itemSchemaConst, itemTypeName);
              returnType = `{ pagination: PaginationResponse; data: ${itemTypeName}[] }`;
              parseLogic = `const schema = z.object({ pagination: paginationResponseSchema, data: z.array(${itemSchemaConst}) }).describe('Paginated${itemTypeName}List');
    return parseSchema(schema, response);`;
            } else {
              returnType = `{ pagination: PaginationResponse; data: unknown[] }`;
              parseLogic = `const schema = z.object({ pagination: paginationResponseSchema, data: z.array(z.unknown()) }).describe('PaginatedList');
    return parseSchema(schema, response);`;
            }
          }
        } else if (responseSchema) {
          const schemaConstName = this.prefixSchemaConst(responseSchema);
          const typeName = this.prefixTypeName(responseSchema);
          returnType = typeName;
          parseLogic = `return parseSchema(${schemaConstName}, response);`;
          schemaImports.add(schemaConstName);
          typeImports.set(schemaConstName, typeName);
        } else if (inlineResponseSchemas.get(opKey)) {
          const inlineSchema = inlineResponseSchemas.get(opKey)!;
          returnType = inlineSchema.typeName;
          parseLogic = `return parseSchema(${inlineSchema.schemaConst}, response);`;
        } else {
          returnType = 'unknown';
          parseLogic = 'return response;';
        }
      }

      lines.push('');
      lines.push(`  async ${methodName}(${params.join(', ')}): Promise<${returnType}> {`);

      if (queryParams.length > 0) {
        const { schemaConstName } = getResourcePrefixedParamNames(methodName, resourceClassName, this.schemaPrefix);
        lines.push(`    const searchParams = new URLSearchParams();`);
        lines.push(`    if (params) {`);
        lines.push(`      const validated = parseSchema(${schemaConstName}, params);`);
        lines.push(`      Object.entries(validated).forEach(([key, value]) => {`);
        lines.push(`        if (value !== undefined) searchParams.set(key, String(value));`);
        lines.push(`      });`);
        lines.push(`    }`);
        lines.push(`    const query = searchParams.toString();`);
        lines.push(`    const url = query ? \`\${${pathTemplate}}?\${query}\` : ${pathTemplate};`);
      }

      const urlVar = queryParams.length > 0 ? 'url' : pathTemplate;
      const needsResponse = returnType !== 'void';
      const responsePrefix = needsResponse ? 'const response = ' : '';

      const hasBodySchema = requestSchema || inlineBodySchema;
      const hasBodyValidation = ['post', 'put', 'patch'].includes(httpMethod) && hasBodySchema;
      const bodyVar = hasBodyValidation ? 'validatedBody' : 'body';

      if (hasBodyValidation) {
        const bodySchemaConst = requestSchema
          ? this.prefixSchemaConst(requestSchema)
          : inlineBodySchema!.schemaConst;
        lines.push(`    const validatedBody = parseSchema(${bodySchemaConst}, body);`);
      }

      switch (httpMethod) {
        case 'get':
          lines.push(`    ${responsePrefix}await this.client.get(${urlVar});`);
          break;
        case 'post':
          lines.push(`    ${responsePrefix}await this.client.post(${urlVar}, ${bodyVar});`);
          break;
        case 'put':
          lines.push(`    ${responsePrefix}await this.client.put(${urlVar}, ${bodyVar});`);
          break;
        case 'patch':
          lines.push(`    ${responsePrefix}await this.client.patch(${urlVar}, ${bodyVar});`);
          break;
        case 'delete':
          lines.push(`    ${responsePrefix}await this.client.delete(${urlVar});`);
          break;
      }

      if (parseLogic) {
        lines.push(`    ${parseLogic}`);
      }

      lines.push('  }');
    }

    lines.push('}');

    const placeholderIndex = lines.findIndex((l) => l === '__SCHEMA_IMPORTS_PLACEHOLDER__');
    if (placeholderIndex >= 0) {
      if (schemaImports.size > 0 || typeImports.size > 0) {
        const allImports = new Set([...schemaImports, ...typeImports.values()]);
        lines[placeholderIndex] = `import { ${Array.from(allImports).join(', ')} } from '${parentImportPath}schemas';`;
      } else {
        lines.splice(placeholderIndex, 1);
      }
    }

    return {
      className: resourceClassName,
      code: lines.join('\n'),
      children: childResources,
    };
  }

  private generateFromTree(
    node: PathTreeNode,
    pathSegments: string[] = [],
    depth = 0,
  ): Array<ResourceResult & { pathSegments: string[] }> {
    const resources: Array<ResourceResult & { pathSegments: string[] }> = [];

    for (const [childName, childNode] of node.children) {
      const childPath = [...pathSegments, childName];
      const childResources = this.generateFromTree(childNode, childPath, depth + 1);
      resources.push(...childResources);
    }

    if (pathSegments.length > 0 && (node.operations.length > 0 || node.children.size > 0)) {
      const resource = this.generateResourceNode(node, pathSegments);
      resources.push({
        pathSegments,
        ...resource,
      });
    }

    return resources;
  }

  generateAll(): {
    resources: Record<string, string>;
    tree: PathTreeNode;
    inlineSchemas: Map<string, { schema: OpenAPISchema; isInput: boolean; typeName: string }>;
  } {
    this.collectAllInlineSchemas();

    const resources = this.generateFromTree(this.pathTree);

    const result: Record<string, string> = {};
    for (const resource of resources) {
      result[resource.className] = resource.code;
    }

    return {
      resources: result,
      tree: this.pathTree,
      inlineSchemas: this.collectedInlineSchemas,
    };
  }
}
