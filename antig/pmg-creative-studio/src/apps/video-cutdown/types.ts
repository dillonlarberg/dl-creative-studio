export type Stage = 'source' | 'music' | 'brief' | 'run' | 'render';
export type Angle = 'narrative' | 'highlights' | 'punchy';

export interface TrackView {
  trackId: string;
  title: string;
  url: string;
  format: string;
  durationSec: number;
  bpm?: number;
  mood?: string;
  genre?: string;
  energy?: number;
  vocals?: string;
  tags?: string[];
  provider: string;
  licenseRef: string;
}

export interface CutView {
  srcIn: number;
  srcOut: number;
  len: number;
  role?: string;
  why?: string;
  score?: number;
  summary?: string;
}

export interface VersionDoc {
  angle: Angle;
  description?: string;
  cuts: CutView[];
  thumbs: string[];
  status: 'thumbing' | 'ready' | 'failed';
}

export interface BatchDoc {
  id: string;
  status: 'generating' | 'ready' | 'partial' | 'failed';
  theme?: string;
  trackId: string;
  trackTitle: string;
  bpm?: number;
  targetSec: number;
  sourceName: string;
  videoStoragePath: string;
  durationSec: number;
}
