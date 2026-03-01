import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { ClientError, ParseError, formatError } from '../../src/runtime/errors';

describe('ClientError', () => {
  it('has correct properties', () => {
    const error = new ClientError('Not found', 404, 'req-123');
    expect(error.message).toBe('Not found');
    expect(error.status).toBe(404);
    expect(error.requestId).toBe('req-123');
    expect(error.name).toBe('ClientError');
  });
});

describe('ParseError', () => {
  it('formats Zod errors into readable messages', () => {
    const schema = z.object({ name: z.string() }).describe('TestSchema');
    try {
      schema.parse({ name: 123 });
    } catch (e) {
      const error = new ParseError(e as z.ZodError, schema, { name: 123 });
      expect(error.name).toBe('ParseError');
      expect(error.message).toContain('TestSchema');
      expect(error.message).toContain('name');
    }
  });
});

describe('formatError', () => {
  it('formats error with schema description', () => {
    const schema = z.object({ id: z.string() }).describe('MySchema');
    try {
      schema.parse({ id: 42 });
    } catch (e) {
      const message = formatError(e as z.ZodError, schema, { id: 42 });
      expect(message).toContain('MySchema');
      expect(message).toContain('id');
      expect(message).toContain('42');
    }
  });

  it('handles unrecognized keys', () => {
    const schema = z.object({ id: z.string() }).strict().describe('StrictSchema');
    try {
      schema.parse({ id: 'abc', extra: true });
    } catch (e) {
      const message = formatError(e as z.ZodError, schema);
      expect(message).toContain('StrictSchema');
      expect(message).toContain('extra');
    }
  });
});
