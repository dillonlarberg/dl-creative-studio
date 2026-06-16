import { useEffect } from 'react';
import { ExclamationTriangleIcon, SwatchIcon } from '@heroicons/react/24/outline';
import { Button } from '@agencypmg/alli-design-system';
import type { ClientAssetHouse } from '../../services/clientAssetHouse';
import { clientAssetHouseService } from '../../services/clientAssetHouse';
import { cn } from '../../utils/cn';

interface BrandKitPanelProps {
  assetHouse: ClientAssetHouse | null | undefined;
  isLoading?: boolean;
  error?: string | null;
  clientSlug: string;
  showVariables?: boolean;
  onEdit?: () => void;
  className?: string;
}

export function BrandKitPanel({
  assetHouse,
  isLoading,
  error,
  clientSlug,
  showVariables = false,
  onEdit,
  className,
}: BrandKitPanelProps) {
  const isConfigured = clientAssetHouseService.checkBrandStandards(assetHouse ?? null);

  // Load custom font from the assets array if available
  useEffect(() => {
    if (!assetHouse?.fontPrimary) return;
    const fontAsset = assetHouse.assets.find(
      (a) => a.type === 'font' && a.name === assetHouse.fontPrimary
    );
    if (fontAsset?.url) {
      clientAssetHouseService.loadCustomFont(assetHouse.fontPrimary, fontAsset.url);
    }
  }, [assetHouse]);

  if (isLoading) {
    return (
      <div className={cn('space-y-4 animate-pulse', className)}>
        <div className="flex justify-between">
          <div className="h-3 bg-gray-100 rounded w-20" />
          <div className="h-7 bg-gray-100 rounded w-24" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="h-10 bg-gray-100 rounded" />
          <div className="h-10 bg-gray-100 rounded" />
        </div>
        <div className="h-6 bg-gray-100 rounded w-1/2" />
        <div className="h-12 bg-gray-100 rounded" />
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn('flex items-start gap-2 text-sm text-red-600', className)}>
        <ExclamationTriangleIcon className="h-4 w-4 mt-0.5 shrink-0" />
        <span>{error}</span>
      </div>
    );
  }

  if (!assetHouse) {
    return (
      <div className={cn('flex flex-col items-center gap-3 py-6 text-center', className)}>
        <SwatchIcon className="h-8 w-8 text-gray-200" />
        <p className="text-xs font-semibold text-gray-400">No Brand Kit configured</p>
        <Button
          variant="secondary"
          as="a"
          href={`/adlabs/${clientSlug}/brand-standards`}
        >
          Set Up Brand Kit
        </Button>
      </div>
    );
  }

  const handleEdit = onEdit ?? (() => {
    window.open(`/adlabs/${clientSlug}/brand-standards`, '_blank');
  });

  const variables = showVariables ? (assetHouse.variables ?? []).slice(0, 4) : [];
  const remainingVars = showVariables ? Math.max(0, (assetHouse.variables ?? []).length - 4) : 0;

  return (
    <div className={cn('space-y-4', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <p className="text-[9px] font-black uppercase tracking-widest text-gray-500">Brand Kit</p>
          {!isConfigured && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-widest bg-amber-50 text-amber-700 border border-amber-200">
              Incomplete
            </span>
          )}
        </div>
        <Button variant="secondary" onClick={handleEdit}>
          Edit Brand Kit
        </Button>
      </div>

      {/* Colors */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <p className="text-[9px] font-black uppercase tracking-widest text-gray-400">Primary</p>
          <div className="flex items-center gap-2">
            <div
              className="w-4 h-4 rounded-md ring-1 ring-black/10 shrink-0"
              style={{ background: assetHouse.primaryColor }}
            />
            <span className="text-xs font-mono text-gray-600 truncate">{assetHouse.primaryColor}</span>
          </div>
        </div>
        {assetHouse.accentColor && (
          <div className="space-y-1">
            <p className="text-[9px] font-black uppercase tracking-widest text-gray-400">Accent</p>
            <div className="flex items-center gap-2">
              <div
                className="w-4 h-4 rounded-md ring-1 ring-black/10 shrink-0"
                style={{ background: assetHouse.accentColor }}
              />
              <span className="text-xs font-mono text-gray-600 truncate">{assetHouse.accentColor}</span>
            </div>
          </div>
        )}
      </div>

      {/* Font */}
      {assetHouse.fontPrimary && (
        <div className="space-y-1">
          <p className="text-[9px] font-black uppercase tracking-widest text-gray-400">Font</p>
          <span
            className="text-sm text-gray-700"
            style={{ fontFamily: assetHouse.fontPrimary }}
          >
            Aa — {assetHouse.fontPrimary}
          </span>
        </div>
      )}

      {/* Logos */}
      {(assetHouse.logoPrimary || assetHouse.logoInverse) && (
        <div className="space-y-1">
          <p className="text-[9px] font-black uppercase tracking-widest text-gray-400">Logos</p>
          <div className="flex gap-3">
            {assetHouse.logoPrimary && (
              <div className="space-y-1">
                <div className="w-16 h-9 rounded border border-gray-100 bg-white flex items-center justify-center overflow-hidden">
                  <img src={assetHouse.logoPrimary} alt="Primary logo" className="max-w-full max-h-full object-contain" />
                </div>
                <p className="text-[9px] text-gray-400 text-center">Light</p>
              </div>
            )}
            {assetHouse.logoInverse && (
              <div className="space-y-1">
                <div className="w-16 h-9 rounded border border-gray-800 bg-gray-900 flex items-center justify-center overflow-hidden">
                  <img src={assetHouse.logoInverse} alt="Inverse logo" className="max-w-full max-h-full object-contain" />
                </div>
                <p className="text-[9px] text-gray-400 text-center">Dark</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Custom Variables */}
      {showVariables && variables.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-gray-50">
          <p className="text-[9px] font-black uppercase tracking-widest text-gray-400">
            Variables ({assetHouse.variables.length})
          </p>
          {variables.map((v) => (
            <div key={v.id} className="flex items-center justify-between text-xs">
              <span className="text-gray-500 truncate">{v.name}</span>
              {v.type === 'color' ? (
                <div className="flex items-center gap-1.5 shrink-0">
                  <div className="w-3 h-3 rounded ring-1 ring-black/10" style={{ background: v.value }} />
                  <span className="font-mono text-gray-600">{v.value}</span>
                </div>
              ) : (
                <span className="text-gray-600 font-medium truncate ml-2">{v.value}</span>
              )}
            </div>
          ))}
          {remainingVars > 0 && (
            <p className="text-[10px] text-gray-400">and {remainingVars} more</p>
          )}
        </div>
      )}
    </div>
  );
}
