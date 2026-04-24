import pluralizeLib from 'pluralize';
import { camelCase, pascalCase, singularize } from './utils';

/**
 * Collapse consecutive repeated words in a camelCase/PascalCase identifier.
 * Handles two common sources of ugly duplication when schema name + property path are concatenated:
 *   - property named after its parent schema: `Contract.contractType` → `contractContractType` → `contractType`
 *   - nested object whose name is echoed by its inner property: `Vehicle.mileageStatus.status`
 *     → `vehicleMileageStatusStatus` → `vehicleMileageStatus`
 */
function dedupeConsecutiveWords(name: string): string {
  const words = name.match(/[A-Z]?[a-z0-9]+|[A-Z]+(?=[A-Z]|$)/g);
  if (!words || words.length <= 1) return name;

  const deduped: string[] = [];
  for (const w of words) {
    const prev = deduped[deduped.length - 1];
    if (!prev || prev.toLowerCase() !== w.toLowerCase()) {
      deduped.push(w);
    }
  }
  if (deduped.length === words.length) return name;

  const startsLowercase = /^[a-z]/.test(name);
  return deduped
    .map((w, i) => {
      const first = i === 0 && startsLowercase ? w.charAt(0).toLowerCase() : w.charAt(0).toUpperCase();
      return first + w.slice(1);
    })
    .join('');
}

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

interface EnumEntry {
  contexts: EnumContext[];
  placeholder: EnumInfo;
  final: EnumInfo | null;
}

/**
 * Enum naming can't be decided until every schema and every query parameter has been visited, because
 * the same enum values can appear under multiple contexts and the most canonical one should win
 * (schema context beats query-param context; shortest/base schema name beats longer variants).
 *
 * To avoid reordering the generator's traversal, register() returns placeholder tokens that get
 * embedded in the generated text. Once every generator has finished registering, finalize() picks
 * the best context for each enum, and applyPlaceholders() rewrites generated text to final names.
 */
export class EnumRegistry {
  private enums = new Map<string, EnumEntry>();
  private finalized = false;
  private schemaPrefix: string;

  constructor(schemaPrefix?: string) {
    this.schemaPrefix = schemaPrefix || '';
  }

  static fingerprint(values: string[]): string {
    return JSON.stringify([...values].sort());
  }

  private static placeholdersFor(id: string, values: string[]): EnumInfo {
    return {
      valuesConstName: `__ORC_ENUM_VALUES_${id}__`,
      schemaConstName: `__ORC_ENUM_SCHEMA_${id}__`,
      typeName: `__ORC_ENUM_TYPE_${id}__`,
      values,
    };
  }

  private resolve(entry: EnumEntry): EnumInfo {
    return entry.final ?? entry.placeholder;
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

    baseName = dedupeConsecutiveWords(baseName);

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
    if (this.finalized) {
      throw new Error('EnumRegistry.register() called after finalize()');
    }

    const fingerprint = EnumRegistry.fingerprint(values);
    let entry = this.enums.get(fingerprint);
    if (!entry) {
      const id = `E${this.enums.size}`;
      entry = {
        contexts: [],
        placeholder: EnumRegistry.placeholdersFor(id, values),
        final: null,
      };
      this.enums.set(fingerprint, entry);
    }
    entry.contexts.push(context);
    return entry.placeholder;
  }

  has(values: string[]): boolean {
    return this.enums.has(EnumRegistry.fingerprint(values));
  }

  get(values: string[]): EnumInfo | undefined {
    const entry = this.enums.get(EnumRegistry.fingerprint(values));
    return entry ? this.resolve(entry) : undefined;
  }

  getAll(): EnumInfo[] {
    return Array.from(this.enums.values(), (entry) => this.resolve(entry));
  }

