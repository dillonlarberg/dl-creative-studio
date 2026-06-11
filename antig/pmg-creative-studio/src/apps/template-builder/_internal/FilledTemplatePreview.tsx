import { useEffect, useRef, useState } from 'react';
import { injectIntoHtml, buildInteractiveScript } from './injectIntoHtml';

export const FilledTemplatePreview = ({
  templateFile,
  name,
  scale = 0.3,
  adSize = 1024,
  injections,
  cssOverrides,
  slotOverrides,
  onSlotClick,
  highlightSlot,
  slotSelectionMode = false,
}: {
  templateFile: string;
  name: string;
  scale?: number;
  adSize?: number;
  injections: Record<string, { type: 'image' | 'text'; value: string }>;
  cssOverrides?: Record<string, string>;
  slotOverrides?: Record<string, string>;
  onSlotClick?: (slotId: string) => void;
  highlightSlot?: string | null;
  slotSelectionMode?: boolean;
}) => {
  const [rawHtml, setRawHtml] = useState<string>('');
  const [srcdoc, setSrcdoc] = useState<string>('');
  const [loaded, setLoaded] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const clipSize = Math.round(adSize * scale);
  const isInteractive = Boolean(onSlotClick || slotSelectionMode);

  // Fetch raw HTML only when the template file changes (not on every injection update).
  useEffect(() => {
    setLoaded(false);
    setRawHtml('');
    fetch(`/template_examples/social/${templateFile}`)
      .then((r) => r.text())
      .then((html) => setRawHtml(html))
      .catch((err) =>
        console.error('[FilledTemplatePreview] fetch error:', err)
      );
  }, [templateFile]);

  // Re-apply injections into cached HTML whenever mappings/overrides change.
  // No fetch needed — rawHtml is already in memory, so updates are instant.
  useEffect(() => {
    if (!rawHtml) return;
    let filled = injectIntoHtml(rawHtml, injections, cssOverrides, slotOverrides);
    if (isInteractive) {
      filled = filled.replace('</body>', `${buildInteractiveScript()}</body>`);
    }
    setSrcdoc(filled);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawHtml, JSON.stringify(injections), JSON.stringify(cssOverrides), JSON.stringify(slotOverrides), isInteractive]);

  // Send highlight-slot message when highlightSlot prop changes
  useEffect(() => {
    if (!loaded || !iframeRef.current?.contentWindow) return;
    iframeRef.current.contentWindow.postMessage(
      { type: 'highlight-slot', slotId: highlightSlot ?? null },
      '*'
    );
  }, [highlightSlot, loaded]);

  // Send slot-selection-mode message when prop changes
  useEffect(() => {
    if (!loaded || !iframeRef.current?.contentWindow) return;
    iframeRef.current.contentWindow.postMessage(
      { type: 'slot-selection-mode', active: slotSelectionMode },
      '*'
    );
  }, [slotSelectionMode, loaded]);

  // Listen for slot-click postMessages from the iframe
  useEffect(() => {
    if (!onSlotClick) return;
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'slot-click' && e.data.slotId) {
        onSlotClick(e.data.slotId as string);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [onSlotClick]);

  return (
    <div
      style={{
        width: `${clipSize}px`,
        height: `${clipSize}px`,
        overflow: 'hidden',
        borderRadius: '4px',
        position: 'relative',
        flexShrink: 0,
        background: '#f3f4f6',
        boxShadow: slotSelectionMode
          ? '0 0 0 2px #2563eb'
          : '0 0 0 1px rgba(0,0,0,0.07)',
      }}
    >
      {!loaded && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'linear-gradient(90deg, #f3f4f6 25%, #e5e7eb 50%, #f3f4f6 75%)',
            backgroundSize: '200% 100%',
            animation: 'shimmer 1.5s infinite',
            zIndex: 2,
          }}
        />
      )}
      <div
        style={{
          width: `${adSize}px`,
          height: `${adSize}px`,
          transformOrigin: 'top left',
          transform: `scale(${scale})`,
          opacity: loaded ? 1 : 0,
          transition: 'opacity 0.3s ease',
        }}
      >
        {srcdoc && (
          <iframe
            ref={iframeRef}
            srcDoc={srcdoc}
            onLoad={() => setLoaded(true)}
            style={{
              width: `${adSize}px`,
              height: `${adSize}px`,
              border: 'none',
              pointerEvents: isInteractive ? 'auto' : 'none',
              display: 'block',
              cursor: slotSelectionMode ? 'crosshair' : 'default',
            }}
            title={name}
            scrolling="no"
            sandbox={isInteractive ? 'allow-same-origin allow-scripts' : 'allow-same-origin'}
          />
        )}
      </div>
    </div>
  );
};

export default FilledTemplatePreview;
