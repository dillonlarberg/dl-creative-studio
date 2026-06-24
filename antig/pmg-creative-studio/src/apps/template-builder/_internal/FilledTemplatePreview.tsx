import { useCallback, useEffect, useRef, useState } from 'react';
import { injectIntoHtml, buildInteractiveScript, buildCssRulesString, buildZoneRulesString } from './injectIntoHtml';
import type { ZoneStyle, ZoneBound, CustomZone } from '../types';

export const FilledTemplatePreview = ({
  templateFile,
  name,
  scale = 0.3,
  adSize = 1024,
  injections,
  cssOverrides,
  slotOverrides,
  zoneStyles,
  layoutOverrides,
  zoneAssets,
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
  zoneStyles?: Record<string, ZoneStyle>;
  layoutOverrides?: { zoneOverrides?: Record<string, ZoneBound>; customZones?: CustomZone[] };
  zoneAssets?: Record<string, string>;
  onSlotClick?: (slotId: string) => void;
  highlightSlot?: string | null;
  slotSelectionMode?: boolean;
}) => {
  const [rawHtml, setRawHtml] = useState<string>('');
  const [srcdoc, setSrcdoc] = useState<string>('');
  const [loaded, setLoaded] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  // True once the iframe has loaded with the current rawHtml — enables postMessage live updates.
  const iframeLiveRef = useRef(false);
  const clipSize = Math.round(adSize * scale);
  const isInteractive = Boolean(onSlotClick || slotSelectionMode);

  // Fetch raw HTML only when the template file changes.
  useEffect(() => {
    setLoaded(false);
    setRawHtml('');
    iframeLiveRef.current = false;
    fetch(`/template_examples/social/${templateFile}`)
      .then((r) => r.text())
      .then((html) => setRawHtml(html))
      .catch((err) =>
        console.error('[FilledTemplatePreview] fetch error:', err)
      );
  }, [templateFile]);

  // Full srcdoc rebuild only when rawHtml or interactive mode changes.
  // Injection/style changes are handled by the postMessage effect below.
  useEffect(() => {
    if (!rawHtml) return;
    iframeLiveRef.current = false;
    let filled = injectIntoHtml(rawHtml, { injections, cssOverrides, slotOverrides, zoneStyles, layoutOverrides, zoneAssets });
    if (isInteractive) {
      filled = filled.replace('</body>', `${buildInteractiveScript()}</body>`);
    }
    setSrcdoc(filled);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawHtml, isInteractive, JSON.stringify(layoutOverrides), JSON.stringify(zoneAssets)]);

  // Live update via postMessage when injections/overrides change after the iframe is ready.
  // Skips the full srcdoc reload cycle — updates apply directly to the existing iframe DOM.
  useEffect(() => {
    if (!iframeLiveRef.current || !iframeRef.current?.contentWindow) return;
    iframeRef.current.contentWindow.postMessage(
      {
        type: 'apply-updates',
        injections,
        slotOverrides: slotOverrides ?? {},
        cssRules: buildCssRulesString(cssOverrides),
        zoneRules: buildZoneRulesString(zoneStyles),
      },
      '*'
    );
    // Parent-side overflow check — runs 300ms after apply-updates to give the iframe DOM
    // time to reflow. This bypasses the baked-in reportOverflow script so the check always
    // uses the latest logic (e.g. detects overflow:hidden zone containers with large fonts).
    const tid = setTimeout(() => {
      const doc = iframeRef.current?.contentDocument;
      if (!doc) return;
      try {
        const overflowing: string[] = [];
        doc.querySelectorAll<HTMLElement>('[id]').forEach((el) => {
          if (el.clientWidth === 0 && el.clientHeight === 0) return;
          if (el.scrollHeight > el.clientHeight + 2 || el.scrollWidth > el.clientWidth + 2) {
            overflowing.push(el.id);
          }
        });
        window.postMessage({ type: 'zone-overflow', overflowing }, '*');
      } catch (_e) { /* cross-origin safety guard */ }
    }, 300);
    return () => clearTimeout(tid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(injections), JSON.stringify(cssOverrides), JSON.stringify(slotOverrides), JSON.stringify(zoneStyles)]);

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

  const handleIframeLoad = useCallback(() => {
    setLoaded(true);
    iframeLiveRef.current = true;
  }, []);

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
            onLoad={handleIframeLoad}
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
