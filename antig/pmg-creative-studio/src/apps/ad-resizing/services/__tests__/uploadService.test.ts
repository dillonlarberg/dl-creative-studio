import { describe, it, expect } from 'vitest';
import { docToCreative } from '../uploadService';
import { Timestamp } from 'firebase/firestore';

describe('docToCreative', () => {
  const base = {
    id: 'abc123',
    name: 'hero.png',
    url: 'https://storage.example.com/hero.png',
    width: 1200,
    height: 628,
    sizeBytes: 204800,
    uploadedBy: 'user-uid',
    uploadedAt: Timestamp.fromDate(new Date('2026-05-14T10:00:00Z')),
  };

  it('maps PNG fileType', () => {
    const c = docToCreative({ ...base, fileType: 'PNG' });
    expect(c.fileType).toBe('PNG');
  });

  it('maps WEBP fileType', () => {
    const c = docToCreative({ ...base, fileType: 'WEBP' });
    expect(c.fileType).toBe('WEBP');
  });

  it('coerces unknown fileType (GIF) to JPG', () => {
    const c = docToCreative({ ...base, fileType: 'GIF' });
    expect(c.fileType).toBe('JPG');
  });

  it('converts Firestore Timestamp to ISO string', () => {
    const c = docToCreative({ ...base, fileType: 'PNG' });
    expect(c.uploadedAt).toBe('2026-05-14T10:00:00.000Z');
  });

  it('sets sourceKind to upload', () => {
    const c = docToCreative({ ...base, fileType: 'PNG' });
    expect(c.sourceKind).toBe('upload');
  });

  it('sets source to upload', () => {
    const c = docToCreative({ ...base, fileType: 'PNG' });
    expect(c.source).toBe('upload');
  });

  it('sets thumbnailUrl and originalUrl from url field', () => {
    const c = docToCreative({ ...base, fileType: 'PNG' });
    expect(c.thumbnailUrl).toBe(base.url);
    expect(c.originalUrl).toBe(base.url);
  });
});
