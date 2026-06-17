import { describe, it, expect, vi } from 'vitest';
import { mapTemplateToStepData } from '../mapTemplateToStepData';
import type { TemplateLibraryRecord } from '../../../../services/templateLibrary.types';

vi.mock('../../../../constants/useCases', () => ({
  SOCIAL_WIREFRAMES: [{ id: 'wireframe-1', file: 'wireframe-1.html' }],
}));

const minimalRecord: TemplateLibraryRecord = {
  id: 'tmpl-1',
  name: 'Test Template',
  status: 'published',
  version: 1,
  channel: 'social',
  adSizes: [
    { width: 1200, height: 628, label: '1200:628' },
    { width: 1080, height: 1080 },
  ],
  scaffoldId: 'wireframe-1',
  scaffoldSnapshot: {
    expectedFields: [],
    contentHash: 'abc',
    capturedAt: { seconds: 0, nanoseconds: 0 } as never,
  },
  datasourceId: 'feed-1',
  datasourceName: 'Product Feed',
  feedSnapshot: {
    columns: ['title', 'price'],
    capturedAt: { seconds: 0, nanoseconds: 0 } as never,
  },
  fieldMappings: {
    headline: { source: 'feed', column: 'title' },
    logo: { source: 'upload', assetPath: 'gs://bucket/logo.png' },
  },
  brandOverrides: { primaryColor: '#ff0000', accentColor: '#0000ff' },
  logoVariant: 'inverse',
  createdBy: 'annie',
  createdByUid: 'uid-1',
  createdAt: { seconds: 0, nanoseconds: 0 } as never,
  updatedBy: 'annie',
  updatedByUid: 'uid-1',
  updatedAt: { seconds: 0, nanoseconds: 0 } as never,
};