  /**
   * Pick the most canonical context. Schema-source contexts beat query-param contexts, because the
   * schema is the authoritative definition of the type. Within a source tier, the shortest base
   * name wins (Vehicle beats VehiclesExport, VehicleInput normalizes to Vehicle), alphabetical for
   * ties. This keeps naming stable when new resources or schemas get added around an existing enum.
   */
  private pickBestContext(contexts: EnumContext[]): EnumContext {
    // Inline schemas are anonymous request/response bodies (schemaName = 'InlineInput'/'InlineOutput').
    // They should never win over a real named schema — otherwise a POST body can hijack the naming of
    // an enum that also appears in its matching top-level schema.
    const isInlineSchema = (c: EnumContext) =>
      c.source === 'schema' && c.schemaName !== undefined && /^Inline(Input|Output)?$/.test(c.schemaName);

    const namedSchemaContexts = contexts.filter(
      (c) => c.source === 'schema' && c.schemaName && c.propertyPath && !isInlineSchema(c),
    );
    const schemaContexts =
      namedSchemaContexts.length > 0
        ? namedSchemaContexts
        : contexts.filter((c) => c.source === 'schema' && c.schemaName && c.propertyPath);
    const pool = schemaContexts.length > 0 ? schemaContexts : contexts;

    const keyOf = (c: EnumContext): string => {
      if (c.source === 'schema' && c.schemaName) {
        return c.schemaName
          .replace(/Schema$/, '')
          .replace(/SchemaInput$/, '')
          .replace(/Input$/, '');
      }
      if (c.source === 'queryParam' && c.resourceName) {
        return c.resourceName;
      }
      return '';
    };

    return [...pool].sort((a, b) => {
      const aKey = keyOf(a);
      const bKey = keyOf(b);
      if (aKey.length !== bKey.length) return aKey.length - bKey.length;
      return aKey.localeCompare(bKey);
    })[0];
  }

  finalize(): void {
    if (this.finalized) return;
    this.finalized = true;

    const usedNames = new Set<string>();

    for (const entry of this.enums.values()) {
      const bestContext = this.pickBestContext(entry.contexts);
      const baseInfo = this.generateEnumNames(entry.placeholder.values, bestContext);
      let finalInfo: EnumInfo = baseInfo;

      let counter = 1;
      while (
        usedNames.has(finalInfo.valuesConstName) ||
        usedNames.has(finalInfo.schemaConstName) ||
        usedNames.has(finalInfo.typeName)
      ) {
        finalInfo = {
          valuesConstName: `${baseInfo.valuesConstName}${counter}`,
          schemaConstName: `${baseInfo.schemaConstName.replace(/Schema$/, '')}${counter}Schema`,
          typeName: `${baseInfo.typeName}${counter}`,
          values: baseInfo.values,
        };
        counter++;
      }

      usedNames.add(finalInfo.valuesConstName);
      usedNames.add(finalInfo.schemaConstName);
      usedNames.add(finalInfo.typeName);

      entry.final = finalInfo;
    }
  }

  /** Replace placeholder tokens in generated text with finalized enum names. */
  applyPlaceholders(text: string): string {
    if (!this.finalized) {
      throw new Error('EnumRegistry.applyPlaceholders() called before finalize()');
    }
    let result = text;
    for (const entry of this.enums.values()) {
      if (!entry.final) continue;
      result = result.replaceAll(entry.placeholder.valuesConstName, entry.final.valuesConstName);
      result = result.replaceAll(entry.placeholder.schemaConstName, entry.final.schemaConstName);
      result = result.replaceAll(entry.placeholder.typeName, entry.final.typeName);
    }
    return result;
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

    for (const entry of this.enums.values()) {
      const { valuesConstName, schemaConstName, typeName, values } = this.resolve(entry);
      const valuesStr = values.map((v) => `'${v}'`).join(', ');

      lines.push(`export const ${valuesConstName} = [${valuesStr}] as const;`);
      lines.push(`export const ${schemaConstName} = z.enum(${valuesConstName});`);
      lines.push(`export type ${typeName} = z.output<typeof ${schemaConstName}>;`);
      lines.push('');
    }

    return lines.join('\n');
  }
}
