import { describe, it, expect } from 'vitest';
import { EnumRegistry } from '../../src/generator/enum-registry';

describe('EnumRegistry', () => {
  it('registers and retrieves enums', () => {
    const registry = new EnumRegistry();
    const info = registry.register(['active', 'inactive'], {
      source: 'schema',
      schemaName: 'ContractSchema',
      propertyPath: 'status',
    });

    expect(info.typeName).toBe('ContractStatus');
    expect(info.values).toEqual(['active', 'inactive']);
    expect(registry.has(['active', 'inactive'])).toBe(true);
  });

  it('deduplicates enums with same values', () => {
    const registry = new EnumRegistry();
    const info1 = registry.register(['a', 'b'], {
      source: 'schema',
      schemaName: 'First',
      propertyPath: 'type',
    });
    const info2 = registry.register(['b', 'a'], {
      source: 'schema',
      schemaName: 'Second',
      propertyPath: 'type',
    });

    // Same fingerprint (sorted), so should return same info
    expect(info1).toEqual(info2);
    expect(registry.getAll().length).toBe(1);
  });

  it('handles naming collisions', () => {
    const registry = new EnumRegistry();
    registry.register(['x', 'y'], {
      source: 'schema',
      schemaName: 'A',
      propertyPath: 'type',
    });
    const info2 = registry.register(['p', 'q'], {
      source: 'schema',
      schemaName: 'A',
      propertyPath: 'type',
    });

    // Second enum should have a different name
    expect(info2.typeName).toContain('1');
  });

  it('generates names for query params', () => {
    const registry = new EnumRegistry();
    const info = registry.register(['asc', 'desc'], {
      source: 'queryParam',
      resourceName: 'Vehicles',
      paramName: 'ordering',
    });

    expect(info.typeName).toBe('VehicleOrdering');
  });

  it('generates enum exports code', () => {
    const registry = new EnumRegistry();
    registry.register(['active', 'inactive'], {
      source: 'schema',
      schemaName: 'Contract',
      propertyPath: 'status',
    });

    const code = registry.generateEnumExports();
    expect(code).toContain("export const contractStatuses = ['active', 'inactive'] as const;");
    expect(code).toContain('export const contractStatusSchema = z.enum(contractStatuses);');
    expect(code).toContain('export type ContractStatus = z.output<typeof contractStatusSchema>;');
  });

  it('returns empty string when no enums', () => {
    const registry = new EnumRegistry();
    expect(registry.generateEnumExports()).toBe('');
  });

  it('fingerprints are order-independent', () => {
    expect(EnumRegistry.fingerprint(['b', 'a'])).toBe(EnumRegistry.fingerprint(['a', 'b']));
  });

  describe('with schemaPrefix', () => {
    it('prefixes schema enum names', () => {
      const registry = new EnumRegistry('Charge');
      const info = registry.register(['active', 'inactive'], {
        source: 'schema',
        schemaName: 'ContractSchema',
        propertyPath: 'status',
      });

      expect(info.typeName).toBe('ChargeContractStatus');
      expect(info.schemaConstName).toBe('chargeContractStatusSchema');
      expect(info.valuesConstName).toBe('chargeContractStatuses');
    });

    it('prefixes query param enum names', () => {
      const registry = new EnumRegistry('Charge');
      const info = registry.register(['asc', 'desc'], {
        source: 'queryParam',
        resourceName: 'Vehicles',
        paramName: 'ordering',
      });

      expect(info.typeName).toBe('ChargeVehicleOrdering');
    });

    it('generates prefixed enum exports code', () => {
      const registry = new EnumRegistry('Charge');
      registry.register(['active', 'inactive'], {
        source: 'schema',
        schemaName: 'Contract',
        propertyPath: 'status',
      });

      const code = registry.generateEnumExports();
      expect(code).toContain("export const chargeContractStatuses = ['active', 'inactive'] as const;");
      expect(code).toContain('export const chargeContractStatusSchema = z.enum(chargeContractStatuses);');
      expect(code).toContain('export type ChargeContractStatus = z.output<typeof chargeContractStatusSchema>;');
    });
  });
});
