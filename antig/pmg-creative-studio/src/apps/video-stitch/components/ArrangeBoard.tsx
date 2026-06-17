/**
 * ArrangeBoard — stage 2: drag-to-reorder filmstrip + read-only beat ruler.
 *
 * Ordering IS the narrative (the product premise). @dnd-kit gives robust touch +
 * keyboard reordering; onDragEnd commits via the tested `arrayMove`. The ruler
 * mirrors backend `planStitch` via `planDurations` (display only). 8-asset cap.
 */
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '../../../utils/cn';
import { arrayMove } from '../utils/reorder';
import { planDurations } from '../utils/planDurations';
import type { PickedAsset } from '../types';

const RULER_COLORS = ['#0C69EA', '#7c3aed', '#0ea5e9', '#f59e0b', '#10b981', '#ec4899', '#6366f1', '#ef4444'];

interface Props {
  selected: PickedAsset[];
  onChange: (next: PickedAsset[]) => void;
  onBack: () => void;
  onContinue: () => void;
}

export default function ArrangeBoard({ selected, onChange, onBack, onContinue }: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const plan = planDurations({ count: selected.length });
  const durs = plan?.slots.map((s) => s.durationSec) ?? [];

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = selected.findIndex((a) => a.assetId === active.id);
    const to = selected.findIndex((a) => a.assetId === over.id);
    if (from < 0 || to < 0) return;
    onChange(arrayMove(selected, from, to));
  };

  return (
    <section data-stage="arrange">
      <div className="mb-4 rounded-xl border border-indigo-100 bg-gradient-to-b from-indigo-50/60 to-white px-4 py-3">
        <p className="text-[13px] font-semibold text-gray-900">Drag to set the order — this is your narrative</p>
        <p className="mt-1 text-[12px] leading-5 text-gray-500">
          The tool doesn't pick or re-order for you. You curate the sequence; we handle the mechanics:
          normalize each asset to 9:16, add motion to statics, and land every cut on the beat.{' '}
          <b className="font-medium text-gray-700">No AI guesses your story.</b>
        </p>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={selected.map((a) => a.assetId)} strategy={horizontalListSortingStrategy}>
          <div className="flex flex-wrap gap-3">
            {selected.map((a, i) => (
              <SortableClip key={a.assetId} asset={a} index={i} durationSec={durs[i]} />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <div className="mt-6">
        <div className="mb-1.5 flex items-center justify-between text-[12px] text-gray-400">
          <span>Beat grid · cuts land on the beat</span>
          <span className="font-mono">total {(plan?.totalSec ?? 0).toFixed(1)}s</span>
        </div>
        <div className="relative flex h-9 w-full overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
          {durs.map((d, i) => (
            <div
              key={selected[i]?.assetId ?? i}
              className="flex items-center justify-center border-r border-white/40 text-[10px] font-medium text-white"
              style={{ flex: d, background: RULER_COLORS[i % RULER_COLORS.length] }}
            >
              {d.toFixed(1)}s
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between border-t border-gray-200 pt-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-gray-500 hover:text-gray-800"
        >
          Back to assets
        </button>
        <button
          type="button"
          onClick={onContinue}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-blue-700 active:bg-blue-800"
        >
          Continue to music
        </button>
      </div>
    </section>
  );
}

function SortableClip({ asset, index, durationSec }: { asset: PickedAsset; index: number; durationSec?: number }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: asset.assetId,
  });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const isVideo = asset.kind === 'video';

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        'relative w-[150px] shrink-0 cursor-grab rounded-xl border border-gray-200 bg-white p-2 shadow-sm transition-shadow',
        'hover:border-blue-300 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600',
        isDragging && 'opacity-40',
      )}
      aria-label={`Position ${index + 1}: ${asset.name}. Use space then arrow keys to reorder.`}
    >
      <div className="absolute -left-1.5 -top-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-[11px] font-bold text-white shadow">
        {index + 1}
      </div>
      <div className="relative mb-2 overflow-hidden rounded-lg bg-blue-gray-100" style={{ aspectRatio: '9 / 16' }}>
        {isVideo ? (
          <video src={asset.srcUrl} muted playsInline preload="metadata" className="h-full w-full object-cover" />
        ) : (
          <img src={asset.srcUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
        )}
        {durationSec != null && (
          <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1.5 py-0.5 font-mono text-[10px] text-white">
            {durationSec.toFixed(1)}s
          </span>
        )}
      </div>
      <p className="truncate text-[11px] font-medium text-gray-800" title={asset.name}>
        {asset.name}
      </p>
      <span
        className={cn(
          'mt-1 inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium',
          isVideo ? 'bg-blue-50 text-blue-700' : 'bg-violet-50 text-violet-700',
        )}
      >
        {isVideo ? 'trim to beat' : 'motion (Ken Burns)'}
      </span>
    </div>
  );
}
