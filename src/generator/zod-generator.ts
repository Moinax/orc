import { EnumRegistry, EnumContext } from './enum-registry';
import { camelCase, pascalCase, isBooleanLikeEnum, cleanSchemaName, OpenAPISchema } from './utils';

export interface UsedDateSchemas {
  stringToDateSchema: boolean;
  stringToDaySchema: boolean;
  dateToStringSchema: boolean;
  dayToStringSchema: boolean;
}

export class ZodGenerator {
  private schemas: Record<string, OpenAPISchema>;
  private generatedSchemas = new Map<string, string>();
  private schemaOrder: string[] = [];
  private inlineSchemas = new Map<string, { schema: OpenAPISchema; isInput: boolean; typeName: string }>();
  public enumRegistry: EnumRegistry;
  public usedDateSchemas: UsedDateSchemas = {
    stringToDateSchema: false,
    stringToDaySchema: false,
    dateToStringSchema: false,
    dayToStringSchema: false,
  };
  private currentSchemaName: string | null = null;
  private currentPropertyPath: string | null = null;

  private schemaPrefix: string;

  constructor(schemas?: Record<string, OpenAPISchema>, enumRegistry?: EnumRegistry, schemaPrefix?: string) {
    this.schemas = schemas || {};
    this.enumRegistry = enumRegistry || new EnumRegistry();
    this.schemaPrefix = schemaPrefix || '';
  }

  addInlineSchemas(inlineSchemas: Map<string, { schema: OpenAPISchema; isInput: boolean; typeName: string }>): void {
    this.inlineSchemas = inlineSchemas;
  }

  convertSchema(schema: OpenAPISchema | undefined, schemaName: string | null = null, isTopLevel = false): string {
    if (!schema) return 'z.unknown()';

    if (schema.$ref) {
      const refName = schema.$ref.split('/').pop()!;
      const cleanedName = cleanSchemaName(refName);
      const prefixedName = this.schemaPrefix ? camelCase(this.schemaPrefix) + pascalCase(cleanedName) : cleanedName;
      return `${camelCase(prefixedName)}Schema`;
    }

    if (schema.anyOf) {
      const options = schema.anyOf.map((s) => this.convertSchema(s, schemaName));
      if (options.length === 2 && options.includes('z.null()')) {
        const nonNull = options.find((o) => o !== 'z.null()');
        const isInputSchema =
          schemaName &&
          (schemaName.includes('Input') || schemaName.includes('Create') || schemaName.includes('Update'));
        return isInputSchema ? `${nonNull}.nullish()` : `${nonNull}.nullable()`;
      }
      return `z.union([${options.join(', ')}])`;
    }

    if (schema.oneOf) {
      if (schema.oneOf.length === 2) {
        const nullIdx = schema.oneOf.findIndex((s) => this.isNullSchema(s));
        if (nullIdx !== -1) {
          const nonNull = this.convertSchema(schema.oneOf[1 - nullIdx], schemaName);
          const isInputSchema =
            schemaName &&
            (schemaName.includes('Input') || schemaName.includes('Create') || schemaName.includes('Update'));
          return isInputSchema ? `${nonNull}.nullish()` : `${nonNull}.nullable()`;
        }
      }
      const options = schema.oneOf.map((s) => this.convertSchema(s, schemaName));
      return `z.union([${options.join(', ')}])`;
    }

    if (schema.allOf) {
      const schemas = schema.allOf.map((s) => this.convertSchema(s, schemaName));
      if (schemas.length === 1) return schemas[0];
      return schemas.reduce((acc, s) => `${acc}.merge(${s})`);
    }

    if (schema.const !== undefined) {
      if (typeof schema.const === 'string') {
        return `z.literal('${schema.const}')`;
      }
      return `z.literal(${JSON.stringify(schema.const)})`;
    }

    const isNullable = schema.nullable === true;
    let zodSchema: string;

    switch (schema.type) {
      case 'string':
        zodSchema = this.convertStringSchema(schema, schemaName);
        break;
      case 'number':
      case 'integer':
        zodSchema = this.convertNumberSchema(schema, schemaName);
        break;
      case 'boolean':
        zodSchema = 'z.boolean()';
        break;
      case 'array':
        zodSchema = this.convertArraySchema(schema, schemaName);
        break;
      case 'object':
        zodSchema = this.convertObjectSchema(schema, schemaName);
        break;
      case 'null':
        return 'z.null()';
      default:
        if (schema.enum) {
          zodSchema = this.convertEnumSchema(schema, schemaName);
        } else if (schema.properties) {
          zodSchema = this.convertObjectSchema(schema, schemaName);
        } else {
          zodSchema = 'z.unknown()';
        }
    }

    if (isNullable) {
      const isInputSchema =
        schemaName && (schemaName.includes('Input') || schemaName.includes('Create') || schemaName.includes('Update'));
      zodSchema = isInputSchema ? `${zodSchema}.nullish()` : `${zodSchema}.nullable()`;
    }

    return zodSchema;
  }

