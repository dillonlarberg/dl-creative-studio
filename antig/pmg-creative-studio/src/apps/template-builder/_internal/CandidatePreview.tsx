import { type ClientAssetHouse } from '../../../services/clientAssetHouse';
import type { Candidate } from '../TemplateBuilderContext';
import { cn } from '../../../utils/cn';

const FALLBACK_LOGO =
  'https://www.gstatic.com/images/branding/product/2x/googleg_48dp.png';

export interface CandidatePreviewProps {
  candidate: Candidate;
  feedSampleData: Array<Record<string, unknown>>;
  feedMappings: Record<string, string>;
  assetHouse: ClientAssetHouse | null;
  logoVariant?: 'primary' | 'inverse';
  accentColor?: string;
  backgroundColor?: string;
  /** Which feed row index to preview (default 0). */
  feedIndex?: number;
  /** Selected aspect ratios, e.g. ['1:1', '16:9']. Defaults to ['1:1']. */
  ratios?: string[];
}

/**
 * Hand-composed multi-ratio ad preview (NOT iframe FilledTemplatePreview).
 * Extracted from the candidate-path render block of RefineStep.tsx.
 *
 * Renders one or more ratio frames (from `ratios`) for the given candidate,
 * injecting live feed values from `feedMappings` and brand tokens from
 * `assetHouse`.
 */
export function CandidatePreview({
  candidate,
  feedSampleData,
  feedMappings,
  assetHouse,
  logoVariant = 'primary',
  accentColor,
  backgroundColor,
  feedIndex = 0,
  ratios = ['1:1'],
}: CandidatePreviewProps) {
  const row = (feedSampleData[feedIndex] ?? {}) as Record<string, unknown>;

  const getValue = (key: string): string => {
    if (!key) return '';
    return (row[key] as string) || '';
  };

  const logoSrc =
    logoVariant === 'inverse'
      ? assetHouse?.logoInverse || assetHouse?.logoPrimary || FALLBACK_LOGO
      : assetHouse?.logoPrimary || FALLBACK_LOGO;

  const resolvedAccent =
    accentColor || candidate.styles.primaryColor || '#2563eb';
  const resolvedBg = backgroundColor || '#ffffff';
  const resolvedFont = candidate.styles.fontFamily || 'Inter';

  const activeRatios = ratios.length > 0 ? ratios : ['1:1'];

  return (
    <div className="flex items-center justify-center gap-12 overflow-x-auto scrollbar-hide p-4">
      {activeRatios.map((ratio) => {
        const [w, h] = ratio.includes(':') ? ratio.split(':').map(Number) : [1, 1];
        const baseWidth = 320;
        const scale = (w ?? 1) > (h ?? 1) ? 1.2 : 0.8;

        return (
          <div
            key={ratio}
            className="flex flex-col items-center gap-6 shrink-0 transform hover:scale-[1.02] transition-all duration-500"
          >
            {/* Ratio badge */}
            <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-full border border-gray-100 shadow-sm">
              <span className="text-[10px] font-black text-gray-900 tracking-tighter italic">
                {ratio}
              </span>
              <div className="h-1 w-1 bg-gray-200 rounded-full" />
              <span className="text-[8px] font-bold text-gray-400 uppercase tracking-widest">
                {(w ?? 1) > (h ?? 1) ? 'Landscape' : 'Vertical'}
              </span>
            </div>

            {/* Ad frame */}
            <div
              className="relative shadow-[0_32px_64px_-16px_rgba(0,0,0,0.2)] overflow-hidden transition-all duration-700"
              style={{
                width: `${baseWidth * scale}px`,
                aspectRatio: `${w ?? 1}/${h ?? 1}`,
                backgroundColor: resolvedBg,
                fontFamily: resolvedFont,
                borderRadius: candidate.styles.borderRadius || '0px',
                boxShadow: candidate.styles.shadow,
              }}
            >
              {/* Gradient overlay */}
              {candidate.styles.gradient && (
                <div
                  className="absolute inset-0 pointer-events-none opacity-40 mix-blend-multiply"
                  style={{ background: candidate.styles.gradient }}
                />
              )}

              {/* Logo layer */}
              {candidate.elements.logo && (
                <div className="absolute top-6 left-6 z-20">
                  <img
                    src={logoSrc}
                    className="h-10 w-auto object-contain"
                    alt="Brand logo"
                  />
                </div>
              )}

              {/* Core image layer */}
              <div
                className={cn(
                  'absolute overflow-hidden transition-all duration-700',
                  candidate.variant === 'wide'
                    ? 'inset-0'
                    : 'inset-x-6 top-20 bottom-36 rounded-2xl'
                )}
              >
                <img
                  src={getValue(feedMappings['image_url'] ?? '')}
                  className={cn(
                    'h-full w-full object-cover',
                    candidate.variant === 'wide' && 'opacity-50 blur-[2px] scale-110'
                  )}
                  alt="Product"
                />
              </div>

              {/* Text / CTA composite layer */}
              <div
                className={cn(
                  'absolute inset-x-6 bottom-6 flex flex-col gap-4 z-10 transition-all duration-500',
                  candidate.variant === 'stacked'
                    ? 'justify-center h-full top-0'
                    : 'justify-end'
                )}
              >
                {candidate.elements.headline && (
                  <div
                    className={cn(
                      'bg-white/95 backdrop-blur-xl p-4 shadow-2xl transition-all border-l-[6px]',
                      candidate.variant === 'stacked' ? 'bg-gray-900 border-white' : ''
                    )}
                    style={{
                      borderColor: resolvedAccent,
                      transform: `rotate(${candidate.styles.accentRotation || '0deg'})`,
                      transformOrigin: 'left center',
                    }}
                  >
                    <h2
                      className={cn(
                        'text-xs font-black uppercase italic leading-none tracking-tight',
                        candidate.variant === 'stacked' ? 'text-white' : 'text-gray-900'
                      )}
                    >
                      {getValue(feedMappings['headline'] ?? '') || 'No Headline Value'}
                    </h2>
                  </div>
                )}

                <div className="flex items-center justify-between gap-4">
                  {candidate.elements.price && (
                    <div
                      className="h-10 px-5 flex items-center justify-center shadow-lg"
                      style={{ backgroundColor: resolvedAccent }}
                    >
                      <span className="text-[11px] font-black text-white uppercase italic">
                        {getValue(feedMappings['price'] ?? '') || 'N/A'}
                      </span>
                    </div>
                  )}
                  {candidate.elements.cta && (
                    <div className="h-10 px-6 bg-white border-2 border-black flex items-center justify-center">
                      <span className="text-[9px] font-black uppercase tracking-widest">
                        SHOP NOW →
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default CandidatePreview;
