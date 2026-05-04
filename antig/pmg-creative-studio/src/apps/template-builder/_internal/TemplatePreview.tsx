import { useRef, useState } from 'react';

/**
 * Lifted verbatim from src/pages/use-cases/UseCaseWizardPage.tsx lines 33-97.
 *
 * Module-level (outside the wizard component) so it is NEVER re-created on
 * state changes — iframes never reload when e.g. a size button is clicked.
 *
 * Rendering strategy:
 *   • iframe is rendered at FULL adSize (e.g. 1024×1024) → browser fetches
 *     images at native resolution (no pixelation)
 *   • A CSS transform: scale() on the outer wrapper shrinks it to clipSize
 *     → pure GPU compositing, no quality loss
 */
export const TemplatePreview = ({
  templateFile,
  name,
  scale = 0.2,
  adSize = 1024,
}: {
  templateFile: string;
  name: string;
  scale?: number;
  adSize?: number;
}) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [loaded, setLoaded] = useState(false);
  const clipSize = Math.round(adSize * scale);

  const handleLoad = () => setLoaded(true);

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
        boxShadow: '0 0 0 1px rgba(0,0,0,0.07)',
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
        <iframe
          ref={iframeRef}
          src={`/template_examples/social/${templateFile}`}
          onLoad={handleLoad}
          loading="lazy"
          style={{
            width: `${adSize}px`,
            height: `${adSize}px`,
            border: 'none',
            pointerEvents: 'none',
            display: 'block',
          }}
          title={name}
          scrolling="no"
        />
      </div>
    </div>
  );
};

export default TemplatePreview;
