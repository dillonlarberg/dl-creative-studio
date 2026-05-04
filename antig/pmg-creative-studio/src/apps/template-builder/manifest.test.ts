import { describe, expect, it, vi } from 'vitest';
import manifest from './manifest';
import {
  contextStep,
  intentStep,
  sourceStep,
  mappingStep,
  generateStep,
  refineStep,
  exportStep,
} from './steps';
import type { TemplateBuilderStepData, RequirementField } from './types';
import type { StepContext } from '../types';

/**
 * Manifest shape, validate() fixtures, and — critically — `next()` override
 * tests for context + mapping. The `next()` cases are the contract pressure
 * test that justifies extracting template-builder before any other app.
 */

const buildCtx = (
  stepData: TemplateBuilderStepData,
  mergeStepData: (patch: Partial<TemplateBuilderStepData>) => void = () => {}
): StepContext<TemplateBuilderStepData> => ({
  stepData,
  mergeStepData,
  navigate: () => {},
  client: { slug: 'acme' },
  creativeId: null,
});

describe('template-builder manifest', () => {
  it('has the 7 expected step ids in order', () => {
    expect(manifest.id).toBe('template-builder');
    expect(manifest.basePath).toBe('template-builder');
    expect(manifest.title).toBe('Dynamic Template Builder');
    expect(manifest.steps.map((s) => s.id)).toEqual([
      'context',
      'intent',
      'source',
      'mapping',
      'generate',
      'refine',
      'export',
    ]);
  });

  it('initialStepData returns an empty object', () => {
    expect(manifest.initialStepData()).toEqual({});
  });
});

describe('contextStep.validate', () => {
  it('rejects empty data', () => {
    expect(contextStep.validate({})).toEqual({
      ok: false,
      reason: 'Project title required',
    });
  });

  it('rejects when channel missing', () => {
    expect(contextStep.validate({ jobTitle: 'Q4 Promo' })).toEqual({
      ok: false,
      reason: 'Channel required',
    });
  });

  it('rejects when no sizes selected', () => {
    expect(
      contextStep.validate({ jobTitle: 'Q4 Promo', channel: 'Social' })
    ).toEqual({ ok: false, reason: 'At least one size required' });
  });

  it('accepts a fully-populated context', () => {
    expect(
      contextStep.validate({
        jobTitle: 'Q4 Promo',
        channel: 'Social',
        ratios: ['1:1'],
      })
    ).toEqual({ ok: true });
  });

  it('rejects whitespace-only title', () => {
    expect(
      contextStep.validate({
        jobTitle: '   ',
        channel: 'Social',
        ratios: ['1:1'],
      })
    ).toEqual({ ok: false, reason: 'Project title required' });
  });
});

describe('contextStep.next — wireframe skip-ahead (mirrors monolith line 1219)', () => {
  it('returns undefined (advance to intent) when no wireframe selected', () => {
    const result = contextStep.next!(buildCtx({}));
    expect(result).toBeUndefined();
  });

  it('returns "source" when a wireframe is selected', () => {
    const result = contextStep.next!(
      buildCtx({ selectedWireframe: 'original_2' })
    );
    expect(result).toBe('source');
  });

  it('auto-populates requirements from the wireframe minRequirements', () => {
    const merge = vi.fn();
    contextStep.next!(
      buildCtx({ selectedWireframe: 'original_2' }, merge)
    );
    expect(merge).toHaveBeenCalledTimes(1);
    const patch = merge.mock.calls[0][0]!;
    expect(patch.areRequirementsApproved).toBe(true);
    const reqs = patch.requirements as RequirementField[];
    expect(reqs.length).toBeGreaterThan(0);
    // 'Logo' becomes a Brand category
    const logo = reqs.find((r) => r.label === 'Logo');
    expect(logo).toBeDefined();
    expect(logo!.category).toBe('Brand');
    expect(logo!.source).toBe('Creative House');
  });

  it('does NOT call mergeStepData when wireframe id does not match a known wireframe', () => {
    const merge = vi.fn();
    const result = contextStep.next!(
      buildCtx({ selectedWireframe: 'not-real' }, merge)
    );
    expect(result).toBe('source'); // still skips intent
    expect(merge).not.toHaveBeenCalled();
  });
});

