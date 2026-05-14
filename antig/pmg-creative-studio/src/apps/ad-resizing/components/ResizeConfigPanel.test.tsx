import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ResizeConfigPanel from './ResizeConfigPanel';
import type { MockCreative } from '../types';

const fakeCreative: MockCreative = {
  id: 'test-creative-1',
  name: 'Test Creative',
  thumbnailUrl: 'https://example.com/thumb.png',
  width: 1200,
  height: 1200,
  fileType: 'PNG',
  uploadedAt: '2026-01-01T00:00:00.000Z',
  source: 'test',
  tags: [],
};

function renderPanel() {
  return render(
    <ResizeConfigPanel
      creative={fakeCreative}
      selectedChannels={['print']}
      selectedDimensions={new Set<string>()}
      onToggleChannel={vi.fn()}
      onToggleDimension={vi.fn()}
      onSetChannels={vi.fn()}
      onRun={vi.fn()}
      onClose={vi.fn()}
    />,
  );
}

describe('ResizeConfigPanel — Print channel rendering', () => {
  it('does not render the 8.5×11" option', () => {
    renderPanel();
    expect(screen.queryByText('8.5×11"')).not.toBeInTheDocument();
  });

  it('still renders 4×6" and 5×7" options', () => {
    renderPanel();
    expect(screen.getAllByText('4×6"').length).toBeGreaterThan(0);
    expect(screen.getAllByText('5×7"').length).toBeGreaterThan(0);
  });
});
