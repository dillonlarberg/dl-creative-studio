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
});
