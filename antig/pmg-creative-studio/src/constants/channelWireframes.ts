import type { Channel } from '../apps/template-builder/types';

export const CHANNEL_RATIOS: Record<Channel, string[]> = {
  Social: ['1:1', '9:16', '4:5', '1.91:1'],
  Programmatic: ['300x250', '160x600', '728x90', '300x600', '320x50'],
  Print: ['8.5x11', '4x6', '11x14', 'Custom'],
  'Digital Signage': ['1920x1080', '1080x1920', '1080x1080', 'Custom'],
};
