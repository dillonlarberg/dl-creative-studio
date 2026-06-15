import { describe, it, expect } from 'vitest';
import { validateVideoFile } from '../videoValidation';

describe('validateVideoFile', () => {
  it('accepts video/mp4 under the size limit', () => {
    expect(validateVideoFile({ type: 'video/mp4', size: 1000 } as File)).toEqual({ ok: true });
  });

  it('accepts video/quicktime under the size limit', () => {
    expect(validateVideoFile({ type: 'video/quicktime', size: 1000 } as File)).toEqual({ ok: true });
  });

  it('rejects a non-video mime type', () => {
    const result = validateVideoFile({ type: 'image/png', size: 1000 } as File);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/mp4|mov|quicktime/i);
  });

  it('rejects a file over the 500 MB limit', () => {
    const result = validateVideoFile({ type: 'video/mp4', size: 600 * 1024 * 1024 } as File);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/500/);
  });

  it('accepts a file exactly at the 500 MB limit', () => {
    expect(validateVideoFile({ type: 'video/mp4', size: 500 * 1024 * 1024 } as File)).toEqual({ ok: true });
  });
});
