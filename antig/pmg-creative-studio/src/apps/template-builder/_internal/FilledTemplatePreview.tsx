import { useEffect, useState } from 'react';
import { injectIntoHtml } from './injectIntoHtml';

/**
 * Lifted verbatim from src/pages/use-cases/UseCaseWizardPage.tsx lines 239-319.
 * Same scaling strategy as TemplatePreview, but fetches the HTML source,
 * injects real mapped values (images + text) by element-ID matching, then
 * renders via `srcdoc`.
 */
export const FilledTemplatePreview = ({
  templateFile,
  name,
  scale = 0.3,
  adSize = 1024,
  injections,
  cssOverrides,
}: {
  templateFile: string;
  name: string;
  scale?: number;
  adSize?: number;
  injections: Record<string, { type: 'image' | 'text'; value: string }>;
  cssOverrides?: Record<string, string>;
}) => {
  const [srcdoc, setSrcdoc] = useState<string>('');
  const [loaded, setLoaded] = useState(false);
  const clipSize = Math.round(adSize * scale);

  useEffect(() => {
    setLoaded(false);
    setSrcdoc('');
    fetch(`/template_examples/social/${templateFile}`)
      .then((r) => r.text())
      .then((html) => {
        const filled = injectIntoHtml(html, injections, cssOverrides);
        setSrcdoc(filled);
      })
      .catch((err) =>
        console.error('[FilledTemplatePreview] fetch error:', err)
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateFile, JSON.stringify(injections), JSON.stringify(cssOverrides)]);

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
        {srcdoc && (
          <iframe
            srcDoc={srcdoc}
            onLoad={() => setLoaded(true)}
            style={{
              width: `${adSize}px`,
              height: `${adSize}px`,
              border: 'none',
              pointerEvents: 'none',
              display: 'block',
            }}
            title={name}
            scrolling="no"
            sandbox="allow-same-origin"
          />
        )}
      </div>
    </div>
  );
};

export default FilledTemplatePreview;