  private isNullSchema(schema: OpenAPISchema): boolean {
    if (schema.type === 'null') return true;
    if (schema.enum && schema.enum.length === 1 && schema.enum[0] === null) return true;
    if (schema.$ref) {
      const refName = schema.$ref.split('/').pop()!;
      const resolved = this.schemas[refName];
      if (resolved) return this.isNullSchema(resolved);
    }
    return false;
  }

  private convertStringSchema(schema: OpenAPISchema, schemaName: string | null = null): string {
    if (schema.enum) {
      return this.convertEnumSchema(schema, schemaName);
    }

    if (schema.format === 'date-time' || schema.format === 'date') {
      const isInputSchema =
        schemaName && (schemaName.includes('Input') || schemaName.includes('Create') || schemaName.includes('Update'));
      const isDateTime = schema.format === 'date-time';

      if (isInputSchema) {
        if (isDateTime) {
          this.usedDateSchemas.dateToStringSchema = true;
          return 'dateToStringSchema';
        } else {
          this.usedDateSchemas.dayToStringSchema = true;
          return 'dayToStringSchema';
        }
      }
      if (isDateTime) {
        this.usedDateSchemas.stringToDateSchema = true;
        return 'stringToDateSchema';
      } else {
        this.usedDateSchemas.stringToDaySchema = true;
        return 'stringToDaySchema';
      }
    }

    let zod = 'z.string()';
    if (schema.format === 'uuid') {
      zod = 'z.string().uuid()';
    } else if (schema.format === 'email') {
      zod = 'z.string().email()';
    } else if (schema.format === 'uri') {
      zod = 'z.string().url()';
    }

    if (schema.minLength !== undefined) {
      zod = `${zod}.min(${schema.minLength})`;
    }
    if (schema.maxLength !== undefined) {
      zod = `${zod}.max(${schema.maxLength})`;
    }
    if (schema.pattern && !schema.format) {
      zod = `${zod}.regex(/${schema.pattern}/)`;
    }

    return zod;
  }

  private convertNumberSchema(schema: OpenAPISchema, schemaName: string | null = null): string {
    const isInputSchema =
      schemaName &&
      (schemaName.includes('Input') ||
        schemaName.includes('Body') ||
        schemaName.includes('Params') ||
        schemaName === 'InlineInput');
    const baseType = isInputSchema ? 'z.coerce.number()' : 'z.number()';
    let zod = schema.type === 'integer' ? `${baseType}.int()` : baseType;

    if (schema.minimum !== undefined) {
      zod = `${zod}.min(${schema.minimum})`;
    }
    if (schema.maximum !== undefined) {
      zod = `${zod}.max(${schema.maximum})`;
    }

    return zod;
  }

  private convertArraySchema(schema: OpenAPISchema, schemaName: string | null = null): string {
    const itemSchema = schema.items ? this.convertSchema(schema.items, schemaName) : 'z.unknown()';
    let zod = `z.array(${itemSchema})`;

    if (schema.minItems !== undefined) {
      zod = `${zod}.min(${schema.minItems})`;
    }
    if (schema.maxItems !== undefined) {
      zod = `${zod}.max(${schema.maxItems})`;
    }

    return zod;
  }

