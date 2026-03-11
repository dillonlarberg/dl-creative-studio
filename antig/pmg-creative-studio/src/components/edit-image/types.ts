import type { ClientAssetHouse } from '../../services/clientAssetHouse';
import type { RenderVariation } from '../../services/imageEditService';

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

  // Step 4 — New Background
  selectedBackground?: { type: 'color'; value: string } | { type: 'image'; url: string; name: string };
  customColor?: string;

  // Step 5 — Preview
  selectedVariation?: RenderVariation;

  // Step 6 — Save
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
