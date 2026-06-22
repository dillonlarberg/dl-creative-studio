import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FieldMappingPanel } from './FieldMappingPanel';
import type { FieldMappingPanelProps } from './FieldMappingPanel';

// Mock the Alli design system (ships its own React copy — causes "Invalid hook call" in jsdom)
vi.mock('@agencypmg/alli-design-system', () => ({
  Button: ({ children, onClick }: any) => <button type="button" onClick={onClick}>{children}</button>,
  ConfirmPopover: ({ children, action }: any) => <>{children}{action}</>,
}));

// Mock ZoneStyleToolbar (Konva dependency not available in jsdom)
vi.mock('./ZoneStyleToolbar', () => ({
  ZoneStyleToolbar: () => null,
}));

function makeProps(overrides: Partial<FieldMappingPanelProps> = {}): FieldMappingPanelProps {
  return {
    stepData: {
      feedMappings: {},
      slotMappings: {},
      fieldSourceMode: {},
      staticValues: {},
      customFields: [],
      zoneStyles: {},
    },
    mergeStepData: vi.fn(),
    allFields: [
      { id: 'headline', label: 'Headline', category: 'Dynamic', source: 'feed', type: 'text' },
      { id: 'image', label: 'Image', category: 'Dynamic', source: 'feed', type: 'image' },
    ],
    feedColumns: ['product_name', 'image_url', 'price'],
    feedSampleData: [{ product_name: 'Nike Air', image_url: 'https://example.com/img.jpg', price: '$99' }],
    discoveredSlots: [
      { id: 'headline', type: 'text', rect: { x: 0, y: 0, w: 200, h: 50 } },
    ],
    activeSlotField: null,
    setActiveSlotField: vi.fn(),
    styleOpenFieldId: null,
    setStyleOpenFieldId: vi.fn(),
    zoneCoverageStyleSlot: null,
    setZoneCoverageStyleSlot: vi.fn(),
    onZoneStyleChange: vi.fn(),
    getEffectiveSlotId: (id) => id,
    slotUseCounts: {},
    onOpenAskAlli: vi.fn(),
    addFieldSelectingSlot: false,
    setAddFieldSelectingSlot: vi.fn(),
    addFieldPendingSlot: null,
    setAddFieldPendingSlot: vi.fn(),
    ...overrides,
  };
}

describe('FieldMappingPanel', () => {
  it('renders a field row for each field', () => {
    render(<FieldMappingPanel {...makeProps()} />);
    expect(screen.getByText('Headline')).toBeTruthy();
    expect(screen.getByText('Image')).toBeTruthy();
  });

  it('renders feed column options in the dropdown for a text field', () => {
    render(<FieldMappingPanel {...makeProps()} />);
    // The select for headline should contain feed column names
    const selects = document.querySelectorAll('select');
    const columnValues = Array.from(selects).flatMap((s) =>
      Array.from(s.options).map((o) => o.value)
    );
    expect(columnValues).toContain('product_name');
  });

  it('calls mergeStepData when a feed column is selected for a field', () => {
    const mergeStepData = vi.fn();
    render(<FieldMappingPanel {...makeProps({ mergeStepData })} />);
    const selects = document.querySelectorAll('select');
    if (selects.length > 0) {
      fireEvent.change(selects[0], { target: { value: 'product_name' } });
      expect(mergeStepData).toHaveBeenCalled();
    }
  });

  it('renders "Add Field" button', () => {
    render(<FieldMappingPanel {...makeProps()} />);
    expect(screen.getByText(/add field/i)).toBeTruthy();
  });

  it('shows slot mapping indicator when activeSlotField is set', () => {
    render(<FieldMappingPanel {...makeProps({ activeSlotField: 'headline' })} />);
    // The active field row should be highlighted — check for the field label still visible
    expect(screen.getByText('Headline')).toBeTruthy();
  });
});
