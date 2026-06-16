import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// The design system is a symlinked local workspace shipping React 17, whose
// element $$typeof is rejected by React 19 in jsdom. Replace the Button with a
// native passthrough for tests (file-scoped; hoisted). Behavior assertions are
// unaffected — they check text/roles/handlers, not which component rendered.
vi.mock('@agencypmg/alli-design-system', async (importOriginal) => {
  const React = await import('react');
  const original = await importOriginal<typeof import('@agencypmg/alli-design-system')>();
  return {
    ...original,
    Button: React.forwardRef<HTMLButtonElement, React.ComponentPropsWithRef<'button'>>(
      function Button({ children, ...props }, ref) {
        return React.createElement('button', { ...props, ref }, children);
      }
    ),
  };
});

import { AppCard } from './DashboardPage';
import type { AppManifest } from '../apps/types';

const base: AppManifest = {
  id: 'ad-resizing',
  basePath: 'ad-resizing',
  title: 'Resize Image',
  description: 'Resize a creative for any placement.',
  status: 'live',
  steps: [],
  initialStepData: () => ({}),
};

const withOverview: AppManifest = {
  ...base,
  overview: {
    blurb: 'One creative, resized for every placement.',
    before: '/app-overviews/ad-resizing/before.webp',
    after: ['/app-overviews/ad-resizing/after-1.webp'],
  },
};

describe('AppCard', () => {
  it('shows the More Info button when the manifest has an overview', () => {
    render(<AppCard manifest={withOverview} onOpen={() => {}} />);
    expect(screen.getByRole('button', { name: /more info/i })).toBeInTheDocument();
  });

  it('hides More Info when there is no overview, and Open still fires', () => {
    const onOpen = vi.fn();
    render(<AppCard manifest={base} onOpen={onOpen} />);
    expect(screen.queryByRole('button', { name: /more info/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /open/i }));
    expect(onOpen).toHaveBeenCalledOnce();
  });
});
