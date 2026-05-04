import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act, cleanup } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { AppManifest, ValidationResult, WizardStep } from '../../apps/types';
import { WizardShell } from './WizardShell';
import { creativeService } from '../../services/creative';

vi.mock('../../services/creative', () => ({
  creativeService: {
    createCreative: vi.fn(async () => 'creative-new'),
    updateCreative: vi.fn(async () => undefined),
    getCreative: vi.fn(async () => null),
  },
}));

vi.mock('../client/useCurrentClient', () => ({
  useCurrentClient: () => ({
    currentClient: { slug: 'acme', name: 'Acme', id: 'acme-1' },
    allowedClients: [],
    isLoading: false,
    error: null,
  }),
}));

interface FakeData {
  ready?: boolean;
  foo?: number;
}

function makeManifest(overrides?: {
  validateA?: WizardStep<FakeData>['validate'];
  nextB?: WizardStep<FakeData>['next'];
  onLeaveA?: WizardStep<FakeData>['onLeave'];
  onEnterB?: WizardStep<FakeData>['onEnter'];
}): AppManifest<FakeData> {
  const validateA: WizardStep<FakeData>['validate'] =
    overrides?.validateA ??
    ((data: FakeData): ValidationResult =>
      data.ready ? { ok: true } : { ok: false, reason: 'must be ready' });

  const stepA: WizardStep<FakeData> = {
    id: 'a',
    name: 'Step A',
    validate: validateA,
    onLeave: overrides?.onLeaveA,
    render: ({ stepData, mergeStepData }) => (
      <div>
        <p data-testid="step-a-body">A body — ready={String(stepData.ready ?? false)}</p>
        <button
          type="button"
          onClick={() => mergeStepData({ ready: true })}
          data-testid="set-ready"
        >
          set-ready
        </button>
        <button
          type="button"
          onClick={() => mergeStepData({ foo: 1 })}
          data-testid="set-foo"
        >
          set-foo
        </button>
      </div>
    ),
  };

  const stepB: WizardStep<FakeData> = {
    id: 'b',
    name: 'Step B',
    validate: () => ({ ok: true }),
    next: overrides?.nextB,
    onEnter: overrides?.onEnterB,
    render: ({ stepData }) => (
      <p data-testid="step-b-body">B body — foo={String(stepData.foo ?? 'none')}</p>
    ),
  };

  return {
    id: 'edit-image',
    basePath: 'fake',
    title: 'Fake App',
    steps: [stepA, stepB],
    initialStepData: () => ({}),
  };
}

function renderShell(
  manifest: AppManifest<FakeData>,
  initialEntries: string[] = ['/wizard']
) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
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

function installFakeLocalStorage() {
  const store = new Map<string, string>();
  const ls: Storage = {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (k: string) => (store.has(k) ? (store.get(k) as string) : null),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    removeItem: (k: string) => {
      store.delete(k);
    },
    setItem: (k: string, v: string) => {
      store.set(k, String(v));
    },
  };
  Object.defineProperty(window, 'localStorage', {
    value: ls,
    configurable: true,
    writable: true,
  });
}

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  vi.clearAllMocks();
  installFakeLocalStorage();
  vi.mocked(creativeService.createCreative).mockResolvedValue('creative-new');
  vi.mocked(creativeService.updateCreative).mockResolvedValue(undefined);
  vi.mocked(creativeService.getCreative).mockResolvedValue(null);
});

