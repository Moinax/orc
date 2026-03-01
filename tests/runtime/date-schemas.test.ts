import { describe, it, expect } from 'vitest';
import {
  stringToDateSchema,
  stringToDaySchema,
  dateToStringSchema,
  dayToStringSchema,
} from '../../src/runtime/date-schemas';

describe('stringToDateSchema', () => {
  it('transforms ISO datetime string to Date', () => {
    const result = stringToDateSchema.parse('2025-01-15T10:30:00Z');
    expect(result).toBeInstanceOf(Date);
    expect(result.toISOString()).toBe('2025-01-15T10:30:00.000Z');
  });
});

describe('stringToDaySchema', () => {
  it('transforms date string to Date at midnight local', () => {
    const result = stringToDaySchema.parse('2025-01-15');
    expect(result).toBeInstanceOf(Date);
    expect(result.getFullYear()).toBe(2025);
    expect(result.getMonth()).toBe(0); // January
    expect(result.getDate()).toBe(15);
    expect(result.getHours()).toBe(0);
  });
});

describe('dateToStringSchema', () => {
  it('transforms Date to ISO string', () => {
    const date = new Date('2025-01-15T10:30:00.000Z');
    const result = dateToStringSchema.parse(date);
    expect(typeof result).toBe('string');
    expect(result).toBe('2025-01-15T10:30:00.000Z');
  });

  it('accepts string dates via coercion', () => {
    const result = dateToStringSchema.parse('2025-01-15T10:30:00Z');
    expect(typeof result).toBe('string');
  });
});

describe('dayToStringSchema', () => {
  it('transforms Date to date-only string', () => {
    const date = new Date(2025, 0, 15); // Jan 15, 2025 local time
    const result = dayToStringSchema.parse(date);
    expect(typeof result).toBe('string');
    expect(result).toBe('2025-01-15');
  });
});
