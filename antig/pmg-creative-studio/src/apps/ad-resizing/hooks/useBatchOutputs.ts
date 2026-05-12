import { useEffect, useState } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  query,
  Timestamp,
  where,
} from 'firebase/firestore';
import { db } from '../../../firebase';
import { paths } from '../../../platform/firebase/paths';
import type { BatchRecord } from '../../../services/batches';
import type { GeneratedOutput, Dimension } from '../types';
import { CHANNELS } from '../data/channels';

const APP_ID = 'ad-resizing';

interface OutputDoc {
  outputId: string;
  batchId: string;
  dimension: { width: number; height: number; label?: string; channel?: string };
  status: 'pending' | 'complete' | 'error';
  storageRef?: string;
  errorCategory?: 'transient' | 'permanent';
  errorMessage?: string;
  completedAt?: Timestamp;
}

/**
 * Look up a channel/dimension shape from `channels.ts` so the in-memory
 * GeneratedOutput keeps the same display semantics it had before the wire-up
 * (label, channelLabel, etc.). Falls back to a synthetic Dimension if the
 * backend recorded a label that isn't in the local registry.
 */
function dimensionFromDoc(d: OutputDoc): Dimension {
  const labelHint = d.dimension.label;
  if (labelHint) {
    for (const ch of CHANNELS) {
      for (const dim of ch.dimensions) {
        if (dim.id === labelHint) return dim;
      }
    }
  }
  const channelLabel = d.dimension.channel ?? 'Custom';
  return {
    id: labelHint ?? `${d.dimension.width}x${d.dimension.height}`,
    label: labelHint ?? `${d.dimension.width}×${d.dimension.height}`,
    width: d.dimension.width,
    height: d.dimension.height,
    channelId: channelLabel.toLowerCase().replace(/\s+/g, '-'),
    channelLabel,
  };
}

function toGeneratedOutput(d: OutputDoc): GeneratedOutput {
  return {
    id: d.outputId,
    outputId: d.outputId,
    dimension: dimensionFromDoc(d),
    status: d.status,
    storageRef: d.storageRef,
    errorCategory: d.errorCategory,
    errorMessage: d.errorMessage,
    completedAtMs: d.completedAt?.toMillis(),
  };
}

export interface UseBatchOutputsState {
  batch: BatchRecord | null;
  outputs: GeneratedOutput[];
  loading: boolean;
}

/**
 * Subscribes to the live BatchRecord + every output doc whose `batchId`
 * matches the active job. Returns the merged state to AppRoot. Plan §Q1 +
 * §Q5.
 */
export function useBatchOutputs(
  clientSlug: string | null | undefined,
  batchId: string | null,
): UseBatchOutputsState {
  const [batch, setBatch] = useState<BatchRecord | null>(null);
  const [outputs, setOutputs] = useState<GeneratedOutput[]>([]);
  const [batchLoading, setBatchLoading] = useState(true);
  const [outputsLoading, setOutputsLoading] = useState(true);

  useEffect(() => {
    if (!clientSlug || !batchId) {
      setBatch(null);
      setOutputs([]);
      setBatchLoading(false);
      setOutputsLoading(false);
      return;
    }
    setBatchLoading(true);
    setOutputsLoading(true);

    const batchRef = doc(db, paths.batch(clientSlug, APP_ID, batchId));
    const unsubBatch = onSnapshot(
      batchRef,
      (snap) => {
        setBatch(snap.exists() ? ({ id: snap.id, ...snap.data() } as BatchRecord) : null);
        setBatchLoading(false);
      },
      () => setBatchLoading(false),
    );

    const outputsCol = collection(db, paths.outpaintOutputs(clientSlug, APP_ID));
    const q = query(outputsCol, where('batchId', '==', batchId));
    const unsubOutputs = onSnapshot(
      q,
      (snap) => {
        const docs = snap.docs.map((s) => s.data() as OutputDoc);
        // Stable order: by dimension.label, then width × height descending.
        docs.sort((a, b) => {
          const al = a.dimension.label ?? '';
          const bl = b.dimension.label ?? '';
          if (al !== bl) return al.localeCompare(bl);
          return b.dimension.width * b.dimension.height - a.dimension.width * a.dimension.height;
        });
        setOutputs(docs.map(toGeneratedOutput));
        setOutputsLoading(false);
      },
      () => setOutputsLoading(false),
    );

    return () => {
      unsubBatch();
      unsubOutputs();
    };
  }, [clientSlug, batchId]);

  return {
    batch,
    outputs,
    loading: batchLoading || outputsLoading,
  };
}
