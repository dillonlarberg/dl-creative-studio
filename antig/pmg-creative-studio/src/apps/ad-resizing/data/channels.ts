import type { Channel } from '../types';

export const CHANNELS: Channel[] = [
  {
    id: 'social',
    label: 'Social',
    dimensions: [
      { id: 'social-1x1', label: '1:1', width: 1080, height: 1080, channelId: 'social', channelLabel: 'Social' },
      { id: 'social-9x16', label: '9:16', width: 1080, height: 1920, channelId: 'social', channelLabel: 'Social' },
      { id: 'social-4x5', label: '4:5', width: 1080, height: 1350, channelId: 'social', channelLabel: 'Social' },
      { id: 'social-16x9', label: '16:9', width: 1200, height: 628, channelId: 'social', channelLabel: 'Social' },
    ],
  },
  {
    id: 'programmatic',
    label: 'Programmatic',
    dimensions: [
      { id: 'prog-300x250', label: '300×250', width: 300, height: 250, channelId: 'programmatic', channelLabel: 'Programmatic' },
      { id: 'prog-160x600', label: '160×600', width: 160, height: 600, channelId: 'programmatic', channelLabel: 'Programmatic' },
      { id: 'prog-728x90', label: '728×90', width: 728, height: 90, channelId: 'programmatic', channelLabel: 'Programmatic' },
      { id: 'prog-300x600', label: '300×600', width: 300, height: 600, channelId: 'programmatic', channelLabel: 'Programmatic' },
      { id: 'prog-320x50', label: '320×50', width: 320, height: 50, channelId: 'programmatic', channelLabel: 'Programmatic' },
    ],
  },
  {
    id: 'print',
    label: 'Print',
    dimensions: [
      { id: 'print-8x11', label: '8.5×11"', width: 2550, height: 3300, channelId: 'print', channelLabel: 'Print' },
      { id: 'print-4x6', label: '4×6"', width: 1200, height: 1800, channelId: 'print', channelLabel: 'Print' },
      { id: 'print-5x7', label: '5×7"', width: 1500, height: 2100, channelId: 'print', channelLabel: 'Print' },
    ],
  },
  {
    id: 'digital',
    label: 'Digital',
    dimensions: [
      { id: 'digital-1920x1080', label: '1920×1080', width: 1920, height: 1080, channelId: 'digital', channelLabel: 'Digital' },
      { id: 'digital-1280x720', label: '1280×720', width: 1280, height: 720, channelId: 'digital', channelLabel: 'Digital' },
    ],
  },
  {
    id: 'digital-signage',
    label: 'Digital Signage',
    dimensions: [
      { id: 'signage-landscape', label: '1920×1080', width: 1920, height: 1080, channelId: 'digital-signage', channelLabel: 'Digital Signage' },
      { id: 'signage-portrait', label: '1080×1920', width: 1080, height: 1920, channelId: 'digital-signage', channelLabel: 'Digital Signage' },
    ],
  },
];

export function getDeduplicatedDimensions(channelIds: string[]): import('../types').Dimension[] {
  const seen = new Set<string>();
  const result: import('../types').Dimension[] = [];
  for (const ch of CHANNELS) {
    if (!channelIds.includes(ch.id)) continue;
    for (const dim of ch.dimensions) {
      const key = `${dim.width}x${dim.height}`;
      if (!seen.has(key)) {
        seen.add(key);
        result.push(dim);
      }
    }
  }
  return result;
}
