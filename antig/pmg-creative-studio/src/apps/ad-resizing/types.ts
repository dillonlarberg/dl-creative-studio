export interface Creative {
  id: string;                 // sha256(originalUrl).slice(0, 16) for feed-sourced; arbitrary for legacy mock data
  name: string;
  thumbnailUrl: string;
  /**
   * Real CDN URL fed to the runOutpaintBatch callable (== thumbnailUrl for
   * feed-sourced creatives). Optional so legacy mock fixtures still compile;
   * the runner falls back to thumbnailUrl when absent.
   */
  originalUrl?: string;
  width: number;
  height: number;
  fileType: 'PNG' | 'JPG' | 'GIF';
  uploadedAt: string;
  source: string;
  tags: string[];
}

/** Back-compat alias — kept while older imports migrate to `Creative`. */
export type MockCreative = Creative;

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
  /** Local UI key; matches the Firestore outputId for live-subscribed outputs. */
  id: string;
  /** Firestore outputId (same as `id` once a batch is created). */
  outputId?: string;
  dimension: Dimension;
  status: GeneratedOutputStatus;
  /** Resolved download URL (derived from storageRef via useStorageUrl). */
  imageUrl?: string;
  /** Storage path returned by the callable. Source of truth for downloads. */
  storageRef?: string;
  /** Bucket the storageRef refers to; permanent → no Retry, transient → Retry button. */
  errorCategory?: 'transient' | 'permanent';
  errorMessage?: string;
}

export interface GenerationJob {
  id: string;                 // Firestore batchId
  sourceCreative: Creative;
  outputs: GeneratedOutput[]; // hydrated from Firestore onSnapshot in useBatchOutputs
  startedAt: number;
}
