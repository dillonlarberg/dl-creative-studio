import { SparklesIcon } from '@heroicons/react/24/solid';
import { ArrowRightIcon } from '@heroicons/react/24/outline';
import { cn } from '../../../utils/cn';

interface BriefPanelProps {
  targetSec: number;
  brief: string;
  onChange: (v: { targetSec: number; brief: string }) => void;
  /** Optional "send the brief" affordance on the Ask Alli prompt (kicks off generation). */
  onSubmit?: () => void;
}

const LENGTH_OPTIONS = [15, 30, 60] as const;

export default function BriefPanel({ targetSec, brief, onChange, onSubmit }: BriefPanelProps) {
  return (
    <div className="mx-auto max-w-[760px] space-y-4">
      {/* Target length */}
      <div className="rounded-xl border border-gray-200 p-5">
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Target length</p>
        <div className="grid grid-cols-3 gap-2">
          {LENGTH_OPTIONS.map((sec) => {
            const selected = sec === targetSec;
            return (
              <button
                key={sec}
                type="button"
                onClick={() => onChange({ targetSec: sec, brief })}
                className={cn(
                  'rounded-lg border px-3 py-2.5 text-[13px] font-medium',
                  selected
                    ? 'border-blue-600 bg-blue-50 text-blue-700'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-blue-300 hover:bg-blue-50/40',
                )}
              >
                {sec}s
              </button>
            );
          })}
        </div>
        <div className="mt-4 flex items-center gap-2.5">
          <div className="aspect-[9/16] w-9 shrink-0 overflow-hidden rounded border border-gray-200 bg-gradient-to-b from-gray-100 to-gray-200" />
          <div className="flex items-center gap-1.5 text-[12px] text-gray-500">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-3.5 w-3.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75M6 10.5h12A1.5 1.5 0 0 1 19.5 12v6A1.5 1.5 0 0 1 18 19.5H6A1.5 1.5 0 0 1 4.5 18v-6A1.5 1.5 0 0 1 6 10.5Z" />
            </svg>
            <span>9:16 · 1080×1920 — locked for V1</span>
          </div>
        </div>
      </div>

      {/* Creative brief — Ask Alli prompt */}
      <div className="rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50/70 to-violet-50/40 p-5">
        <div className="mb-3 flex items-center gap-1.5">
          <SparklesIcon className="h-4 w-4 text-indigo-600" />
          <span className="text-[13px] font-semibold text-indigo-600">Ask Alli</span>
          <span className="ml-0.5 text-[11px] font-medium text-gray-400">— steer the cut (optional)</span>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            background: '#eef0f6',
            borderRadius: 20,
            padding: '10px 10px 10px 16px',
            gap: 8,
          }}
        >
          <textarea
            rows={3}
            value={brief}
            onChange={(e) => onChange({ targetSec, brief: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onSubmit?.();
            }}
            placeholder="e.g. Focus on the product demo and the founder's key line…"
            className="alli-prompt-input"
            style={{
              flex: 1,
              minWidth: 0,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              resize: 'none',
              WebkitAppearance: 'none',
              fontSize: 13,
              lineHeight: 1.5,
              color: '#374151',
              padding: 0,
              fontFamily: 'inherit',
            }}
          />
          <button
            type="button"
            onClick={() => onSubmit?.()}
            aria-label="Generate with this brief"
            style={{
              flexShrink: 0,
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #6366f1, #7c3aed)',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
            }}
          >
            <ArrowRightIcon className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-2 text-[11px] text-gray-500">
          Empty = Alli finds the most engaging moments. Filled = she biases all three versions toward your brief.
        </p>
      </div>

      {/* Explainer banner */}
      <div className="flex items-center gap-2 rounded-lg border border-indigo-100 bg-indigo-50 px-3.5 py-2.5 text-[13px] font-medium text-indigo-700">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="h-4 w-4 shrink-0 text-indigo-500">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
        </svg>
        <span>
          Alli will generate <span className="font-semibold">3 versions</span> — Narrative, Highlights, and Punchy — and you pick one.
        </span>
      </div>
    </div>
  );
}
