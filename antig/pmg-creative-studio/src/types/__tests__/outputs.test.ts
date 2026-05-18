import { describe, it, expect } from 'vitest';
import { OutputDocSchema } from '../outputs';

describe('OutputDocSchema', () => {
  const valid = {
    outputId: 'o1',
    batchId: 'b1',
    clientSlug: 'apple_services',
    appId: 'ad-resizing',
    createdBy: 'alli-user-uuid-123',
    createdAt: { seconds: 1, nanoseconds: 0 },
    kind: 'image',
    status: 'complete',
    previewUrl: 'https://x/y.png',
    storageRef: 'clients/apple_services/apps/ad-resizing/outputs/o1.png',
    format: { width: 1280, height: 720, label: 'digital-1280x720' },
  };

  it('accepts a fully-populated complete output', () => {
    expect(() => OutputDocSchema.parse(valid)).not.toThrow();
  });

  it('rejects an output missing createdBy', () => {
    const { createdBy: _omit, ...rest } = valid;
    expect(() => OutputDocSchema.parse(rest)).toThrow(/createdBy/);
  });

  it('rejects an output missing clientSlug', () => {
    const { clientSlug: _omit, ...rest } = valid;
    expect(() => OutputDocSchema.parse(rest)).toThrow(/clientSlug/);
  });

  it('accepts pending status without storageRef/previewUrl', () => {
    const pending = { ...valid, status: 'pending', storageRef: undefined, previewUrl: undefined };
    expect(() => OutputDocSchema.parse(pending)).not.toThrow();
  });

  it('rejects unknown kind', () => {
    expect(() => OutputDocSchema.parse({ ...valid, kind: 'audio' })).toThrow();
  });
});
