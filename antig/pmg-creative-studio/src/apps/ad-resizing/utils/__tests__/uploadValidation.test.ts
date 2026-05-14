import { describe, it, expect } from 'vitest';
import { validateUploadFile, fileTypeFromMime, extFromMime } from '../uploadValidation';

describe('validateUploadFile', () => {
  function makeFile(name: string, type: string, sizeBytes: number): File {
    return new File(['x'.repeat(sizeBytes)], name, { type });
  }

  it('accepts image/png', () => {
    expect(validateUploadFile(makeFile('a.png', 'image/png', 100))).toEqual({ valid: true });
  });

  it('accepts image/jpeg', () => {
    expect(validateUploadFile(makeFile('a.jpg', 'image/jpeg', 100))).toEqual({ valid: true });
  });

  it('accepts image/webp', () => {
    expect(validateUploadFile(makeFile('a.webp', 'image/webp', 100))).toEqual({ valid: true });
  });

  it('rejects image/gif', () => {
    const result = validateUploadFile(makeFile('a.gif', 'image/gif', 100));
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toMatch(/not supported/i);
  });

  it('rejects video/mp4', () => {
    const result = validateUploadFile(makeFile('a.mp4', 'video/mp4', 100));
    expect(result.valid).toBe(false);
  });

  it('rejects files over 50 MB', () => {
    const overLimit = 50 * 1024 * 1024 + 1;
    const result = validateUploadFile(makeFile('a.png', 'image/png', overLimit));
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toMatch(/50 MB/i);
  });

  it('accepts files exactly at 50 MB', () => {
    const atLimit = 50 * 1024 * 1024;
    expect(validateUploadFile(makeFile('a.png', 'image/png', atLimit))).toEqual({ valid: true });
  });
});

describe('fileTypeFromMime', () => {
  it('maps image/png → PNG', () => expect(fileTypeFromMime('image/png')).toBe('PNG'));
  it('maps image/jpeg → JPG', () => expect(fileTypeFromMime('image/jpeg')).toBe('JPG'));
  it('maps image/webp → WEBP', () => expect(fileTypeFromMime('image/webp')).toBe('WEBP'));
  it('falls back to JPG for unknown types', () => expect(fileTypeFromMime('image/bmp')).toBe('JPG'));
});

describe('extFromMime', () => {
  it('maps image/png → png', () => expect(extFromMime('image/png')).toBe('png'));
  it('maps image/jpeg → jpg', () => expect(extFromMime('image/jpeg')).toBe('jpg'));
  it('maps image/webp → webp', () => expect(extFromMime('image/webp')).toBe('webp'));
  it('falls back to jpg', () => expect(extFromMime('image/bmp')).toBe('jpg'));
});