  private convertObjectSchema(schema: OpenAPISchema, schemaName: string | null = null): string {
    if (!schema.properties || Object.keys(schema.properties).length === 0) {
      if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
        const valueSchema = this.convertSchema(schema.additionalProperties as OpenAPISchema, schemaName);
        return `z.record(z.string(), ${valueSchema})`;
      }
      return 'z.object({})';
    }

    const required = new Set(schema.required || []);
    const properties: string[] = [];

    for (const [propName, propSchema] of Object.entries(schema.properties)) {
      const previousPropertyPath = this.currentPropertyPath;
      this.currentPropertyPath = previousPropertyPath ? `${previousPropertyPath}.${propName}` : propName;

      const propZod = this.convertSchema(propSchema, schemaName);
      const isRequired = required.has(propName);
      const finalProp = isRequired ? propZod : `${propZod}.optional()`;
      properties.push(`  ${propName}: ${finalProp}`);

      this.currentPropertyPath = previousPropertyPath;
    }

    let zod = `z.object({\n${properties.join(',\n')}\n})`;

    if (schema.additionalProperties === false) {
      zod = `${zod}.strict()`;
    }

    return zod;
  }

  private convertEnumSchema(schema: OpenAPISchema, schemaName: string | null = null): string {
    const rawValues = schema.enum!;
    const hasNull = rawValues.some((v) => v === null);
    const values = rawValues.filter((v): v is string => v !== null && v !== '');

    if (values.length === 0) {
      if (hasNull) return 'z.null()';
      // Enum with only empty string(s) — treat as z.literal('')
      return "z.literal('')";
    }

    if (isBooleanLikeEnum(values)) {
      return hasNull ? 'z.boolean().nullable()' : 'z.boolean()';
    }

    const context: EnumContext = {
      source: 'schema',
      schemaName: this.currentSchemaName || schemaName || undefined,
      propertyPath: this.currentPropertyPath || undefined,
    };

    const enumInfo = this.enumRegistry.register(values, context);
    return hasNull ? `${enumInfo.schemaConstName}.nullable()` : enumInfo.schemaConstName;
  }

  private extractDependencies(schema: OpenAPISchema | undefined): Set<string> {
    const deps = new Set<string>();
    if (!schema) return deps;

    if (schema.$ref) {
      const refName = schema.$ref.split('/').pop()!;
      deps.add(refName);
      return deps;
    }

    if (schema.anyOf) {
      for (const s of schema.anyOf) {
        for (const dep of this.extractDependencies(s)) {
          deps.add(dep);
        }
      }
    }

    if (schema.oneOf) {
      for (const s of schema.oneOf) {
        for (const dep of this.extractDependencies(s)) {
          deps.add(dep);
        }
      }
    }

    if (schema.allOf) {
      for (const s of schema.allOf) {
        for (const dep of this.extractDependencies(s)) {
          deps.add(dep);
        }
      }
    }

    if (schema.items) {
      for (const dep of this.extractDependencies(schema.items)) {
        deps.add(dep);
      }
    }

    if (schema.properties) {
      for (const propSchema of Object.values(schema.properties)) {
        for (const dep of this.extractDependencies(propSchema)) {
          deps.add(dep);
        }
      }
    }

    if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
      for (const dep of this.extractDependencies(schema.additionalProperties as OpenAPISchema)) {
        deps.add(dep);
      }
    }

    return deps;
  }

  private topologicalSort(schemaNames: string[]): string[] {
    const visited = new Set<string>();
    const result: string[] = [];
    const visiting = new Set<string>();

    const visit = (name: string) => {
      if (visited.has(name)) return;
      if (visiting.has(name)) return;

      visiting.add(name);

      const schema = this.schemas[name];
      if (schema) {
        const deps = this.extractDependencies(schema);
        for (const dep of deps) {
          if (schemaNames.includes(dep)) {
            visit(dep);
          }
        }
      }

      visiting.delete(name);
      visited.add(name);
      result.push(name);
    };

    for (const name of schemaNames) {
      visit(name);
    }

    return result;
  }

  generateSchemas(runtimePackage: string): string {
    const schemaOutput: string[] = [];

    for (const name of Object.keys(this.schemas)) {
      this.schemaOrder.push(name);
    }

    this.schemaOrder = this.topologicalSort(this.schemaOrder);

    const usedNames = new Set<string>();

    for (const name of this.schemaOrder) {
      const schema = this.schemas[name];

      this.currentSchemaName = name;
      this.currentPropertyPath = null;

      const zodSchema = this.convertSchema(schema, name, true);

      this.currentSchemaName = null;

      let cleanName = name;
      if (cleanName.endsWith('SchemaInput')) {
        cleanName = cleanName.replace('SchemaInput', 'Input');
      } else if (cleanName.endsWith('Schema')) {
        cleanName = cleanName.replace('Schema', '');
      }

      const prefixedName = this.schemaPrefix ? pascalCase(this.schemaPrefix) + pascalCase(cleanName) : cleanName;
      const schemaConstName = camelCase(prefixedName) + 'Schema';
      const typeName = pascalCase(prefixedName);

      if (usedNames.has(schemaConstName) || usedNames.has(typeName)) {
        continue;
      }
      usedNames.add(schemaConstName);
      usedNames.add(typeName);

      schemaOutput.push(`export const ${schemaConstName} = ${zodSchema}.describe('${typeName}');`);
      const isInputType = /(?:Body|Input|Params)$/.test(cleanName);
      const inferType = isInputType ? 'z.input' : 'z.output';
      schemaOutput.push(`export type ${typeName} = ${inferType}<typeof ${schemaConstName}>;`);
      schemaOutput.push('');
    }

    this.enumRegistry.register(['desc', 'asc'], {
      source: 'schema',
      schemaName: 'PaginationParams',
      propertyPath: 'ordering',
    });
    const orderingEnumInfo = this.enumRegistry.get(['desc', 'asc'])!;

    schemaOutput.push('// Common pagination schemas');
    schemaOutput.push(`export const paginationParamsSchema = z.object({
  page: z.number().optional(),
  limit: z.number().optional(),
  orderBy: z.string().optional(),
  ordering: ${orderingEnumInfo.schemaConstName}.optional(),
}).describe('PaginationParams');`);
    schemaOutput.push('export type PaginationParams = z.input<typeof paginationParamsSchema>;');
    schemaOutput.push('');

    schemaOutput.push(`export const paginationResponseSchema = z.object({
  page: z.number(),
  pages: z.number(),
  limit: z.number(),
  total: z.number(),
}).describe('PaginationResponse');`);
    schemaOutput.push('export type PaginationResponse = z.output<typeof paginationResponseSchema>;');
    schemaOutput.push('');

    if (this.inlineSchemas.size > 0) {
      schemaOutput.push('// Inline request/response schemas');
      for (const [schemaName, schemaInfo] of this.inlineSchemas) {
        const { schema, isInput, typeName } = schemaInfo;
        const contextName = isInput ? 'InlineInput' : 'InlineOutput';
        const zodSchema = this.convertSchema(schema, contextName, true);
        schemaOutput.push(`export const ${schemaName} = ${zodSchema}.describe('${typeName}');`);
        const inferType = isInput ? 'z.input' : 'z.output';
        schemaOutput.push(`export type ${typeName} = ${inferType}<typeof ${schemaName}>;`);
        schemaOutput.push('');
      }
    }

    const output: string[] = [];
    output.push("import { z } from 'zod';");

    const usedDateSchemasList = Object.entries(this.usedDateSchemas)
      .filter(([_, used]) => used)
      .map(([name]) => name);

    if (usedDateSchemasList.length > 0) {
      output.push(`import { ${usedDateSchemasList.join(', ')} } from '${runtimePackage}';`);
    }

    output.push('');

    const enumExports = this.enumRegistry.generateEnumExports();
    if (enumExports) {
      output.push(enumExports);
    }

    output.push(...schemaOutput);

    return output.join('\n');
  }
}
