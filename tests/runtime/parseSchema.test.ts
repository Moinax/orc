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
});
