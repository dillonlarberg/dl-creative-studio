import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import TemplateBuilderFooter from './TemplateBuilderFooter';

// ConfirmPopover ships its own React copy (file: dep) which breaks jsdom hooks.
// Render trigger + action inline so tests can assert on both.
vi.mock('@agencypmg/alli-design-system', () => ({
  Button: ({ children, onClick, variant }: { children: React.ReactNode; onClick?: () => void; variant?: string }) => (
    <button type="button" data-variant={variant} onClick={onClick}>{children}</button>
  ),
  ConfirmPopover: ({ children, action }: { children: React.ReactNode; action: React.ReactNode }) => (
    <>{children}{action}</>
  ),
}));

afterEach(cleanup);

const defaultProps = {
  currentStepIndex: 0,
  isLoading: false,
  isLastStep: false,
  isNextDisabled: false,
  requirements: null,
  clientSlug: 'acme',
  nextStepName: 'Design & Map',
  onNext: vi.fn(),
  onBack: vi.fn(),
  onDiscard: vi.fn(),
};

// Footer uses useNavigate — must be wrapped in MemoryRouter
function renderFooter(props = {}) {
  return render(
    <MemoryRouter>
      <TemplateBuilderFooter {...defaultProps} {...props} />
    </MemoryRouter>
  );
}

