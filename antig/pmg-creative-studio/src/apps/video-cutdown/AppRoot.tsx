import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import { Button } from '@agencypmg/alli-design-system';
import { newId } from '../../utils/ids';
import { useCutdown } from './hooks/useCutdown';
import { useCutdownBatch } from './hooks/useCutdownBatch';
import StepIndicator from './components/StepIndicator';
import SourcePanel, { type UploadedSource } from './components/SourcePanel';
import MusicPicker from './components/MusicPicker';
import BriefPanel from './components/BriefPanel';
import VersionsBoard from './components/VersionsBoard';
import RenderResult from './components/RenderResult';
import type { Stage, Angle } from './types';

interface RenderResponse {
  mp4Url: string;
  angle: Angle;
}

const INITIAL_CFG = { targetSec: 15, brief: '' };

export default function VideoCutdownAppRoot() {
  const { clientSlug = '' } = useParams<{ clientSlug: string }>();
  const { generate, render } = useCutdown();

  const [stage, setStage] = useState<Stage>('source');
  const [source, setSource] = useState<UploadedSource | null>(null);
  const [trackId, setTrackId] = useState<string | null>(null);
  const [cfg, setCfg] = useState<{ targetSec: number; brief: string }>(INITIAL_CFG);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [selectedAngle, setSelectedAngle] = useState<Angle | null>(null);
  const [mp4Url, setMp4Url] = useState<string | null>(null);
  const [renderedAngle, setRenderedAngle] = useState<Angle | null>(null);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { batch, versions } = useCutdownBatch(clientSlug, batchId);

  // Surface a backend-side batch failure as a banner (the live subscription is
  // the only signal once generation is in flight).
  const batchFailed = batch?.status === 'failed';

  function resetAll() {
    setStage('source');
    setSource(null);
    setTrackId(null);
    setCfg(INITIAL_CFG);
    setBatchId(null);
    setSelectedAngle(null);
    setMp4Url(null);
    setRenderedAngle(null);
    setRendering(false);
    setError(null);
  }

  function handleUploaded(src: UploadedSource) {
    setSource(src);
    setStage('music');
  }

  function handlePickTrack(id: string) {
    setTrackId(id);
    setStage('brief');
  }

  function handleGenerate() {
    if (!source || !trackId) return;
    const id = newId();
    setError(null);
    setSelectedAngle(null);
    setBatchId(id);
    setStage('run');
    generate({
      clientSlug,
      batchId: id,
      videoStoragePath: source.storagePath,
      trackId,
      targetSec: cfg.targetSec,
      brief: cfg.brief || undefined,
      sourceName: source.name,
    }).catch((e) => setError(e instanceof Error ? e.message : 'Generation failed'));
  }

  function handleRender() {
    const v = versions.find((x) => x.angle === selectedAngle);
    if (!v || !source || !trackId || !batchId) return;
    setRendering(true);
    setError(null);
    render({
      clientSlug,
      batchId,
      videoStoragePath: source.storagePath,
      trackId,
      targetSec: cfg.targetSec,
      plan: { angle: v.angle, description: v.description, cuts: v.cuts },
    })
      .then((r) => {
        const data = r.data as RenderResponse;
        setMp4Url(data.mp4Url);
        setRenderedAngle(data.angle ?? v.angle);
        setStage('render');
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Render failed'))
      .finally(() => setRendering(false));
  }

  return (
    <div className="flex min-h-[calc(100vh-132px)] flex-col gap-0 rounded-2xl bg-white px-6 py-6 shadow-sm ring-1 ring-gray-900/5">
      {/* Page header */}
      <div className="mb-5">
        <Link
          to={`/adlabs/${clientSlug}/`}
          className="mb-3 inline-flex items-center gap-1.5 text-[13px] text-gray-500 hover:text-gray-700"
        >
          <ArrowLeftIcon className="h-3.5 w-3.5" />
          Back to AdLabs
        </Link>
        <h1 className="text-[20px] font-semibold text-gray-900">Video Cutdown</h1>
        <p className="mt-0.5 text-[13px] text-gray-500">
          Turn one long video into a sharp, beat-synced 9:16 cut — 3 AI versions, pick one.
        </p>
      </div>

      {/* Step indicator + step-back affordance */}
      <div className="mb-5 flex items-center justify-between">
        <StepIndicator current={stage} />
        {stage === 'music' && (
          <Button
            variant="text"
            icon={<ArrowLeftIcon className="alli-h-3.5 alli-w-3.5" />}
            onClick={() => setStage('source')}
          >
            Back to Source
          </Button>
        )}
        {stage === 'brief' && (
          <Button
            variant="text"
            icon={<ArrowLeftIcon className="alli-h-3.5 alli-w-3.5" />}
            onClick={() => setStage('music')}
          >
            Back to Music
          </Button>
        )}
      </div>

      {(error || batchFailed) && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700"
        >
          {error ?? 'Generation failed on the server. Please try again.'}
          <button type="button" onClick={() => setError(null)} className="ml-3 underline">
            dismiss
          </button>
        </div>
      )}

      {/* Stage content */}
      {stage === 'source' && <SourcePanel onUploaded={handleUploaded} />}

      {stage === 'music' && (
        <div className="space-y-5">
          <MusicPicker selectedTrackId={trackId} onPick={handlePickTrack} />
        </div>
      )}

      {stage === 'brief' && (
        <div className="space-y-5">
          <BriefPanel
            targetSec={cfg.targetSec}
            brief={cfg.brief}
            onChange={setCfg}
            onSubmit={handleGenerate}
          />
          <div className="mx-auto flex max-w-[760px] items-center justify-end border-t border-gray-200 pt-4">
            <Button variant="primary" onClick={handleGenerate}>
              Generate 3 versions
            </Button>
          </div>
        </div>
      )}

      {stage === 'run' && (
        <VersionsBoard
          batch={batch}
          versions={versions}
          selectedAngle={selectedAngle}
          onSelect={setSelectedAngle}
          onRender={handleRender}
          rendering={rendering}
        />
      )}

      {stage === 'render' && mp4Url && renderedAngle && (
        <RenderResult mp4Url={mp4Url} angle={renderedAngle} onRestart={resetAll} />
      )}
    </div>
  );
}
