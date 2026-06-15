import { describe, it, expect } from 'vitest';
import { bestSampleRow } from '../templateAI';

describe('bestSampleRow', () => {
  it('returns null for empty input', () => {
    expect(bestSampleRow([])).toBeNull();
  });

  it('returns first row with >= 3 non-empty values', () => {
    const rows = [
      { a: '', b: '', c: '' },
      { a: 'hello', b: 'world', c: 'foo' },
    ];
    const result = bestSampleRow(rows);
    expect(result).toEqual({ a: 'hello', b: 'world', c: 'foo' });
  });

  it('falls back to row 0 when no row has >= 3 non-empty values', () => {
    const rows = [{ a: 'only', b: '' }];
    const result = bestSampleRow(rows);
    expect(result).toEqual({ a: 'only', b: '' });
  });

  it('truncates values longer than 80 chars', () => {
    const longVal = 'x'.repeat(100);
    const rows = [{ a: longVal, b: 'short', c: 'also short' }];
    const result = bestSampleRow(rows);
    expect(result!.a.length).toBe(80);
    expect(result!.b).toBe('short');
  });

  it('skips rows with fewer than 3 non-empty values', () => {
    const rows = [
      { a: 'one', b: '' },
      { a: 'one', b: 'two', c: 'three' },
    ];
    const result = bestSampleRow(rows);
    expect(result).toEqual({ a: 'one', b: 'two', c: 'three' });
  });

  it('scans only the first 5 rows', () => {
    const rows = Array.from({ length: 10 }, (_, i) =>
      i < 5 ? { a: '', b: '', c: '' } : { a: 'a', b: 'b', c: 'c' }
    );
    // First 5 rows are empty, fallback to row 0
    const result = bestSampleRow(rows);
    expect(result).toEqual({ a: '', b: '', c: '' });
  });
});