describe('WizardShell', () => {
  it('initial render shows step a', async () => {
    renderShell(makeManifest());
    expect(await screen.findByTestId('step-a-body')).toBeInTheDocument();
  });

  it('blocks Next when validate returns ok:false and surfaces the reason', async () => {
    renderShell(makeManifest());
    await screen.findByTestId('step-a-body');

    const nextButton = screen.getByRole('button', { name: 'Next' });
    await act(async () => {
      nextButton.click();
    });

    expect(screen.getByTestId('wizard-validation-error')).toHaveTextContent(
      'must be ready'
    );
    expect(screen.getByTestId('step-a-body')).toBeInTheDocument();
    expect(screen.queryByTestId('step-b-body')).not.toBeInTheDocument();
  });

  it('on validate ok:true calls onLeave(a) then onEnter(b) then renders b', async () => {
    const order: string[] = [];
    const manifest = makeManifest({
      validateA: () => ({ ok: true }),
      onLeaveA: () => {
        order.push('leave-a');
      },
      onEnterB: () => {
        order.push('enter-b');
      },
    });
    renderShell(manifest);
    await screen.findByTestId('step-a-body');

    await act(async () => {
      screen.getByRole('button', { name: 'Next' }).click();
    });

    await waitFor(() =>
      expect(screen.getByTestId('step-b-body')).toBeInTheDocument()
    );
    expect(order).toEqual(['leave-a', 'enter-b']);
  });

  it('step.next() returning "a" jumps from b back to a (out-of-order)', async () => {
    const manifest = makeManifest({
      validateA: () => ({ ok: true }),
      nextB: () => 'a',
    });
    renderShell(manifest, ['/wizard/b']);
    await screen.findByTestId('step-b-body');

    await act(async () => {
      screen.getByRole('button', { name: 'Next' }).click();
    });

    await waitFor(() =>
      expect(screen.getByTestId('step-a-body')).toBeInTheDocument()
    );
  });

  it('step.next() returning an unknown id console.warns and falls back to advance-by-index', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const manifest = makeManifest({
      validateA: () => ({ ok: true }),
    });
    // Override step a with a `next` that returns garbage so a -> next() = 'zz'
    // should fall back to a+1 = b.
    manifest.steps[0].next = () => 'zz-not-a-step';

    renderShell(manifest);
    await screen.findByTestId('step-a-body');

    await act(async () => {
      screen.getByRole('button', { name: 'Next' }).click();
    });

    await waitFor(() =>
      expect(screen.getByTestId('step-b-body')).toBeInTheDocument()
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('zz-not-a-step')
    );
    warnSpy.mockRestore();
  });

  it('persistence: mergeStepData({foo:1}) followed by remount restores {foo:1}', async () => {
    const manifest = makeManifest();

    // First mount: trigger mergeStepData -> creates record + persists.
    const first = renderShell(manifest);
    await screen.findByTestId('step-a-body');

    await act(async () => {
      screen.getByTestId('set-foo').click();
    });

    // Wait for debounced persist + creative create.
    await waitFor(() =>
      expect(creativeService.createCreative).toHaveBeenCalledWith(
        'acme',
        'edit-image'
      )
    );
    await waitFor(() =>
      expect(creativeService.updateCreative).toHaveBeenCalled()
    );

    // localStorage should now contain the new id under the canonical key.
    expect(window.localStorage.getItem('creative_acme_edit-image')).toBe(
      'creative-new'
    );

    first.unmount();

    // Configure the getCreative mock to return the persisted stepData on remount.
    vi.mocked(creativeService.getCreative).mockResolvedValue({
      id: 'creative-new',
      clientSlug: 'acme',
      useCaseId: 'edit-image',
      status: 'draft',
      stepData: { foo: 1 },
      currentStep: 0,
      createdAt: null,
      updatedAt: null,
    });

    renderShell(manifest);

    // After hydration we should be on step a but stepData.foo should be 1.
    // Step a renders ready state but we use the b-body assertion via navigating.
    // Instead, verify directly: the body of a shows ready=false but the
    // persisted `foo` field is in stepData. Easiest visible probe: navigate to b.
    await screen.findByTestId('step-a-body');
    await waitFor(() =>
      expect(creativeService.getCreative).toHaveBeenCalledWith('creative-new')
    );

    // Make validate a pass and click next so we land on b which renders foo.
    manifest.steps[0].validate = () => ({ ok: true });
    await act(async () => {
      screen.getByRole('button', { name: 'Next' }).click();
    });
    await waitFor(() =>
      expect(screen.getByTestId('step-b-body')).toHaveTextContent('foo=1')
    );
  });

  it('resume: ?creative=abc triggers getCreative and hydrates stepData', async () => {
    vi.mocked(creativeService.getCreative).mockResolvedValue({
      id: 'abc',
      clientSlug: 'acme',
      useCaseId: 'edit-image',
      status: 'draft',
      stepData: { foo: 7 },
      currentStep: 0,
      createdAt: null,
      updatedAt: null,
    });

    const manifest = makeManifest({ validateA: () => ({ ok: true }) });
    renderShell(manifest, ['/wizard?creative=abc']);

    await waitFor(() =>
      expect(creativeService.getCreative).toHaveBeenCalledWith('abc')
    );

    // Confirm hydration by advancing to b which renders the foo value.
    await screen.findByTestId('step-a-body');
    await act(async () => {
      screen.getByRole('button', { name: 'Next' }).click();
    });
    await waitFor(() =>
      expect(screen.getByTestId('step-b-body')).toHaveTextContent('foo=7')
    );
  });

  it('URL sync: navigating to step b writes :stepId=b into the URL via replace', async () => {
    const manifest = makeManifest({ validateA: () => ({ ok: true }) });
    const seenPaths: string[] = [];
    function PathProbe() {
      const loc = useLocation();
      seenPaths.push(loc.pathname);
      return null;
    }
    render(
      <MemoryRouter initialEntries={['/wizard']}>
        <PathProbe />
        <Routes>
          <Route path="/wizard" element={<WizardShell manifest={manifest} />} />
          <Route
            path="/wizard/:stepId"
            element={<WizardShell manifest={manifest} />}
          />
        </Routes>
      </MemoryRouter>
    );

    await screen.findByTestId('step-a-body');
    expect(seenPaths.at(-1)).toBe('/wizard');

    await act(async () => {
      screen.getByRole('button', { name: 'Next' }).click();
    });

    await waitFor(() =>
      expect(screen.getByTestId('step-b-body')).toBeInTheDocument()
    );
    // breadcrumb-b should be active; the URL's :stepId param drives that.
    expect(
      screen.getByTestId('breadcrumb-b').getAttribute('data-active')
    ).toBe('true');
    // The latest pathname should be /wizard/b, written via navigate.
    expect(seenPaths.at(-1)).toBe('/wizard/b');
  });
});
