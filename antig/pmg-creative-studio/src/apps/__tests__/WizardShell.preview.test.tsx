import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { AppManifest, StepData, WizardStep } from '../types';
import { WizardShell } from '../../platform/wizard/WizardShell';

type PreviewData = StepData;

function makePreviewManifest(): AppManifest<PreviewData> {
  const stub: WizardStep<PreviewData> = {
    id: 'noop',
    name: 'Noop',
    validate: () => ({ ok: true }),
    render: () => <p data-testid="should-not-render">unreachable</p>,
  };
  return {
    id: 'video-stitch',
    basePath: 'video-stitch',
    title: 'Video Stitch',
    status: 'preview',
    steps: [stub],
    initialStepData: () => ({}),
  };
}

function makeLiveManifest(): AppManifest<PreviewData> {
  return {
    ...makePreviewManifest(),
    status: 'live',
  };
}

function renderShell(manifest: AppManifest<PreviewData>) {
  return render(
    <MemoryRouter initialEntries={['/wizard']}>
      <Routes>
        <Route path="/wizard" element={<WizardShell manifest={manifest} />} />
        <Route
          path="/wizard/:stepId"
          element={<WizardShell manifest={manifest} />}
        />
      </Routes>
    </MemoryRouter>
  );
}

afterEach(() => cleanup());

describe('WizardShell preview status (Step 0.75 tracer)', () => {
  it('Tracer 1a: status="preview" renders Coming Soon panel and back link', () => {
    renderShell(makePreviewManifest());

    expect(screen.getByTestId('wizard-shell-preview')).toBeInTheDocument();
    expect(screen.getByTestId('wizard-preview-coming-soon')).toBeInTheDocument();
    expect(screen.getByTestId('wizard-preview-back')).toHaveAttribute('href', '/');
    expect(screen.getByText(/Coming soon/i)).toBeInTheDocument();
    expect(screen.getByText(/Video Stitch is on the way/i)).toBeInTheDocument();
  });

  it('Tracer 1b: status="preview" suppresses wizard chrome (no Continue, no checklist, no step body)', () => {
    renderShell(makePreviewManifest());

    expect(
      screen.queryByRole('button', { name: /Continue Upstream/i })
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId('wizard-requirements')).not.toBeInTheDocument();
    expect(screen.queryByTestId('wizard-shell')).not.toBeInTheDocument();
    expect(screen.queryByTestId('should-not-render')).not.toBeInTheDocument();
  });

  it('Tracer 2: status="live" does NOT take the preview branch (live chrome covered by WizardShell.test.tsx)', () => {
    // Mounting a live manifest end-to-end requires <ClientProvider> + the
    // full wizard runtime — that path is exhaustively covered by
    // src/platform/wizard/WizardShell.test.tsx (12 tests). Here we only
    // assert the early-return condition: rendering with a live manifest
    // throws because useClientContext is required, proving the preview
    // branch was NOT taken.
    expect(() => renderShell(makeLiveManifest())).toThrow(
      /useClientContext must be used inside <ClientProvider>/
    );
  });

  it('Tracer 3: type-level — AppManifest carries optional status and requiresBrandStandards fields', () => {
    const m: AppManifest<PreviewData> = makePreviewManifest();
    // If these fields disappear, this file fails to typecheck.
    const status: 'live' | 'preview' | undefined = m.status;
    const gate: boolean | undefined = m.requiresBrandStandards;
    expect(status).toBe('preview');
    expect(gate).toBeUndefined();
  });
});
