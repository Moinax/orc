import { describe, it, expect } from 'vitest';
import { ZodGenerator } from '../../src/generator/zod-generator';
import { EnumRegistry } from '../../src/generator/enum-registry';

describe('ZodGenerator', () => {
  it('converts simple string schema', () => {
    const gen = new ZodGenerator({});
    expect(gen.convertSchema({ type: 'string' })).toBe('z.string()');
  });

  it('converts string with format', () => {
    const gen = new ZodGenerator({});
    expect(gen.convertSchema({ type: 'string', format: 'uuid' })).toBe('z.string().uuid()');
    expect(gen.convertSchema({ type: 'string', format: 'email' })).toBe('z.string().email()');
    expect(gen.convertSchema({ type: 'string', format: 'uri' })).toBe('z.string().url()');
  });

  it('converts number schema', () => {
    const gen = new ZodGenerator({});
    expect(gen.convertSchema({ type: 'number' })).toBe('z.number()');
    expect(gen.convertSchema({ type: 'integer' })).toBe('z.number().int()');
  });

  it('converts boolean schema', () => {
    const gen = new ZodGenerator({});
    expect(gen.convertSchema({ type: 'boolean' })).toBe('z.boolean()');
  });

  it('converts array schema', () => {
    const gen = new ZodGenerator({});
    expect(gen.convertSchema({ type: 'array', items: { type: 'string' } })).toBe('z.array(z.string())');
  });

  it('converts object schema', () => {
    const gen = new ZodGenerator({});
    const result = gen.convertSchema({
      type: 'object',
      properties: {
        name: { type: 'string' },
        age: { type: 'integer' },
      },
      required: ['name'],
    });
    expect(result).toContain('z.object(');
    expect(result).toContain('name: z.string()');
    expect(result).toContain('age: z.number().int().optional()');
  });

  it('converts $ref schema', () => {
    const gen = new ZodGenerator({});
    const result = gen.convertSchema({ $ref: '#/components/schemas/PetSchema' });
    expect(result).toBe('petSchema');
  });

  it('converts nullable schema', () => {
    const gen = new ZodGenerator({});
    expect(gen.convertSchema({ type: 'string', nullable: true })).toBe('z.string().nullable()');
  });

  it('converts nullable input schema to nullish', () => {
    const gen = new ZodGenerator({});
    expect(gen.convertSchema({ type: 'string', nullable: true }, 'PetInput')).toBe('z.string().nullish()');
  });

  it('converts anyOf with null to nullable', () => {
    const gen = new ZodGenerator({});
    const result = gen.convertSchema({
      anyOf: [{ type: 'string' }, { type: 'null' }],
    });
    expect(result).toBe('z.string().nullable()');
  });

  it('converts union types', () => {
    const gen = new ZodGenerator({});
    const result = gen.convertSchema({
      anyOf: [{ type: 'string' }, { type: 'number' }],
    });
    expect(result).toBe('z.union([z.string(), z.number()])');
  });

  it('converts const values', () => {
    const gen = new ZodGenerator({});
    expect(gen.convertSchema({ const: 'fixed' })).toBe("z.literal('fixed')");
    expect(gen.convertSchema({ const: 42 })).toBe('z.literal(42)');
  });

  it('handles date-time format for output schemas', () => {
    const gen = new ZodGenerator({});
    expect(gen.convertSchema({ type: 'string', format: 'date-time' })).toBe('stringToDateSchema');
    expect(gen.usedDateSchemas.stringToDateSchema).toBe(true);
  });

  it('handles date format for output schemas', () => {
    const gen = new ZodGenerator({});
    expect(gen.convertSchema({ type: 'string', format: 'date' })).toBe('stringToDaySchema');
    expect(gen.usedDateSchemas.stringToDaySchema).toBe(true);
  });

  it('handles date-time format for input schemas', () => {
    const gen = new ZodGenerator({});
    expect(gen.convertSchema({ type: 'string', format: 'date-time' }, 'PetInput')).toBe('dateToStringSchema');
    expect(gen.usedDateSchemas.dateToStringSchema).toBe(true);
  });

  it('converts boolean-like enums to z.boolean()', () => {
    const gen = new ZodGenerator({});
    expect(gen.convertSchema({ type: 'string', enum: ['true', 'false'] })).toBe('z.boolean()');
  });

  it('registers enums with enum registry', () => {
    const enumRegistry = new EnumRegistry();
    const gen = new ZodGenerator({}, enumRegistry);
    const result = gen.convertSchema(
      { type: 'string', enum: ['active', 'inactive'] },
      'ContractSchema',
    );
    expect(enumRegistry.has(['active', 'inactive'])).toBe(true);
  });

  it('generates schemas with correct output', () => {
    const gen = new ZodGenerator({
      PetSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
        },
        required: ['id', 'name'],
      },
    });

    const output = gen.generateSchemas('@moinax/orc');
    expect(output).toContain("import { z } from 'zod';");
    expect(output).toContain('export const petSchema = ');
    expect(output).toContain('export type Pet = ');
    expect(output).toContain('paginationParamsSchema');
    expect(output).toContain('paginationResponseSchema');
  });

  it('adds date schema imports when used', () => {
    const gen = new ZodGenerator({
      EventSchema: {
        type: 'object',
        properties: {
          createdAt: { type: 'string', format: 'date-time' },
        },
        required: ['createdAt'],
      },
    });

    const output = gen.generateSchemas('@moinax/orc');
    expect(output).toContain("import { stringToDateSchema } from '@moinax/orc';");
  });

  it('converts allOf to merged schemas', () => {
    const gen = new ZodGenerator({});
    const result = gen.convertSchema({
      allOf: [
        { $ref: '#/components/schemas/BaseSchema' },
        {
          type: 'object',
          properties: { extra: { type: 'string' } },
        },
      ],
    });
    expect(result).toContain('.merge(');
  });

  it('converts record types', () => {
    const gen = new ZodGenerator({});
    const result = gen.convertSchema({
      type: 'object',
      additionalProperties: { type: 'string' },
    });
    expect(result).toBe('z.record(z.string(), z.string())');
  });

  it('uses z.coerce.number() for input schemas', () => {
    const gen = new ZodGenerator({});
    expect(gen.convertSchema({ type: 'integer' }, 'PetInput')).toBe('z.coerce.number().int()');
    expect(gen.convertSchema({ type: 'integer' }, 'PetBody')).toBe('z.coerce.number().int()');
  });

  it('converts enum: [null] (NullEnum) to z.null()', () => {
    const gen = new ZodGenerator({});
    expect(gen.convertSchema({ enum: [null] })).toBe('z.null()');
  });

  it('filters null from mixed enum values and wraps with nullable', () => {
    const enumRegistry = new EnumRegistry();
    const gen = new ZodGenerator({}, enumRegistry);
    const result = gen.convertSchema(
      { type: 'string', enum: ['active', 'inactive', null] },
      'ContractSchema',
    );
    expect(result).toContain('.nullable()');
    expect(enumRegistry.has(['active', 'inactive'])).toBe(true);
  });

  it('converts oneOf with null type to nullable', () => {
    const gen = new ZodGenerator({});
    const result = gen.convertSchema({
      oneOf: [{ type: 'string' }, { type: 'null' }],
    });
    expect(result).toBe('z.string().nullable()');
  });

  it('converts oneOf with NullEnum $ref to nullable', () => {
    const gen = new ZodGenerator({
      NullEnum: { enum: [null] },
      StatusEnum: { type: 'string', enum: ['active', 'inactive'] },
    });
    const result = gen.convertSchema({
      oneOf: [
        { $ref: '#/components/schemas/StatusEnum' },
        { $ref: '#/components/schemas/NullEnum' },
      ],
    });
    expect(result).toBe('statusEnumSchema.nullable()');
  });

  it('converts oneOf with NullEnum $ref to nullish for input schemas', () => {
    const gen = new ZodGenerator({
      NullEnum: { enum: [null] },
      StatusEnum: { type: 'string', enum: ['active', 'inactive'] },
    });
    const result = gen.convertSchema(
      {
        oneOf: [
          { $ref: '#/components/schemas/StatusEnum' },
          { $ref: '#/components/schemas/NullEnum' },
        ],
      },
      'PetInput',
    );
    expect(result).toBe('statusEnumSchema.nullish()');
  });

  describe('with schemaPrefix', () => {
    it('prefixes $ref resolution', () => {
      const gen = new ZodGenerator({}, undefined, 'Charge');
      const result = gen.convertSchema({ $ref: '#/components/schemas/PetSchema' });
      expect(result).toBe('chargePetSchema');
    });

    it('prefixes generated schema const and type names', () => {
      const gen = new ZodGenerator(
        {
          PetSchema: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              name: { type: 'string' },
            },
            required: ['id', 'name'],
          },
        },
        undefined,
        'Charge',
      );

      const output = gen.generateSchemas('@moinax/orc');
      expect(output).toContain('export const chargePetSchema = ');
      expect(output).toContain('export type ChargePet = ');
    });

    it('does not prefix pagination schemas', () => {
      const gen = new ZodGenerator({}, undefined, 'Charge');
      const output = gen.generateSchemas('@moinax/orc');
      expect(output).toContain('export const paginationParamsSchema = ');
      expect(output).toContain('export type PaginationParams = ');
      expect(output).toContain('export const paginationResponseSchema = ');
      expect(output).toContain('export type PaginationResponse = ');
    });
  });
});
