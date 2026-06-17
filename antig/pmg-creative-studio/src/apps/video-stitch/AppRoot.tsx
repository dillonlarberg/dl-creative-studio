/**
 * VideoStitchAppRoot — Lane B orchestrator. Stage machine mirrors video-cutdown
 * (conditional renders, no nested router): source → arrange → music → run → reel.
 *
 * Decision 2 (fail-fast, promise-authoritative): handleStitch fires stitchGenerate;
 * resolve → reel(reelUrl), reject → reel(error). No Firestore subscription. A
 * `runId` ref is the stale-call guard — a Retry/back mints a new run, and an old
 * promise resolving late can't overwrite a newer one.
 */
import { useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import { newId } from '../../utils/ids';
import { useStitch } from './hooks/useStitch';
import StepIndicator from './components/StepIndicator';
import SourcePicker from './components/SourcePicker';
import ArrangeBoard from './components/ArrangeBoard';
import MusicPicker from './components/MusicPicker';
import GeneratingPanel from './components/GeneratingPanel';
import ReelResult from './components/ReelResult';
import { toAssetRef, type PickedAsset, type Stage } from './types';

const TARGET_SEC = 15;

export default function VideoStitchAppRoot() {
  const { clientSlug = '' } = useParams<{ clientSlug: string }>();
  const { generate } = useStitch();

  const [stage, setStage] = useState<Stage>('source');
  const [selected, setSelected] = useState<PickedAsset[]>([]);
  const [trackId, setTrackId] = useState<string | null>(null);
  const [reelUrl, setReelUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const runId = useRef(0);

  function handleStitch() {
    if (selected.length < 2 || !trackId) return;
    const myId = ++runId.current; // stale-call guard
    const batchId = newId();
    setReelUrl(null);
    setError(null);
    setStage('run');
    generate({
      clientSlug,
      batchId,
      assets: selected.map(toAssetRef),
      trackId,
      targetSec: TARGET_SEC,
    })
      .then((r) => {
        if (runId.current !== myId) return; // a newer run superseded this one
        setReelUrl(r.data.reelUrl);
        setStage('reel');
      })
      .catch((e) => {
        if (runId.current !== myId) return;
        setError(e instanceof Error ? e.message : 'The stitch failed. Please try again.');
        setStage('reel');
      });
  }

  function backToArrange() {
    runId.current++; // invalidate any in-flight run
    setError(null);
    setReelUrl(null);
    setStage('arrange');
  }

  return (
    <div className="flex min-h-[calc(100vh-132px)] flex-col rounded-2xl bg-white px-6 py-6 shadow-sm ring-1 ring-gray-900/5">
      <div className="mb-5">
        <Link
          to={`/adlabs/${clientSlug}/`}
          className="mb-3 inline-flex items-center gap-1.5 text-[13px] text-gray-500 hover:text-gray-700"
        >
          <ArrowLeftIcon className="h-3.5 w-3.5" />
          Back to AdLabs
        </Link>
        <h1 className="text-[20px] font-semibold text-gray-900">Video Stitch</h1>
        <p className="mt-0.5 text-[13px] text-gray-500">
          Pick polished creatives from your library, set the order, and we'll cut them to the beat
          into a 15s social reel.
        </p>
      </div>

      <div className="mb-5">
        <StepIndicator current={stage} />
      </div>

      {stage === 'source' && (
        <SourcePicker
          clientSlug={clientSlug}
          selected={selected}
          onChange={setSelected}
          onContinue={() => setStage('arrange')}
        />
      )}

      {stage === 'arrange' && (
        <ArrangeBoard
          selected={selected}
          onChange={setSelected}
          onBack={() => setStage('source')}
          onContinue={() => setStage('music')}
        />
      )}

      {stage === 'music' && (
        <MusicPicker
          selectedTrackId={trackId}
          onPick={setTrackId}
          onBack={() => setStage('arrange')}
          onStitch={handleStitch}
        />
      )}

      {stage === 'run' && <GeneratingPanel />}

      {stage === 'reel' && (
        <ReelResult
          reelUrl={reelUrl}
          error={error}
          assetCount={selected.length}
          onReorder={backToArrange}
          onRetry={handleStitch}
        />
      )}
    </div>
  );
}
