import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ZoneInspector } from './ZoneInspector';
import type { ZoneInspectorProps } from './ZoneInspector';

// UserImageGallery calls Firebase storage services — mock to avoid setup
vi.mock('./UserImageGallery', () => ({
  UserImageGallery: () => null,
}));

function makeProps(overrides: Partial<ZoneInspectorProps> = {}): ZoneInspectorProps {
  return {
    zone: { id: 'z1', type: 'text', x: 0, y: 0, w: 200, h: 50 },
    displayBound: { x: 10, y: 80, w: 200, h: 50 },
    canvasWidth: 600,
    canvasHeight: 600,
    feedColumns: ['headline', 'description'],
    feedSampleRow: { headline: 'Nike Air Max', description: 'Run faster' },
    zoneStyle: undefined,
    clientSlug: 'test-client',
    onDelete: vi.fn(),
    onClose: vi.fn(),
    onContentUpdate: vi.fn(),
    onStyleUpdate: vi.fn(),
    ...overrides,
  };
}

describe('ZoneInspector', () => {
  it('renders "Text zone" header for a text zone', () => {
    render(<ZoneInspector {...makeProps()} />);
    expect(screen.getByText('Text zone')).toBeTruthy();
  });

  it('renders "Image zone" header for an image zone', () => {
    render(<ZoneInspector {...makeProps({ zone: { id: 'z2', type: 'image', x: 0, y: 0, w: 200, h: 100 } })} />);
    expect(screen.getByText('Image zone')).toBeTruthy();
  });

  it('clicking close button opens the save-or-remove confirm state', () => {
    render(<ZoneInspector {...makeProps()} />);
    fireEvent.click(screen.getByTitle('Close'));
    expect(screen.getByText('Save or remove?')).toBeTruthy();
  });

  it('clicking Delete in confirm state calls onDelete', () => {
    const onDelete = vi.fn();
    render(<ZoneInspector {...makeProps({ onDelete })} />);
    fireEvent.click(screen.getByTitle('Close'));
    fireEvent.click(screen.getByText('Delete'));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('clicking Save in confirm state calls onClose', () => {
    const onClose = vi.fn();
    render(<ZoneInspector {...makeProps({ onClose })} />);
    fireEvent.click(screen.getByTitle('Close'));
    fireEvent.click(screen.getByText('Save'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onContentUpdate when static text input changes', () => {
    const onContentUpdate = vi.fn();
    render(<ZoneInspector {...makeProps({ onContentUpdate })} />);
    const input = document.querySelector('input[type="text"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    fireEvent.change(input, { target: { value: 'Hello world' } });
    expect(onContentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ textContent: 'Hello world', fieldId: undefined }),
    );
  });

  it('switching to Feed tab shows feed column selector', () => {
    render(<ZoneInspector {...makeProps()} />);
    fireEvent.click(screen.getByText('Feed'));
    const selects = document.querySelectorAll('select');
    const columnValues = Array.from(selects).flatMap((s) =>
      Array.from(s.options).map((o) => o.value),
    );
    expect(columnValues).toContain('headline');
    expect(columnValues).toContain('description');
  });

  it('starts in Feed mode and shows column selector when zone has a fieldId', () => {
    render(
      <ZoneInspector
        {...makeProps({ zone: { id: 'z3', type: 'text', x: 0, y: 0, w: 200, h: 50, fieldId: 'headline' } })}
      />,
    );
    const selects = document.querySelectorAll('select');
    const columnValues = Array.from(selects).flatMap((s) =>
      Array.from(s.options).map((o) => o.value),
    );
    expect(columnValues).toContain('headline');
  });
});
