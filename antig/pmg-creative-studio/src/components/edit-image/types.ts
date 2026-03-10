import type { ClientAssetHouse } from '../../services/clientAssetHouse';
import type { BackgroundCatalogItem, RenderVariation } from '../../services/imageEditService';

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

  // Step 3 — Background Config
  selectedBackground?: BackgroundCatalogItem;
  variationCount?: number;

  // Step 4 — Preview
  variations?: RenderVariation[];
  selectedVariation?: RenderVariation;

  // Step 5 — Save
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
