import { describe, expect, it } from 'vitest';
import manifest from './manifest';
import { setupStep, designStep, publishStep } from './steps';

describe('template-builder manifest', () => {
  it('has the 3 expected step ids in order', () => {
    expect(manifest.id).toBe('template-builder');
    expect(manifest.basePath).toBe('template-builder');
    expect(manifest.title).toBe('Template Builder');
    expect(manifest.steps.map((s) => s.id)).toEqual(['setup', 'design', 'publish']);
  });

  it('initialStepData returns an object with a templateName', () => {
    const data = manifest.initialStepData();
    expect(typeof data.templateName).toBe('string');
    expect(data.templateName!.length).toBeGreaterThan(0);
  });
});

describe('setupStep.validate', () => {
  it('rejects empty data', () => {
    const result = setupStep.validate({});
    expect(result.ok).toBe(false);
  });

  it('rejects when channel is missing', () => {
    const result = setupStep.validate({ templateName: 'My Template' });
    expect(result.ok).toBe(false);
  });

  it('rejects when ratios are missing', () => {
    const result = setupStep.validate({ templateName: 'My Template', channel: 'Social' });
    expect(result.ok).toBe(false);
  });

  it('rejects when data source is missing', () => {
    const result = setupStep.validate({
      templateName: 'My Template',
      channel: 'Social',
      ratios: ['1:1'],
    });
    expect(result.ok).toBe(false);
  });

  it('accepts a fully-populated setup', () => {
    expect(
      setupStep.validate({
        templateName: 'My Template',
        channel: 'Social',
        ratios: ['1:1'],
        selectedFeedId: 'feed-123',
      })
    ).toEqual({ ok: true });
  });

  it('rejects whitespace-only template name', () => {
    const result = setupStep.validate({
      templateName: '   ',
      channel: 'Social',
      ratios: ['1:1'],
      selectedFeedId: 'feed-123',
    });
    expect(result.ok).toBe(false);
  });
});

describe('designStep.validate', () => {
  it('rejects when feedMappings is empty', () => {
    expect(designStep.validate({})).toMatchObject({
      ok: false,
      reason: 'Map at least one field to continue',
    });
  });

  it('rejects when feedMappings has no keys', () => {
    expect(designStep.validate({ feedMappings: {} })).toMatchObject({ ok: false });
  });

  it('accepts when at least one mapping exists', () => {
    expect(
      designStep.validate({ feedMappings: { headline: 'product_title' } })
    ).toEqual({ ok: true });
  });
});

describe('publishStep.validate', () => {
  it('always passes (no hard gate)', () => {
    expect(publishStep.validate({})).toEqual({ ok: true });
  });
});
