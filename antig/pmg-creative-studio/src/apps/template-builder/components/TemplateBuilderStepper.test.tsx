import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import TemplateBuilderStepper from './TemplateBuilderStepper';
import type { TemplateBuilderStep } from '../types';

const steps: TemplateBuilderStep[] = [
  { id: 'setup', name: 'Setup', render: () => null, validate: () => ({ ok: true }) },
  { id: 'design', name: 'Design & Map', render: () => null, validate: () => ({ ok: true }) },
  { id: 'publish', name: 'Publish', render: () => null, validate: () => ({ ok: true }) },
];

describe('TemplateBuilderStepper', () => {
  afterEach(cleanup);

  it('renders data-testid="wizard-breadcrumb"', () => {
    render(
      <TemplateBuilderStepper steps={steps} currentStepIndex={0} isLoading={false} onStepClick={vi.fn()} />
    );
    expect(screen.getByTestId('wizard-breadcrumb')).toBeDefined();
  });

  it('renders data-testid for each step', () => {
    render(
      <TemplateBuilderStepper steps={steps} currentStepIndex={0} isLoading={false} onStepClick={vi.fn()} />
    );
    expect(screen.getByTestId('breadcrumb-setup')).toBeDefined();
    expect(screen.getByTestId('breadcrumb-design')).toBeDefined();
    expect(screen.getByTestId('breadcrumb-publish')).toBeDefined();
  });

  it('sets data-active="true" only on the current step', () => {
    render(
      <TemplateBuilderStepper steps={steps} currentStepIndex={1} isLoading={false} onStepClick={vi.fn()} />
    );
    expect(screen.getByTestId('breadcrumb-setup').getAttribute('data-active')).toBe('false');
    expect(screen.getByTestId('breadcrumb-design').getAttribute('data-active')).toBe('true');
    expect(screen.getByTestId('breadcrumb-publish').getAttribute('data-active')).toBe('false');
  });

  it('renders step names as text labels', () => {
    render(
      <TemplateBuilderStepper steps={steps} currentStepIndex={0} isLoading={false} onStepClick={vi.fn()} />
    );
    expect(screen.getByText('Setup')).toBeDefined();
    expect(screen.getByText('Design & Map')).toBeDefined();
    expect(screen.getByText('Publish')).toBeDefined();
  });

  it('calls onStepClick with the clicked index', () => {
    const onStepClick = vi.fn();
    render(
      <TemplateBuilderStepper steps={steps} currentStepIndex={2} isLoading={false} onStepClick={onStepClick} />
    );
    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[0]); // click Setup circle
    expect(onStepClick).toHaveBeenCalledWith(0);
  });

  it('marks aria-current="step" on the current step circle', () => {
    render(
      <TemplateBuilderStepper steps={steps} currentStepIndex={1} isLoading={false} onStepClick={vi.fn()} />
    );
    const buttons = screen.getAllByRole('button');
    expect(buttons[0].getAttribute('aria-current')).toBeNull();
    expect(buttons[1].getAttribute('aria-current')).toBe('step');
    expect(buttons[2].getAttribute('aria-current')).toBeNull();
  });

  it('complete step circle has bg-blue-600 class', () => {
    render(
      <TemplateBuilderStepper steps={steps} currentStepIndex={2} isLoading={false} onStepClick={vi.fn()} />
    );
    const buttons = screen.getAllByRole('button');
    expect(buttons[0].className).toContain('bg-blue-600');
    expect(buttons[1].className).toContain('bg-blue-600');
  });

  it('current step circle has border-blue-600 class', () => {
    render(
      <TemplateBuilderStepper steps={steps} currentStepIndex={1} isLoading={false} onStepClick={vi.fn()} />
    );
    const buttons = screen.getAllByRole('button');
    expect(buttons[1].className).toContain('border-blue-600');
  });

  it('upcoming step circle has border-gray-300 class', () => {
    render(
      <TemplateBuilderStepper steps={steps} currentStepIndex={0} isLoading={false} onStepClick={vi.fn()} />
    );
    const buttons = screen.getAllByRole('button');
    expect(buttons[2].className).toContain('border-gray-300');
  });

  it('does not call onStepClick when isLoading is true', () => {
    const onStepClick = vi.fn();
    render(
      <TemplateBuilderStepper steps={steps} currentStepIndex={1} isLoading={true} onStepClick={onStepClick} />
    );
    // Click the complete step (index 0)
    const setupLi = screen.getByTestId('breadcrumb-setup');
    const button = setupLi.querySelector('button')!;
    fireEvent.click(button);
    expect(onStepClick).not.toHaveBeenCalled();
  });

  it('complete step renders a CheckIcon (svg child in the circle button)', () => {
    render(
      <TemplateBuilderStepper steps={steps} currentStepIndex={2} isLoading={false} onStepClick={vi.fn()} />
    );
    // index 0 (setup) is complete when currentStepIndex=2
    const setupLi = screen.getByTestId('breadcrumb-setup');
    const svg = setupLi.querySelector('button svg');
    expect(svg).not.toBeNull();
  });

  it('connector line to the left of a complete step has bg-blue-600 class', () => {
    render(
      <TemplateBuilderStepper steps={steps} currentStepIndex={1} isLoading={false} onStepClick={vi.fn()} />
    );
    // index 1 (design): left connector condition is index <= currentStepIndex (1 <= 1) → bg-blue-600
    const designLi = screen.getByTestId('breadcrumb-design');
    const connectorWrapper = designLi.querySelector('.absolute.inset-x-0');
    const leftDiv = connectorWrapper?.children[0] as HTMLElement | undefined;
    expect(leftDiv?.className).toContain('bg-blue-600');
  });

  it('connector line to the right of the current step has bg-gray-300 class', () => {
    render(
      <TemplateBuilderStepper steps={steps} currentStepIndex={1} isLoading={false} onStepClick={vi.fn()} />
    );
    // index 1 (design): right connector condition is index < currentStepIndex (1 < 1 = false) → bg-gray-300
    const designLi = screen.getByTestId('breadcrumb-design');
    const connectorWrapper = designLi.querySelector('.absolute.inset-x-0');
    const rightDiv = connectorWrapper?.children[1] as HTMLElement | undefined;
    expect(rightDiv?.className).toContain('bg-gray-300');
  });

  it('first step left connector is bg-transparent', () => {
    render(
      <TemplateBuilderStepper steps={steps} currentStepIndex={0} isLoading={false} onStepClick={vi.fn()} />
    );
    // index 0 (setup): left connector condition is index === 0 → bg-transparent
    const setupLi = screen.getByTestId('breadcrumb-setup');
    const connectorWrapper = setupLi.querySelector('.absolute.inset-x-0');
    const leftDiv = connectorWrapper?.children[0] as HTMLElement | undefined;
    expect(leftDiv?.className).toContain('bg-transparent');
  });

  it('renders correctly with a single step', () => {
    const singleStep: TemplateBuilderStep[] = [
      { id: 'only', name: 'Only Step', render: () => null, validate: () => ({ ok: true }) },
    ];
    render(
      <TemplateBuilderStepper steps={singleStep} currentStepIndex={0} isLoading={false} onStepClick={vi.fn()} />
    );
    expect(screen.getByTestId('wizard-breadcrumb')).toBeDefined();
    expect(screen.getByTestId('breadcrumb-only')).toBeDefined();
  });

  it('upcoming step button has cursor-not-allowed class', () => {
    render(<TemplateBuilderStepper steps={steps} currentStepIndex={0} isLoading={false} onStepClick={vi.fn()} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons[2].className).toContain('cursor-not-allowed');
    expect(buttons[0].className).not.toContain('cursor-not-allowed');
  });

  it('upcoming step button has title tooltip, current and complete do not', () => {
    render(<TemplateBuilderStepper steps={steps} currentStepIndex={1} isLoading={false} onStepClick={vi.fn()} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons[0].getAttribute('title')).toBeNull(); // complete
    expect(buttons[1].getAttribute('title')).toBeNull(); // current
    expect(buttons[2].getAttribute('title')).toBe('Complete the current step to continue');
  });

  it('upcoming step button has aria-disabled="true"', () => {
    render(<TemplateBuilderStepper steps={steps} currentStepIndex={0} isLoading={false} onStepClick={vi.fn()} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons[2].getAttribute('aria-disabled')).toBe('true');
    expect(buttons[0].getAttribute('aria-disabled')).toBeNull();
  });

  it('does not call onStepClick when clicking an upcoming step', () => {
    const onStepClick = vi.fn();
    render(<TemplateBuilderStepper steps={steps} currentStepIndex={0} isLoading={false} onStepClick={onStepClick} />);
    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[2]); // publish step is upcoming
    expect(onStepClick).not.toHaveBeenCalled();
  });
});
