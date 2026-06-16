import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TemplateBuilderFooter from './TemplateBuilderFooter';

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

  it('shows discard confirm with exact text and calls onDiscard on OK', () => {
    const onDiscard = vi.fn();
    const confirmSpy = vi.fn(() => true);
    vi.stubGlobal('confirm', confirmSpy);
    renderFooter({ onDiscard });
    fireEvent.click(screen.getByTestId('wizard-discard'));
    expect(confirmSpy).toHaveBeenCalledWith(
      'Discard this template? All unsaved work will be lost and cannot be recovered.'
    );
    expect(onDiscard).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });

  it('does NOT call onDiscard when confirm is cancelled', () => {
    const onDiscard = vi.fn();
    vi.stubGlobal('confirm', vi.fn(() => false));
    renderFooter({ onDiscard });
    fireEvent.click(screen.getByTestId('wizard-discard'));
    expect(onDiscard).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
