import pluralizeLib from 'pluralize';
import { camelCase, pascalCase, singularize } from './utils';

export interface EnumContext {
  source: 'schema' | 'queryParam';
  schemaName?: string;
  propertyPath?: string;
  paramName?: string;
  resourceName?: string;
}

export interface EnumInfo {
  valuesConstName: string;
  schemaConstName: string;
  typeName: string;
  values: string[];
}

export class EnumRegistry {
  private enums = new Map<string, EnumInfo>();
  private enumContexts = new Map<string, EnumContext[]>();
  private usedNames = new Set<string>();
  private schemaPrefix: string;

  constructor(schemaPrefix?: string) {
    this.schemaPrefix = schemaPrefix || '';
  }

  static fingerprint(values: string[]): string {
    return JSON.stringify([...values].sort());
  }

  generateEnumNames(values: string[], context: EnumContext): EnumInfo {
    const { source, schemaName, propertyPath, paramName, resourceName } = context;

    let baseName: string;
    if (source === 'schema' && schemaName && propertyPath) {
      const cleanSchemaName = schemaName
        .replace(/Schema$/, '')
        .replace(/SchemaInput$/, '')
        .replace(/Input$/, '');

      const pathParts = propertyPath.split('.');
      const contextFromPath = pathParts.map((p) => pascalCase(singularize(p))).join('');
      baseName = camelCase(cleanSchemaName) + contextFromPath;
    } else if (source === 'queryParam' && resourceName && paramName) {
      const singularResource = singularize(resourceName);
      baseName = camelCase(singularResource) + pascalCase(paramName);
    } else {
      baseName = camelCase(values[0].toLowerCase());
    }

    if (this.schemaPrefix) {
      baseName = camelCase(this.schemaPrefix) + pascalCase(baseName);
    }

    const valuesConstName = pluralizeLib.isPlural(baseName) ? baseName : pluralizeLib.plural(baseName);

    return {
      valuesConstName,
      schemaConstName: `${singularize(baseName)}Schema`,
      typeName: pascalCase(singularize(baseName)),
      values,
    };
  }

  register(values: string[], context: EnumContext): EnumInfo {
    const fingerprint = EnumRegistry.fingerprint(values);

    if (!this.enumContexts.has(fingerprint)) {
      this.enumContexts.set(fingerprint, []);
    }
    this.enumContexts.get(fingerprint)!.push(context);

    if (this.enums.has(fingerprint)) {
      return this.enums.get(fingerprint)!;
    }

    let enumInfo = this.generateEnumNames(values, context);

    let counter = 1;
    const hasCollision = () =>
      this.usedNames.has(enumInfo.valuesConstName) ||
      this.usedNames.has(enumInfo.schemaConstName) ||
      this.usedNames.has(enumInfo.typeName);

    while (hasCollision()) {
      const baseInfo = this.generateEnumNames(values, context);
      enumInfo = {
        valuesConstName: `${baseInfo.valuesConstName}${counter}`,
        schemaConstName: `${baseInfo.schemaConstName.replace(/Schema$/, '')}${counter}Schema`,
        typeName: `${baseInfo.typeName}${counter}`,
        values: baseInfo.values,
      };
      counter++;
    }

    this.usedNames.add(enumInfo.valuesConstName);
    this.usedNames.add(enumInfo.schemaConstName);
    this.usedNames.add(enumInfo.typeName);

    this.enums.set(fingerprint, enumInfo);
    return enumInfo;
  }

  has(values: string[]): boolean {
    return this.enums.has(EnumRegistry.fingerprint(values));
  }

  get(values: string[]): EnumInfo | undefined {
    return this.enums.get(EnumRegistry.fingerprint(values));
  }

  getAll(): EnumInfo[] {
    return Array.from(this.enums.values());
  }

  generateEnumExports(): string {
    const lines: string[] = [];

    if (this.enums.size === 0) {
      return '';
    }

    lines.push('// ============================================================================');
    lines.push('// Extracted Enums');
    lines.push('// ============================================================================');
    lines.push('');

    for (const enumInfo of this.enums.values()) {
      const { valuesConstName, schemaConstName, typeName, values } = enumInfo;
      const valuesStr = values.map((v) => `'${v}'`).join(', ');

      lines.push(`export const ${valuesConstName} = [${valuesStr}] as const;`);
      lines.push(`export const ${schemaConstName} = z.enum(${valuesConstName});`);
      lines.push(`export type ${typeName} = z.output<typeof ${schemaConstName}>;`);
      lines.push('');
    }

    return lines.join('\n');
  }
}
