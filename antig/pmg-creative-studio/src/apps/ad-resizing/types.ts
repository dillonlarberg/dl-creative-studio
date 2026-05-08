export interface MockCreative {
  id: string;
  name: string;
  thumbnailUrl: string;
  width: number;
  height: number;
  fileType: 'PNG' | 'JPG' | 'GIF';
  uploadedAt: string;
  source: string;
  tags: string[];
}

export interface Dimension {
  id: string;
  label: string;
  width: number;
  height: number;
  channelId: string;
  channelLabel: string;
}

export interface Channel {
  id: string;
  label: string;
  dimensions: Dimension[];
}

export type GeneratedOutputStatus = 'pending' | 'complete' | 'error';

export interface GeneratedOutput {
  id: string;
  dimension: Dimension;
  status: GeneratedOutputStatus;
  imageUrl?: string;
}

export interface GenerationJob {
  id: string;
  sourceCreative: MockCreative;
  outputs: GeneratedOutput[];
  startedAt: number;
}
