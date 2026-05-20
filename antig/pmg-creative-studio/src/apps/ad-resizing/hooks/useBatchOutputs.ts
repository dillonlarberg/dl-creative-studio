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
  format: { width: number; height: number; label?: string };
  status: 'pending' | 'complete' | 'error';
  storageRef?: string;
  errorCategory?: 'transient' | 'permanent';
  errorMessage?: string;
  completedAt?: Timestamp;
}

/**
 * Look up a channel/dimension shape from `channels.ts` so the in-memory
 * GeneratedOutput keeps the same display semantics. For labels that exist
 * in the registry we recover the full Dimension (incl. channelLabel); for
 * synthetic labels we synthesise a 'Custom' channel.
 */
function dimensionFromDoc(d: OutputDoc): Dimension {
  const f = d.format ?? { width: 0, height: 0 };
  const labelHint = f.label;
  if (labelHint) {
    for (const ch of CHANNELS) {
      for (const dim of ch.dimensions) {
        if (dim.id === labelHint) return dim;
      }
    }
  }
  return {
    id: labelHint ?? `${f.width}x${f.height}`,
    label: labelHint ?? `${f.width}×${f.height}`,
    width: f.width,
    height: f.height,
    channelId: 'custom',
    channelLabel: 'Custom',
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

    const outputsCol = collection(db, paths.outputs(clientSlug, APP_ID));
    const q = query(outputsCol, where('batchId', '==', batchId));
    const unsubOutputs = onSnapshot(
      q,
      (snap) => {
        const docs = snap.docs.map((s) => s.data() as OutputDoc);
        // Stable order: by format.label, then width × height descending.
        docs.sort((a, b) => {
          const af = a.format ?? { width: 0, height: 0, label: '' };
          const bf = b.format ?? { width: 0, height: 0, label: '' };
          const al = af.label ?? '';
          const bl = bf.label ?? '';
          if (al !== bl) return al.localeCompare(bl);
          return bf.width * bf.height - af.width * af.height;
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
