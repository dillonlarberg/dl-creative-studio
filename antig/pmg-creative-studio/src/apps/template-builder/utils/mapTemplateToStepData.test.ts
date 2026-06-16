import { describe, it, expect, vi } from 'vitest';
import { mapTemplateToStepData } from './mapTemplateToStepData';
import type { TemplateLibraryRecord } from '../../../services/templateLibrary.types';

vi.mock('../../../constants/useCases', () => ({
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
});
