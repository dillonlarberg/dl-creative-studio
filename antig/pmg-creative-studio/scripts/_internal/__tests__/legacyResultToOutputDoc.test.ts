import { describe, it, expect } from 'vitest';
import { legacyResultToOutputDoc } from '../legacyResultToOutputDoc';
import { OutputDocSchema } from '../../../src/types/outputs';

const FALLBACK_TS = { seconds: 1, nanoseconds: 0 };

describe('legacyResultToOutputDoc', () => {
  it('maps a fully-populated legacy result to a canonical OutputDoc', () => {
    const doc = legacyResultToOutputDoc({
      resultId: 'r1',
      batchId: 'b1',
      clientSlug: 'apple_services',
      appId: 'template-builder',
      legacy: {
        url: 'https://picsum.photos/seed/x/1080/1080',
        feedRowIndex: 0,
        metadata: { width: 1080, height: 1080, label: 'square' },
        createdAt: FALLBACK_TS,
      },
      fallbackCreatedAt: FALLBACK_TS,
    });

    expect(doc).toMatchObject({
      outputId: 'r1',
      batchId: 'b1',
      clientSlug: 'apple_services',
      appId: 'template-builder',
      createdBy: 'legacy-backfill',
      status: 'complete',
      kind: 'image',
      format: { width: 1080, height: 1080, label: 'square' },
      previewUrl: 'https://picsum.photos/seed/x/1080/1080',
    });
  });

  it('passes OutputDocSchema validation', () => {
    const doc = legacyResultToOutputDoc({
      resultId: 'r1',
      batchId: 'b1',
      clientSlug: 'apple_services',
      appId: 'template-builder',
      legacy: {
        url: 'https://picsum.photos/seed/x/1080/1080',
        metadata: { width: 1080, height: 1080, label: 'square' },
        createdAt: FALLBACK_TS,
      },
      fallbackCreatedAt: FALLBACK_TS,
    });
    expect(() => OutputDocSchema.parse(doc)).not.toThrow();
  });

  it('defaults format to 1080x1080 when metadata is missing dims', () => {
    const doc = legacyResultToOutputDoc({
      resultId: 'r1',
      batchId: 'b1',
      clientSlug: 'apple_services',
      appId: 'template-builder',
      legacy: { url: 'https://x/y.png', metadata: { product: 'foo' } },
      fallbackCreatedAt: FALLBACK_TS,
    });
    expect(doc.format).toEqual({ width: 1080, height: 1080, label: '1080x1080' });
  });

  it('omits previewUrl when legacy url is missing or empty', () => {
    const noUrl = legacyResultToOutputDoc({
      resultId: 'r1',
      batchId: 'b1',
      clientSlug: 'apple_services',
      appId: 'template-builder',
      legacy: { metadata: { width: 1080, height: 1080, label: 'square' } },
      fallbackCreatedAt: FALLBACK_TS,
    });
    expect(noUrl).not.toHaveProperty('previewUrl');

    const emptyUrl = legacyResultToOutputDoc({
      resultId: 'r2',
      batchId: 'b1',
      clientSlug: 'apple_services',
      appId: 'template-builder',
      legacy: { url: '', metadata: { width: 1080, height: 1080, label: 'square' } },
      fallbackCreatedAt: FALLBACK_TS,
    });
    expect(emptyUrl).not.toHaveProperty('previewUrl');
  });

  it('preserves the legacy createdAt when present', () => {
    const ts = { seconds: 12345, nanoseconds: 678 };
    const doc = legacyResultToOutputDoc({
      resultId: 'r1',
      batchId: 'b1',
      clientSlug: 'apple_services',
      appId: 'template-builder',
      legacy: {
        url: 'https://x/y.png',
        metadata: { width: 1080, height: 1080, label: 'square' },
        createdAt: ts,
      },
      fallbackCreatedAt: { seconds: 0, nanoseconds: 0 },
    });
    expect(doc.createdAt).toBe(ts);
  });

  it('falls back to the provided sentinel when legacy createdAt is missing', () => {
    const sentinel = { __serverTimestamp__: true };
    const doc = legacyResultToOutputDoc({
      resultId: 'r1',
      batchId: 'b1',
      clientSlug: 'apple_services',
      appId: 'template-builder',
      legacy: { url: 'https://x/y.png', metadata: {} },
      fallbackCreatedAt: sentinel,
    });
    expect(doc.createdAt).toBe(sentinel);
  });

  it('stamps createdBy=legacy-backfill regardless of any legacy author hint', () => {
    const doc = legacyResultToOutputDoc({
      resultId: 'r1',
      batchId: 'b1',
      clientSlug: 'apple_services',
      appId: 'template-builder',
      legacy: {
        url: 'https://x/y.png',
        metadata: { width: 1080, height: 1080, label: 'square' },
        // Legacy docs occasionally have a user field; we deliberately ignore
        // it because we can't trust historical attribution.
        createdBy: 'whoever@pmg.com',
      } as never,
      fallbackCreatedAt: FALLBACK_TS,
    });
    expect(doc.createdBy).toBe('legacy-backfill');
  });
});