describe('mapTemplateToStepData', () => {
  it('maps templateName from record name', () => {
    const result = mapTemplateToStepData(minimalRecord);
    expect(result.templateName).toBe('Test Template');
  });

  it('maps channel: social → Social', () => {
    const result = mapTemplateToStepData(minimalRecord);
    expect(result.channel).toBe('Social');
  });

  it('maps adSizes using label when present, falling back to WxH', () => {
    const result = mapTemplateToStepData(minimalRecord);
    expect(result.ratios).toEqual(['1200:628', '1080:1080']);
  });

  it('maps datasourceId and datasourceName', () => {
    const result = mapTemplateToStepData(minimalRecord);
    expect(result.selectedFeedId).toBe('feed-1');
    expect(result.selectedFeedName).toBe('Product Feed');
  });

  it('separates feed mappings and upload values', () => {
    const result = mapTemplateToStepData(minimalRecord);
    expect(result.feedMappings).toEqual({ headline: 'title' });
    expect(result.uploadValues).toEqual({ logo: 'gs://bucket/logo.png' });
  });

  it('sets selectedWireframeId from scaffoldId', () => {
    const result = mapTemplateToStepData(minimalRecord);
    expect(result.selectedWireframeId).toBe('wireframe-1');
  });

  it('sets wireframeFile when scaffoldId matches a known wireframe', () => {
    const result = mapTemplateToStepData(minimalRecord);
    expect(result.wireframeFile).toBe('wireframe-1.html');
  });

  it('maps brandOverrides to backgroundColor and accentColor', () => {
    const result = mapTemplateToStepData(minimalRecord);
    expect(result.backgroundColor).toBe('#ff0000');
    expect(result.accentColor).toBe('#0000ff');
  });

  it('maps logoVariant', () => {
    const result = mapTemplateToStepData(minimalRecord);
    expect(result.logoVariant).toBe('inverse');
  });

  // brandOverrides edge cases

  it('does not set backgroundColor when brandOverrides is undefined', () => {
    const record = { ...minimalRecord, brandOverrides: {} as typeof minimalRecord.brandOverrides };
    const result = mapTemplateToStepData(record);
    expect(result.backgroundColor).toBeUndefined();
    expect(result.accentColor).toBeUndefined();
  });

  it('does not set backgroundColor when brandOverrides.primaryColor is undefined', () => {
    const record = { ...minimalRecord, brandOverrides: { accentColor: '#0000ff' } as typeof minimalRecord.brandOverrides };
    const result = mapTemplateToStepData(record);
    expect(result.backgroundColor).toBeUndefined();
    expect(result.accentColor).toBe('#0000ff');
  });

  it('does not set accentColor when brandOverrides.accentColor is undefined', () => {
    const record = { ...minimalRecord, brandOverrides: { primaryColor: '#ff0000' } as typeof minimalRecord.brandOverrides };
    const result = mapTemplateToStepData(record);
    expect(result.backgroundColor).toBe('#ff0000');
    expect(result.accentColor).toBeUndefined();
  });

  // adSizes edge cases

  it('produces ratios: [] when adSizes is empty', () => {
    const result = mapTemplateToStepData({ ...minimalRecord, adSizes: [] });
    expect(result.ratios).toEqual([]);
  });

  // channel mappings

  it("maps channel: 'programmatic' → 'Programmatic'", () => {
    const result = mapTemplateToStepData({ ...minimalRecord, channel: 'programmatic' as const });
    expect(result.channel).toBe('Programmatic');
  });

  it("maps channel: 'print' → 'Print'", () => {
    const result = mapTemplateToStepData({ ...minimalRecord, channel: 'print' as const });
    expect(result.channel).toBe('Print');
  });

  it("maps channel: 'signage' → 'Digital Signage'", () => {
    const result = mapTemplateToStepData({ ...minimalRecord, channel: 'signage' as const });
    expect(result.channel).toBe('Digital Signage');
  });

  // wireframeFile absent case

  it('does not set wireframeFile when scaffoldId matches no known wireframe', () => {
    const result = mapTemplateToStepData({ ...minimalRecord, scaffoldId: 'unknown-scaffold' });
    expect(result.wireframeFile).toBeUndefined();
  });

  // slotMappings

  it('includes slotMappings when a feed mapping has a slotId', () => {
    const result = mapTemplateToStepData({
      ...minimalRecord,
      fieldMappings: { headline: { source: 'feed', column: 'title', slotId: 'slot-A' } },
    });
    expect(result.slotMappings).toEqual({ headline: 'slot-A' });
  });

  it('omits slotMappings from output when no feed mapping has a slotId', () => {
    const result = mapTemplateToStepData({
      ...minimalRecord,
      fieldMappings: { headline: { source: 'feed', column: 'title' } },
    });
    expect(result.slotMappings).toBeUndefined();
  });

  // uploadValues

  it('omits uploadValues from output when no fieldMappings have source: upload', () => {
    const result = mapTemplateToStepData({
      ...minimalRecord,
      fieldMappings: { headline: { source: 'feed', column: 'title' } },
    });
    expect(result.uploadValues).toBeUndefined();
  });

  // brief / aiRequirements

  it('sets brief from aiRequirements.intent when present', () => {
    const result = mapTemplateToStepData({
      ...minimalRecord,
      aiRequirements: { intent: 'promote shoes', keyMessages: [] },
    });
    expect(result.brief).toBe('promote shoes');
  });

  it('falls back to record.brief when aiRequirements is absent', () => {
    const result = mapTemplateToStepData({
      ...minimalRecord,
      aiRequirements: undefined,
      brief: 'my brief',
    });
    expect(result.brief).toBe('my brief');
  });

  it('sets brief to empty string when neither aiRequirements.intent nor brief is present', () => {
    const result = mapTemplateToStepData({
      ...minimalRecord,
      aiRequirements: undefined,
      brief: undefined,
    });
    expect(result.brief).toBe('');
  });

  // logoVariant absent case

  it('does not set logoVariant when logoVariant is undefined', () => {
    const result = mapTemplateToStepData({ ...minimalRecord, logoVariant: undefined });
    expect(result.logoVariant).toBeUndefined();
  });
});
