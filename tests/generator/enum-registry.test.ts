import { describe, it, expect } from 'vitest';
import { EnumRegistry } from '../../src/generator/enum-registry';

describe('EnumRegistry', () => {
  it('registers and retrieves enums', () => {
    const registry = new EnumRegistry();
    registry.register(['active', 'inactive'], {
      source: 'schema',
      schemaName: 'ContractSchema',
      propertyPath: 'status',
    });

    registry.finalize();
    const info = registry.get(['active', 'inactive'])!;

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

    // Same fingerprint (sorted), so should return same info (placeholder identity before finalize)
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
    registry.register(['p', 'q'], {
      source: 'schema',
      schemaName: 'A',
      propertyPath: 'type',
    });

    registry.finalize();
    const info2 = registry.get(['p', 'q'])!;

    // Second enum should have a different name
    expect(info2.typeName).toContain('1');
  });

  it('generates names for query params', () => {
    const registry = new EnumRegistry();
    registry.register(['asc', 'desc'], {
      source: 'queryParam',
      resourceName: 'Vehicles',
      paramName: 'ordering',
    });

    registry.finalize();
    const info = registry.get(['asc', 'desc'])!;

    expect(info.typeName).toBe('VehicleOrdering');
  });

  it('prefers schema context over query-param context for canonical name', () => {
    const registry = new EnumRegistry();
    // Query param context is registered first (mirrors ResourceGenerator running before ZodGenerator).
    registry.register(['BEV', 'DIESEL', 'PETROL'], {
      source: 'queryParam',
      resourceName: 'VehiclesExport',
      paramName: 'fuelType',
    });
    registry.register(['BEV', 'DIESEL', 'PETROL'], {
      source: 'schema',
      schemaName: 'Vehicle',
      propertyPath: 'fuelType',
    });

    registry.finalize();
    const info = registry.get(['BEV', 'DIESEL', 'PETROL'])!;

    expect(info.typeName).toBe('VehicleFuelType');
    expect(info.schemaConstName).toBe('vehicleFuelTypeSchema');
    expect(info.valuesConstName).toBe('vehicleFuelTypes');
  });

  it('prefers shortest schema name among schema contexts', () => {
    const registry = new EnumRegistry();
    registry.register(['BEV', 'DIESEL'], {
      source: 'schema',
      schemaName: 'VehiclesExportGetDetailResponse',
      propertyPath: 'fuelType',
    });
    registry.register(['BEV', 'DIESEL'], {
      source: 'schema',
      schemaName: 'VehicleInput',
      propertyPath: 'fuelType',
    });
    registry.register(['BEV', 'DIESEL'], {
      source: 'schema',
      schemaName: 'Vehicle',
      propertyPath: 'fuelType',
    });

    registry.finalize();
    const info = registry.get(['BEV', 'DIESEL'])!;

    expect(info.typeName).toBe('VehicleFuelType');
  });

  it('dedupes when property name repeats the schema name', () => {
    const registry = new EnumRegistry();
    registry.register(['FINANCIAL_LEASE', 'OPERATIONAL_LEASE'], {
      source: 'schema',
      schemaName: 'Contract',
      propertyPath: 'contractType',
    });

    registry.finalize();
    const info = registry.get(['FINANCIAL_LEASE', 'OPERATIONAL_LEASE'])!;

    expect(info.typeName).toBe('ContractType');
    expect(info.schemaConstName).toBe('contractTypeSchema');
    expect(info.valuesConstName).toBe('contractTypes');
  });

  it('dedupes when a nested property path echoes its parent object name', () => {
    const registry = new EnumRegistry();
    registry.register(['OVER', 'ON_TRACK', 'UNDER'], {
      source: 'schema',
      schemaName: 'Vehicle',
      propertyPath: 'mileageStatus.status',
    });

    registry.finalize();
    const info = registry.get(['OVER', 'ON_TRACK', 'UNDER'])!;

    expect(info.typeName).toBe('VehicleMileageStatus');
    expect(info.schemaConstName).toBe('vehicleMileageStatusSchema');
    expect(info.valuesConstName).toBe('vehicleMileageStatuses');
  });

  it('leaves non-duplicated names alone', () => {
    const registry = new EnumRegistry();
    registry.register(['BEV', 'DIESEL'], {
      source: 'schema',
      schemaName: 'Vehicle',
      propertyPath: 'fuelType',
    });

    registry.finalize();
    const info = registry.get(['BEV', 'DIESEL'])!;

    expect(info.typeName).toBe('VehicleFuelType');
  });

  it('generates enum exports code', () => {
    const registry = new EnumRegistry();
    registry.register(['active', 'inactive'], {
      source: 'schema',
      schemaName: 'Contract',
      propertyPath: 'status',
    });

    registry.finalize();
    const code = registry.generateEnumExports();
    expect(code).toContain("export const contractStatuses = ['active', 'inactive'] as const;");
    expect(code).toContain('export const contractStatusSchema = z.enum(contractStatuses);');
    expect(code).toContain('export type ContractStatus = z.output<typeof contractStatusSchema>;');
  });

  it('returns empty string when no enums', () => {
    const registry = new EnumRegistry();
    registry.finalize();
    expect(registry.generateEnumExports()).toBe('');
  });

  it('applyPlaceholders rewrites placeholder tokens to finalized names', () => {
    const registry = new EnumRegistry();
    const placeholders = registry.register(['active', 'inactive'], {
      source: 'schema',
      schemaName: 'Contract',
      propertyPath: 'status',
    });

    const text = `field: ${placeholders.schemaConstName}.optional()`;

    registry.finalize();
    expect(registry.applyPlaceholders(text)).toBe('field: contractStatusSchema.optional()');
  });

  it('register() throws after finalize()', () => {
    const registry = new EnumRegistry();
    registry.finalize();
    expect(() =>
      registry.register(['x'], { source: 'schema', schemaName: 'A', propertyPath: 'type' }),
    ).toThrow();
  });

  it('applyPlaceholders() throws before finalize()', () => {
    const registry = new EnumRegistry();
    expect(() => registry.applyPlaceholders('any text')).toThrow();
  });

  it('fingerprints are order-independent', () => {
    expect(EnumRegistry.fingerprint(['b', 'a'])).toBe(EnumRegistry.fingerprint(['a', 'b']));
  });

  describe('with schemaPrefix', () => {
    it('prefixes schema enum names', () => {
      const registry = new EnumRegistry('Charge');
      registry.register(['active', 'inactive'], {
        source: 'schema',
        schemaName: 'ContractSchema',
        propertyPath: 'status',
      });

      registry.finalize();
      const info = registry.get(['active', 'inactive'])!;

      expect(info.typeName).toBe('ChargeContractStatus');
      expect(info.schemaConstName).toBe('chargeContractStatusSchema');
      expect(info.valuesConstName).toBe('chargeContractStatuses');
    });

    it('prefixes query param enum names', () => {
      const registry = new EnumRegistry('Charge');
      registry.register(['asc', 'desc'], {
        source: 'queryParam',
        resourceName: 'Vehicles',
        paramName: 'ordering',
      });

      registry.finalize();
      const info = registry.get(['asc', 'desc'])!;

      expect(info.typeName).toBe('ChargeVehicleOrdering');
    });

    it('generates prefixed enum exports code', () => {
      const registry = new EnumRegistry('Charge');
      registry.register(['active', 'inactive'], {
        source: 'schema',
        schemaName: 'Contract',
        propertyPath: 'status',
      });

      registry.finalize();
      const code = registry.generateEnumExports();
      expect(code).toContain("export const chargeContractStatuses = ['active', 'inactive'] as const;");
      expect(code).toContain('export const chargeContractStatusSchema = z.enum(chargeContractStatuses);');
      expect(code).toContain('export type ChargeContractStatus = z.output<typeof chargeContractStatusSchema>;');
    });
  });
});
