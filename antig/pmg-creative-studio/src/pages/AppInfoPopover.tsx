import { useState } from 'react';
import {
  useFloating,
  autoUpdate,
  offset,
  flip,
  shift,
  useHover,
  useFocus,
  useClick,
  useDismiss,
  useInteractions,
  safePolygon,
  FloatingPortal,
  useId,
} from '@floating-ui/react';
import { Button } from '@agencypmg/alli-design-system';
import type { AppOverview } from '../apps/types';

const AFTER_COLS: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-3',
};

interface AppInfoPopoverProps {
  title: string;
  overview?: AppOverview;
}

/**
 * The dashboard card's "More Info" trigger + its Glance popover. Hover (pointer)
 * or focus (keyboard) or click (touch) opens it; Esc / outside-click / mouse-leave
 * closes it. Renders nothing when the tool has no curated `overview`.
 */
export function AppInfoPopover({ title, overview }: AppInfoPopoverProps) {
  const [open, setOpen] = useState(false);
  const popoverId = useId();

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: 'top',
    whileElementsMounted: autoUpdate,
    middleware: [offset(10), flip(), shift({ padding: 8 })],
  });

  const hover = useHover(context, {
    delay: { open: 80, close: 120 },
    handleClose: safePolygon(),
  });
  // visibleOnly: false is needed for jsdom compatibility in tests; in a real
  // browser this does not change UX since keyboard focus always matches
  // :focus-visible on interactive elements.
  const focus = useFocus(context, { visibleOnly: false });
  const click = useClick(context);
  const dismiss = useDismiss(context);
  const { getReferenceProps, getFloatingProps } = useInteractions([hover, focus, click, dismiss]);

  if (!overview) return null;

  return (
    <>
      <Button
        ref={refs.setReference}
        variant="secondary"
        type="button"
        aria-expanded={open ? 'true' : 'false'}
        aria-describedby={open ? popoverId : undefined}
        {...getReferenceProps()}
      >
        More Info
      </Button>

      {open && (
        <FloatingPortal>
          <div
            // eslint-disable-next-line react-hooks/refs -- floating-ui callback ref-setter (a function), not a render-time ref.current access
            ref={refs.setFloating}
            id={popoverId}
            role="region"
            aria-label={`${title} overview`}
            style={floatingStyles}
            className="z-50 w-64 rounded-xl border border-gray-200 bg-white p-3 shadow-xl"
            {...getFloatingProps()}
          >
            <p className="text-sm font-semibold text-gray-900">{title}</p>
            <p className="mt-0.5 text-xs leading-snug text-gray-600">{overview.blurb}</p>
            <div className="mt-2 flex items-center gap-2">
              <img
                src={overview.before}
                alt={`${title} source example`}
                className="h-10 w-9 shrink-0 rounded object-cover"
              />
              <span aria-hidden className="text-gray-400">→</span>
              <div className={`grid flex-1 gap-1 ${AFTER_COLS[Math.min(overview.after.length, 3)] ?? 'grid-cols-3'}`}>
                {overview.after.map((src, i) => (
                  <img
                    key={i}
                    src={src}
                    alt={`${title} output example ${i + 1}`}
                    className="h-9 w-full rounded object-cover"
                  />
                ))}
              </div>
            </div>
          </div>
        </FloatingPortal>
      )}
    </>
  );
}