describe('intentStep.validate', () => {
  it('rejects empty prompt', () => {
    expect(intentStep.validate({})).toEqual({
      ok: false,
      reason: 'Creative prompt required',
    });
  });

  it('rejects when requirements are not yet synthesized', () => {
    expect(intentStep.validate({ prompt: 'A bold hero layout' })).toEqual({
      ok: false,
      reason: 'Synthesize requirements before continuing',
    });
  });

  it('rejects when requirements not approved', () => {
    expect(
      intentStep.validate({
        prompt: 'A bold hero layout',
        requirements: [
          { id: 'h', label: 'Headline', category: 'Dynamic', source: 'Feed', type: 'text' },
        ],
      })
    ).toEqual({ ok: false, reason: 'Requirements must be approved' });
  });

  it('accepts approved + populated', () => {
    expect(
      intentStep.validate({
        prompt: 'A bold hero layout',
        requirements: [
          { id: 'h', label: 'Headline', category: 'Dynamic', source: 'Feed', type: 'text' },
        ],
        areRequirementsApproved: true,
      })
    ).toEqual({ ok: true });
  });
});

describe('sourceStep.validate', () => {
  it('rejects empty', () => {
    expect(sourceStep.validate({})).toMatchObject({ ok: false });
  });

  it('accepts a chosen feed', () => {
    expect(
      sourceStep.validate({ selectedFeed: { name: 'creative_insights_data_export' } })
    ).toEqual({ ok: true });
  });
});

describe('mappingStep.validate', () => {
  it('passes when no Dynamic requirements exist', () => {
    expect(mappingStep.validate({})).toEqual({ ok: true });
    expect(
      mappingStep.validate({
        requirements: [
          { id: 'logo', label: 'Logo', category: 'Brand', source: 'Creative House', type: 'image' },
        ],
      })
    ).toEqual({ ok: true });
  });

  it('rejects when a Dynamic requirement is unmapped', () => {
    expect(
      mappingStep.validate({
        requirements: [
          { id: 'h', label: 'Headline', category: 'Dynamic', source: 'Feed', type: 'text' },
        ],
        feedMappings: {},
      })
    ).toEqual({ ok: false, reason: 'Map a feed field to "Headline"' });
  });

  it('passes when all Dynamic requirements are mapped', () => {
    expect(
      mappingStep.validate({
        requirements: [
          { id: 'h', label: 'Headline', category: 'Dynamic', source: 'Feed', type: 'text' },
          { id: 'i', label: 'Image', category: 'Dynamic', source: 'Feed', type: 'image' },
        ],
        feedMappings: { h: 'product_title', i: 'image_url' },
      })
    ).toEqual({ ok: true });
  });
});

describe('mappingStep.next — wireframe skip-ahead (mirrors monolith lines 1245+1248)', () => {
  it('returns "refine" when a wireframe is selected (skips generate)', () => {
    expect(
      mappingStep.next!(buildCtx({ selectedWireframe: 'original_2' }))
    ).toBe('refine');
  });

  it('returns undefined (advance to generate) when no wireframe is selected', () => {
    expect(mappingStep.next!(buildCtx({}))).toBeUndefined();
  });

  it('returns undefined when selectedWireframe is empty string', () => {
    expect(mappingStep.next!(buildCtx({ selectedWireframe: '' }))).toBeUndefined();
  });

  it('returns "refine" regardless of whether feedMappings are present', () => {
    expect(
      mappingStep.next!(
        buildCtx({
          selectedWireframe: 'original_3',
          feedMappings: { h: 'product_title' },
        })
      )
    ).toBe('refine');
  });
});

describe('generateStep.validate', () => {
  it('rejects empty', () => {
    expect(generateStep.validate({})).toMatchObject({ ok: false });
  });

  it('rejects when candidates exist but none selected', () => {
    expect(
      generateStep.validate({ candidates: [{}, {}], selectedCandidateIndex: null })
    ).toMatchObject({ ok: false, reason: 'Select a candidate to continue' });
  });

  it('accepts when a candidate is selected', () => {
    expect(
      generateStep.validate({ candidates: [{}, {}], selectedCandidateIndex: 0 })
    ).toEqual({ ok: true });
  });
});

describe('refineStep.validate / exportStep.validate', () => {
  it('refine has no hard gate', () => {
    expect(refineStep.validate({})).toEqual({ ok: true });
  });
  it('export has no hard gate', () => {
    expect(exportStep.validate({})).toEqual({ ok: true });
  });
});
