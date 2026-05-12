import { useCallback } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../../firebase';
import type { Creative, Dimension } from '../types';

export interface OutpaintOutputRequest {
  outputId: string;
  dimension: {
    width: number;
    height: number;
    label?: string;
    channel?: string;
  };
}

export interface RunBatchInput {
  batchId: string;
  creative: Creative;
  feedName?: string;
  dimensions: Dimension[];
  /** Pre-generated output ids; one per dimension in the same order. */
  outputIds: string[];
}

export interface RunBatchResult {
  batchId: string;
  status: 'completed' | 'partial' | 'failed' | 'noop';
  completedCount: number;
  errorCount: number;
}

/**
 * Invokes `runOutpaintBatch` with the 10-min client timeout codex F13 calls
 * out — the pipeline can take 115s+ for a fan-out and the SDK default of 70s
 * would surface as a misleading timeout error.
 */
const runOutpaintBatch = httpsCallable<unknown, RunBatchResult>(
  functions,
  'runOutpaintBatch',
  { timeout: 600000 },
);

function toOutputRequests(input: RunBatchInput): OutpaintOutputRequest[] {
  return input.dimensions.map((dim, i) => ({
    outputId: input.outputIds[i]!,
    dimension: {
      width: dim.width,
      height: dim.height,
      label: dim.id,
      channel: dim.channelLabel,
    },
  }));
}

export function useOutpaintRunner(clientSlug: string) {
  /** Kicks off a brand-new batch (multi-output). */
  const runBatch = useCallback(
    async (input: RunBatchInput): Promise<RunBatchResult> => {
      const r = await runOutpaintBatch({
        clientSlug,
        batchId: input.batchId,
        creativeId: input.creative.id,
        originalUrl: input.creative.originalUrl ?? input.creative.thumbnailUrl,
        creativeName: input.creative.name,
        feedName: input.feedName,
        outputs: toOutputRequests(input),
      });
      return r.data;
    },
    [clientSlug],
  );

  /** Retry a single failed transient output (no prompt). */
  const retryOutput = useCallback(
    async (args: {
      batchId: string;
      creative: Creative;
      outputId: string;
      dimension: Dimension;
    }): Promise<RunBatchResult> => {
      const r = await runOutpaintBatch({
        clientSlug,
        batchId: args.batchId,
        creativeId: args.creative.id,
        originalUrl: args.creative.originalUrl ?? args.creative.thumbnailUrl,
        creativeName: args.creative.name,
        outputs: [
          {
            outputId: args.outputId,
            dimension: {
              width: args.dimension.width,
              height: args.dimension.height,
              label: args.dimension.id,
              channel: args.dimension.channelLabel,
            },
          },
        ],
      });
      return r.data;
    },
    [clientSlug],
  );

  /** Re-crop with a user prompt; single output, overwrites the same doc. */
  const reiterateOutput = useCallback(
    async (args: {
      batchId: string;
      creative: Creative;
      outputId: string;
      dimension: Dimension;
      retryPrompt: string;
    }): Promise<RunBatchResult> => {
      const r = await runOutpaintBatch({
        clientSlug,
        batchId: args.batchId,
        creativeId: args.creative.id,
        originalUrl: args.creative.originalUrl ?? args.creative.thumbnailUrl,
        creativeName: args.creative.name,
        outputs: [
          {
            outputId: args.outputId,
            dimension: {
              width: args.dimension.width,
              height: args.dimension.height,
              label: args.dimension.id,
              channel: args.dimension.channelLabel,
            },
          },
        ],
        retryPrompt: args.retryPrompt.slice(0, 500),
      });
      return r.data;
    },
    [clientSlug],
  );

  return { runBatch, retryOutput, reiterateOutput };
}
