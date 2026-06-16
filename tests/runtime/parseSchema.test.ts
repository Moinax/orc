import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { parseSchema } from '../../src/runtime/parseSchema';
import { ParseError } from '../../src/runtime/errors';

describe('parseSchema', () => {
  it('parses valid data', () => {
    const schema = z.object({ name: z.string(), age: z.number() });
    const result = parseSchema(schema, { name: 'Alice', age: 30 });
    expect(result).toEqual({ name: 'Alice', age: 30 });
  });

  it('falls back to partial on strict mode failure', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const schema = z.object({ name: z.string() }).describe('TestSchema');
    // Extra key causes strict mode failure, but partial should succeed
    const result = parseSchema(schema, { name: 'Alice', extra: 'field' });
    expect(result).toHaveProperty('name', 'Alice');
    warnSpy.mockRestore();
  });

  it('throws ParseError on invalid data in partial mode', () => {
    expect(() =>
      parseSchema(z.object({ name: z.string() }), { name: 123 }, true),
    ).toThrow(ParseError);
  });

  it('handles non-object schemas directly', () => {
    const schema = z.string();
    expect(parseSchema(schema, 'hello')).toBe('hello');
  });

  it('handles array schemas', () => {
    const schema = z.array(z.number());
    expect(parseSchema(schema, [1, 2, 3])).toEqual([1, 2, 3]);
  });

  it('falls back to partial for nested objects with missing keys', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const schema = z
      .object({ user: z.object({ name: z.string(), age: z.number() }) })
      .describe('NestedSchema');
    // Missing `age` makes the strict parse fail; the partial fallback must
    // still walk into the nested object via `applyPartial`.
    const result = parseSchema(schema, { user: { name: 'Alice' } });
    expect(result).toEqual({ user: { name: 'Alice' } });
    warnSpy.mockRestore();
  });

  it('falls back to partial for discriminated unions', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const schema = z
      .discriminatedUnion('type', [
        z.object({ type: z.literal('a'), a: z.string() }),
        z.object({ type: z.literal('b'), b: z.number() }),
      ])
      .describe('UnionSchema');
    // Extra key triggers the partial fallback; the discriminator must be
    // preserved so the correct branch is still selected.
    const result = parseSchema(schema, { type: 'a', a: 'hello', extra: 'field' });
    expect(result).toMatchObject({ type: 'a', a: 'hello' });
    warnSpy.mockRestore();
  });
});
