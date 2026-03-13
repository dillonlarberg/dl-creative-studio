import type { ClientAssetHouse } from '../../services/clientAssetHouse';

export type EditType = 'background' | 'text' | 'colors';

export interface EditImageStepData {
  // Step 1 — Select Image
  imageUrl?: string;
  imageName?: string;
  imageSource?: 'alli' | 'upload';
  assetId?: string;
  platform?: string;

  // Step 2 — Edit Type
  editType?: EditType;

  // Step 3 — Canvas (extraction)
  extractedImageUrl?: string;
  extractionMethod?: 'auto' | 'manual';
  maskDataUrl?: string;

  // Step 4 — New Background
  selectedBackground?: { type: 'color'; value: string } | { type: 'image'; url: string; name: string };
  customColor?: string;

  // Step 5 — Preview (CSS layering, no server data needed)
  previewReady?: boolean;

  // Step 6 — Save
  compositeDataUrl?: string;
  finalUrl?: string;
  savedToAssetHouse?: boolean;
}

export interface EditImageStepProps {
  stepData: EditImageStepData;
  onStepDataChange: (updates: Partial<EditImageStepData>) => void;
  clientSlug: string;
  assetHouse: ClientAssetHouse | null;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
}