describe('TemplateBuilderFooter', () => {
  it('renders data-testid="wizard-save-exit"', () => {
    renderFooter();
    expect(screen.getByTestId('wizard-save-exit')).toBeDefined();
  });

  it('renders data-testid="wizard-discard"', () => {
    renderFooter();
    expect(screen.getByTestId('wizard-discard')).toBeDefined();
  });

  it('renders Continue button with dynamic next step label', () => {
    renderFooter({ isLastStep: false, nextStepName: 'Design & Map' });
    expect(screen.getByRole('button', { name: /Next: Design & Map →/ })).toBeDefined();
  });

  it('does NOT render Continue button on the last step', () => {
    renderFooter({ isLastStep: true });
    expect(screen.queryByRole('button', { name: /Next:/ })).toBeNull();
  });

  it('renders "← Previous Step" button', () => {
    renderFooter();
    expect(screen.getByRole('button', { name: /← Previous Step/ })).toBeDefined();
  });

  it('Previous Step button is disabled on step 0', () => {
    renderFooter({ currentStepIndex: 0 });
    const btn = screen.getByRole('button', { name: /← Previous Step/ });
    expect(btn.hasAttribute('disabled')).toBe(true);
  });

  it('Previous Step button is enabled on step > 0', () => {
    renderFooter({ currentStepIndex: 1 });
    const btn = screen.getByRole('button', { name: /← Previous Step/ });
    expect(btn.hasAttribute('disabled')).toBe(false);
  });

  it('Continue button shows "Loading..." when isLoading is true', () => {
    renderFooter({ isLoading: true, isLastStep: false });
    expect(screen.getByRole('button', { name: /Loading.../ })).toBeDefined();
  });

  it('Continue button is disabled when isNextDisabled', () => {
    renderFooter({ isNextDisabled: true, isLastStep: false });
    const btn = screen.getByRole('button', { name: /Next:/ });
    expect(btn.hasAttribute('disabled')).toBe(true);
  });

  it('renders requirements checklist when requirements provided', () => {
    renderFooter({
      requirements: [
        { label: 'Template name', met: true },
        { label: 'Channel', met: false },
      ],
    });
    expect(screen.getByTestId('wizard-requirements')).toBeDefined();
    expect(screen.getByTestId('wizard-requirement-Template name')).toBeDefined();
    expect(screen.getByTestId('wizard-requirement-Channel')).toBeDefined();
  });

  it('sets data-met="true" for met requirements', () => {
    renderFooter({
      requirements: [{ label: 'Template name', met: true }],
    });
    expect(screen.getByTestId('wizard-requirement-Template name').getAttribute('data-met')).toBe('true');
  });

  it('sets data-met="false" for unmet requirements', () => {
    renderFooter({
      requirements: [{ label: 'Channel', met: false }],
    });
    expect(screen.getByTestId('wizard-requirement-Channel').getAttribute('data-met')).toBe('false');
  });

  it('does NOT render requirements section when requirements is null', () => {
    renderFooter({ requirements: null });
    expect(screen.queryByTestId('wizard-requirements')).toBeNull();
  });

  it('calls onNext when Continue is clicked', () => {
    const onNext = vi.fn();
    renderFooter({ onNext });
    fireEvent.click(screen.getByRole('button', { name: /Next:/ }));
    expect(onNext).toHaveBeenCalledOnce();
  });

  it('calls onBack when Previous Step is clicked (step > 0)', () => {
    const onBack = vi.fn();
    renderFooter({ currentStepIndex: 1, onBack });
    fireEvent.click(screen.getByRole('button', { name: /← Previous Step/ }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('calls onDiscard when the ConfirmPopover action button is clicked', () => {
    const onDiscard = vi.fn();
    renderFooter({ onDiscard });
    // Trigger opens the popover (mocked inline); action button is always rendered
    fireEvent.click(screen.getByTestId('wizard-discard'));
    // Click the caution-variant confirm button rendered by the ConfirmPopover mock
    fireEvent.click(document.querySelector('button[data-variant="caution"]')!);
    expect(onDiscard).toHaveBeenCalledOnce();
  });

  it('does NOT call onDiscard when the action button is not clicked', () => {
    const onDiscard = vi.fn();
    renderFooter({ onDiscard });
    // Click the trigger but do not click the confirm action
    fireEvent.click(screen.getByTestId('wizard-discard'));
    expect(onDiscard).not.toHaveBeenCalled();
  });

  // --- new coverage ---

  it('Previous Step button is disabled when isLoading is true (even on step > 0)', () => {
    renderFooter({ currentStepIndex: 1, isLoading: true });
    const btn = screen.getByRole('button', { name: /← Previous Step/ });
    expect(btn.hasAttribute('disabled')).toBe(true);
  });

  it('Save & Exit navigates to /adlabs/acme when clicked', async () => {
    let capturedPath = '';
    function LocationCapture() {
      const loc = useLocation();
      React.useEffect(() => { capturedPath = loc.pathname; }, [loc]);
      return null;
    }
    render(
      <MemoryRouter initialEntries={['/start']}>
        <LocationCapture />
        <TemplateBuilderFooter {...defaultProps} clientSlug="acme" />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByTestId('wizard-save-exit'));
    await waitFor(() => expect(capturedPath).toBe('/adlabs/acme'));
  });

  it("Continue button shows 'Next: Continue →' when nextStepName is undefined", () => {
    renderFooter({ isLastStep: false, nextStepName: undefined });
    expect(screen.getByRole('button', { name: /Next: Continue →/ })).toBeDefined();
  });

  it('last step footer renders Previous Step and Save & Exit but no Next button', () => {
    renderFooter({ isLastStep: true, currentStepIndex: 2 });
    expect(screen.getByRole('button', { name: /← Previous Step/ })).toBeDefined();
    expect(screen.getByTestId('wizard-save-exit')).toBeDefined();
    expect(screen.queryByRole('button', { name: /Next:/ })).toBeNull();
  });

  it('renders wizard-requirements container with no items when requirements is []', () => {
    renderFooter({ requirements: [] });
    // Empty array is truthy — the outer div is still rendered, but no child items
    expect(screen.getByTestId('wizard-requirements')).toBeDefined();
    expect(screen.queryAllByTestId(/^wizard-requirement-/).length).toBe(0);
  });

  it('Continue button is NOT disabled when isLoading is true and isNextDisabled is false', () => {
    // The source disables the Continue button only via isNextDisabled — isLoading only swaps label text
    renderFooter({ isLoading: true, isNextDisabled: false, isLastStep: false });
    const btn = screen.getByRole('button', { name: /Loading.../ });
    expect(btn.hasAttribute('disabled')).toBe(false);
  });
});
