import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import React from 'react';
import { useStepNavigation } from './useStepNavigation';
import type { TemplateBuilderStep } from '../types';
import type { StepContext } from '../../types';
import type { TemplateBuilderStepData } from '../types';

// Track the current URL for navigation assertions
function LocationTracker({ onPathname }: { onPathname: (p: string) => void }) {
  const loc = useLocation();
  React.useEffect(() => { onPathname(loc.pathname); }, [loc.pathname, onPathname]);
  return null;
}

// Helper: render the hook inside a route with /:stepId param
function renderWithRouter(
  initialPath: string,
  stepId: string,
  hookArgs: Parameters<typeof useStepNavigation>[0],
  onPathname?: (p: string) => void
) {
  let result: ReturnType<typeof useStepNavigation> | undefined;

  function Harness() {
    result = useStepNavigation(hookArgs);
    return null;
  }

  render(
    <MemoryRouter initialEntries={[initialPath]}>
      {onPathname && <LocationTracker onPathname={onPathname} />}
      <Routes>
        <Route path={`/app/:stepId`} element={<Harness />} />
        <Route path={`/app`} element={<Harness />} />
      </Routes>
    </MemoryRouter>
  );

  return () => result!;
}

// Minimal step factory
function makeStep(
  id: string,
  name: string,
  validate: TemplateBuilderStep['validate'] = () => ({ ok: true }),
  overrides: Partial<TemplateBuilderStep> = {}
): TemplateBuilderStep {
  return {
    id,
    name,
    render: () => null,
    validate,
    ...overrides,
  };
}

const emptyStepData: TemplateBuilderStepData = {};

function makeBuildContext(stepData = emptyStepData): () => StepContext<TemplateBuilderStepData> {
  return () => ({
    stepData,
    mergeStepData: vi.fn(),
    navigate: vi.fn(),
    client: { slug: 'acme' as never },
    creativeId: null,
  });
}

