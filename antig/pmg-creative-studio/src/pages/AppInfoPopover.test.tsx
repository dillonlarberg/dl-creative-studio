import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { AppInfoPopover } from './AppInfoPopover';
import type { AppOverview } from '../apps/types';

// The design system is a symlinked local workspace that ships React 17.
// React 19 (used by this app) rejects elements created with the older
// Symbol.for('react.element') $$typeof — it only accepts the new
// Symbol.for('react.transitional.element'). This causes a runtime throw
// in jsdom tests. Mocking the package to use native HTML elements bypasses
// the version mismatch for test purposes, without weakening any assertions
// (tests check aria attributes, text content, and behaviour — not which
// library component was rendered). Scoped to this file via vi.mock hoisting.
vi.mock('@agencypmg/alli-design-system', async (importOriginal) => {
  const React = await import('react');
  const original = await importOriginal<typeof import('@agencypmg/alli-design-system')>();
  return {
    ...original,
    // Passthrough Button that forwards ref and spreads all props onto <button>
    Button: React.forwardRef<HTMLButtonElement, React.ComponentPropsWithRef<'button'>>(
      function Button({ children, ...props }, ref) {
        return React.createElement('button', { ...props, ref }, children);
      }
    ),
  };
});

const overview: AppOverview = {
  blurb: 'One creative, resized for every placement.',
  before: '/app-overviews/ad-resizing/before.webp',
  after: [
    '/app-overviews/ad-resizing/after-1.webp',
    '/app-overviews/ad-resizing/after-2.webp',
    '/app-overviews/ad-resizing/after-3.webp',
  ],
};

describe('AppInfoPopover', () => {
  it('renders nothing when overview is absent', () => {
    const { container } = render(<AppInfoPopover title="Resize Image" />);
    expect(screen.queryByRole('button', { name: /more info/i })).toBeNull();
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the trigger but no popover content until opened', () => {
    render(<AppInfoPopover title="Resize Image" overview={overview} />);
    const btn = screen.getByRole('button', { name: /more info/i });
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(overview.blurb)).toBeNull();
  });

  it('opens on focus: blurb + before + every after image, with aria wiring', () => {
    render(<AppInfoPopover title="Resize Image" overview={overview} />);
    const btn = screen.getByRole('button', { name: /more info/i });
    fireEvent.focus(btn);

    const region = screen.getByRole('region', { name: /resize image overview/i });
    expect(within(region).getByText(overview.blurb)).toBeInTheDocument();
    expect(within(region).getAllByRole('img')).toHaveLength(4);
    expect(btn).toHaveAttribute('aria-expanded', 'true');
    expect(btn).toHaveAttribute('aria-describedby', region.id);
  });

  it('toggles on click (tap/touch path)', () => {
    render(<AppInfoPopover title="Resize Image" overview={overview} />);
    const btn = screen.getByRole('button', { name: /more info/i });
    fireEvent.click(btn);
    expect(screen.getByText(overview.blurb)).toBeInTheDocument();
    fireEvent.click(btn);
    expect(screen.queryByText(overview.blurb)).toBeNull();
  });

  it('closes on Escape', () => {
    render(<AppInfoPopover title="Resize Image" overview={overview} />);
    fireEvent.focus(screen.getByRole('button', { name: /more info/i }));
    expect(screen.getByText(overview.blurb)).toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(screen.queryByText(overview.blurb)).toBeNull();
  });
});
