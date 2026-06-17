import type { CSSProperties } from 'react';
import { cn } from '../../../utils/cn';
import type { ZoneStyle } from '../types';

export function ZoneStyleToolbar({
  slotId,
  current,
  onChange,
}: {
  slotId: string;
  current: ZoneStyle | undefined;
  onChange: (slotId: string, partial: Partial<ZoneStyle>) => void;
}) {
  const toggleBtn = (
    label: string,
    active: boolean,
    onToggle: () => void,
    style?: CSSProperties
  ) => (
    <button
      type="button"
      onClick={onToggle}
      style={style}
      className={cn(
        'w-6 h-6 rounded-md border text-[10px] leading-none transition-all flex items-center justify-center',
        active
          ? 'border-indigo-400 bg-indigo-50 text-indigo-700'
          : 'border-gray-200 bg-white text-gray-500 hover:border-indigo-300'
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-wrap items-center gap-3 px-3 py-2 bg-gray-50 rounded-xl border border-gray-100 mt-1">
      <label className="flex items-center gap-1.5">
        <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Size</span>
        <input
          type="number"
          min={8}
          max={120}
          placeholder="—"
          value={current?.fontSize ?? ''}
          onChange={(e) => {
            const v = parseInt(e.target.value, 10);
            onChange(slotId, { fontSize: isNaN(v) ? undefined : v });
          }}
          className="w-14 px-1.5 py-1 rounded-lg border border-gray-200 text-[9px] font-medium text-gray-700 bg-white focus:border-blue-400 focus:outline-none"
        />
      </label>
      <label className="flex items-center gap-1.5">
        <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Color</span>
        <input
          type="color"
          value={current?.color ?? '#000000'}
          onChange={(e) => onChange(slotId, { color: e.target.value })}
          className="w-6 h-6 rounded cursor-pointer border-0 p-0"
        />
      </label>
      <label className="flex items-center gap-1.5">
        <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest">BG</span>
        <input
          type="color"
          value={current?.backgroundColor ?? '#ffffff'}
          onChange={(e) => onChange(slotId, { backgroundColor: e.target.value })}
          className="w-6 h-6 rounded cursor-pointer border-0 p-0"
        />
      </label>
      <div className="flex items-center gap-1">
        {toggleBtn(
          'B',
          current?.fontWeight === 'bold',
          () => onChange(slotId, { fontWeight: current?.fontWeight === 'bold' ? 'normal' : 'bold' }),
          { fontWeight: 700 }
        )}
        {toggleBtn(
          'I',
          current?.fontStyle === 'italic',
          () => onChange(slotId, { fontStyle: current?.fontStyle === 'italic' ? 'normal' : 'italic' }),
          { fontStyle: 'italic' }
        )}
        {toggleBtn(
          'U',
          current?.textDecoration === 'underline',
          () => onChange(slotId, { textDecoration: current?.textDecoration === 'underline' ? 'none' : 'underline' }),
          { textDecoration: 'underline' }
        )}
      </div>
    </div>
  );
}