describe('useStepNavigation', () => {
  describe('findIndex', () => {
    it('returns step 0 when URL step ID is unknown', () => {
      const steps = [makeStep('setup', 'Setup'), makeStep('design', 'Design')];
      const getResult = renderWithRouter(
        '/app/nonexistent',
        'nonexistent',
        { steps, buildContext: makeBuildContext(), stepData: emptyStepData }
      );
      expect(getResult().currentStepIndex).toBe(0);
    });

    it('returns step 0 when no step ID in URL', () => {
      const steps = [makeStep('setup', 'Setup'), makeStep('design', 'Design')];
      const getResult = renderWithRouter(
        '/app',
        '',
        { steps, buildContext: makeBuildContext(), stepData: emptyStepData }
      );
      expect(getResult().currentStepIndex).toBe(0);
    });

    it('returns correct index for known step ID', () => {
      const steps = [makeStep('setup', 'Setup'), makeStep('design', 'Design')];
      const getResult = renderWithRouter(
        '/app/design',
        'design',
        { steps, buildContext: makeBuildContext(), stepData: emptyStepData }
      );
      expect(getResult().currentStepIndex).toBe(1);
    });
  });

  describe('validation reactivity', () => {
    it('validation.ok is false when validate returns ok:false', () => {
      const validate = vi.fn(() => ({ ok: false as const, reason: 'missing field' }));
      const steps = [makeStep('setup', 'Setup', validate)];
      const getResult = renderWithRouter(
        '/app/setup',
        'setup',
        { steps, buildContext: makeBuildContext(), stepData: emptyStepData }
      );
      expect(getResult().validation.ok).toBe(false);
    });

    it('validation.ok is true when validate returns ok:true', () => {
      const validate = vi.fn(() => ({ ok: true as const }));
      const steps = [makeStep('setup', 'Setup', validate)];
      const getResult = renderWithRouter(
        '/app/setup',
        'setup',
        { steps, buildContext: makeBuildContext(), stepData: emptyStepData }
      );
      expect(getResult().validation.ok).toBe(true);
    });

    it('isNextDisabled is true when validation fails', () => {
      const steps = [makeStep('setup', 'Setup', () => ({ ok: false as const }))];
      const getResult = renderWithRouter(
        '/app/setup',
        'setup',
        { steps, buildContext: makeBuildContext(), stepData: emptyStepData }
      );
      expect(getResult().isNextDisabled).toBe(true);
    });
  });

  describe('isLastStep', () => {
    it('returns true on the final step', () => {
      const steps = [makeStep('setup', 'Setup'), makeStep('publish', 'Publish')];
      const getResult = renderWithRouter(
        '/app/publish',
        'publish',
        { steps, buildContext: makeBuildContext(), stepData: emptyStepData }
      );
      expect(getResult().isLastStep).toBe(true);
    });

    it('returns false on non-final steps', () => {
      const steps = [makeStep('setup', 'Setup'), makeStep('publish', 'Publish')];
      const getResult = renderWithRouter(
        '/app/setup',
        'setup',
        { steps, buildContext: makeBuildContext(), stepData: emptyStepData }
      );
      expect(getResult().isLastStep).toBe(false);
    });
  });

  describe('goNext', () => {
    it('does not navigate when validation fails', async () => {
      const steps = [makeStep('setup', 'Setup', () => ({ ok: false as const })), makeStep('design', 'Design')];
      const pathHistory: string[] = [];
      const getResult = renderWithRouter(
        '/app/setup',
        'setup',
        { steps, buildContext: makeBuildContext(), stepData: emptyStepData },
        (p) => pathHistory.push(p)
      );
      await act(async () => { await getResult().goNext(); });
      // Only the initial /app/setup should be in history — no navigation
      expect(pathHistory.filter(p => p !== '/app/setup')).toHaveLength(0);
    });

    it('fires onLeave then onEnter in order before navigating', async () => {
      const order: string[] = [];
      const onLeave = vi.fn(async () => { order.push('onLeave'); });
      const onEnter = vi.fn(async () => { order.push('onEnter'); });
      const steps = [
        makeStep('setup', 'Setup', () => ({ ok: true as const }), { onLeave }),
        makeStep('design', 'Design', () => ({ ok: true as const }), { onEnter }),
      ];
      const pathHistory: string[] = [];
      const getResult = renderWithRouter(
        '/app/setup',
        'setup',
        { steps, buildContext: makeBuildContext(), stepData: emptyStepData },
        (p) => pathHistory.push(p)
      );
      await act(async () => { await getResult().goNext(); });
      expect(order).toEqual(['onLeave', 'onEnter']);
      await waitFor(() => {
        expect(pathHistory).toContain('/app/design');
      });
    });

    it('sets validationError from validation.reason when validation fails', async () => {
      const steps = [makeStep('setup', 'Setup', () => ({ ok: false as const, reason: 'fill in name' }))];
      const getResult = renderWithRouter(
        '/app/setup',
        'setup',
        { steps, buildContext: makeBuildContext(), stepData: emptyStepData }
      );
      await act(async () => { await getResult().goNext(); });
      expect(getResult().validationError).toBe('fill in name');
    });

    it('sets isLoading during async submit and clears it after', async () => {
      let resolveSubmit!: () => void;
      const submitPromise = new Promise<{ nextStepId?: string }>((res) => { resolveSubmit = () => res({}); });
      const submit = vi.fn(() => submitPromise);
      const steps = [
        makeStep('setup', 'Setup', () => ({ ok: true as const }), { submit }),
        makeStep('design', 'Design'),
      ];
      const getResult = renderWithRouter(
        '/app/setup',
        'setup',
        { steps, buildContext: makeBuildContext(), stepData: emptyStepData }
      );
      // Start goNext without awaiting
      act(() => { void getResult().goNext(); });
      // isLoading should be true while submit is pending
      await waitFor(() => expect(getResult().isLoading).toBe(true));
      // Resolve the submit
      await act(async () => { resolveSubmit(); });
      // isLoading should clear
      await waitFor(() => expect(getResult().isLoading).toBe(false));
    });
  });

  describe('goBack', () => {
    it('does not fire onLeave or onEnter — free move', async () => {
      const onLeave = vi.fn();
      const onEnter = vi.fn();
      const steps = [
        makeStep('setup', 'Setup', () => ({ ok: true as const }), { onLeave }),
        makeStep('design', 'Design', () => ({ ok: true as const }), { onEnter }),
      ];
      const pathHistory: string[] = [];
      const getResult = renderWithRouter(
        '/app/design',
        'design',
        { steps, buildContext: makeBuildContext(), stepData: emptyStepData },
        (p) => pathHistory.push(p)
      );
      act(() => { getResult().goBack(); });
      await waitFor(() => {
        expect(pathHistory).toContain('/app/setup');
      });
      expect(onLeave).not.toHaveBeenCalled();
      expect(onEnter).not.toHaveBeenCalled();
    });

    it('does nothing on step 0', () => {
      const steps = [makeStep('setup', 'Setup'), makeStep('design', 'Design')];
      const pathHistory: string[] = [];
      const getResult = renderWithRouter(
        '/app/setup',
        'setup',
        { steps, buildContext: makeBuildContext(), stepData: emptyStepData },
        (p) => pathHistory.push(p)
      );
      act(() => { getResult().goBack(); });
      expect(pathHistory.filter(p => p !== '/app/setup')).toHaveLength(0);
    });
  });

  describe('jumpTo', () => {
    it('navigates backward (index < currentStepIndex)', async () => {
      const steps = [makeStep('setup', 'Setup'), makeStep('design', 'Design'), makeStep('publish', 'Publish')];
      const pathHistory: string[] = [];
      const getResult = renderWithRouter(
        '/app/design',
        'design',
        { steps, buildContext: makeBuildContext(), stepData: emptyStepData },
        (p) => pathHistory.push(p)
      );
      act(() => { getResult().jumpTo(0); });
      await waitFor(() => {
        expect(pathHistory).toContain('/app/setup');
      });
    });

    it('does NOT navigate to the current step (index === currentStepIndex)', () => {
      const steps = [makeStep('setup', 'Setup'), makeStep('design', 'Design')];
      const pathHistory: string[] = [];
      const getResult = renderWithRouter(
        '/app/design',
        'design',
        { steps, buildContext: makeBuildContext(), stepData: emptyStepData },
        (p) => pathHistory.push(p)
      );
      act(() => { getResult().jumpTo(1); }); // index 1 === currentStepIndex 1
      expect(pathHistory.filter(p => p !== '/app/design')).toHaveLength(0);
    });

    it('does NOT navigate forward (index > currentStepIndex)', () => {
      const steps = [makeStep('setup', 'Setup'), makeStep('design', 'Design'), makeStep('publish', 'Publish')];
      const pathHistory: string[] = [];
      const getResult = renderWithRouter(
        '/app/setup',
        'setup',
        { steps, buildContext: makeBuildContext(), stepData: emptyStepData },
        (p) => pathHistory.push(p)
      );
      act(() => { getResult().jumpTo(2); }); // forward jump — should be blocked
      expect(pathHistory.filter(p => p !== '/app/setup')).toHaveLength(0);
    });
  });
});
