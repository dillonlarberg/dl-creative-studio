import type { ClientAssetHouse } from '../../services/clientAssetHouse';

export type EditType = 'background' | 'text' | 'colors';

export type RecommendationCategory = 'visuals-background' | 'hero-text' | 'brand-alignment';

export type RecommendationActionType = EditType;

export type RecommendationConfidence = 'low' | 'medium' | 'high';

export interface CreativeRecommendation {
  category: RecommendationCategory;
  title: string;
  description: string;
  confidence: RecommendationConfidence;
  dataChips: string[];
  actionType: RecommendationActionType;
  isTopRecommendation: boolean;
}

export interface ImageAnalysisColor {
  hexColor: string;
  imagePercentage: number;
}

export interface ImageAnalysisFace {
  joyLikelihood: string;
  angerLikelihood: string;
  sorrowLikelihood: string;
  surpriseLikelihood: string;
}

export interface ImageAnalysis {
  colors: ImageAnalysisColor[];
  labels: string[];
  objects: string[];
  text: string[];
  faces: ImageAnalysisFace[];
  links: string[];
}

export interface ScorecardData {
  brandVisuals: boolean;
  callToActionText: boolean;
  fatigueStatus: string | null;
  ctr: number | null;
  cpm: number | null;
}

export interface EditImageStepData {
  imageSource?: 'alli' | 'upload';
  imageUrl?: string;
  imageName?: string;
  assetId?: string;
  platform?: string;
  editType?: EditType;
  imageAnalysis?: ImageAnalysis;
  recommendations?: CreativeRecommendation[];
  scorecardData?: ScorecardData;
  extractedImageUrl?: string;
  extractionMethod?: string;
  maskDataUrl?: string;
  selectedBackground?: string;
  customColor?: string;
  previewReady?: boolean;
  compositeDataUrl?: string;
  finalUrl?: string;
  savedToAssetHouse?: boolean;
}

export interface EditImageStepProps {
  stepData: EditImageStepData;
  onStepDataChange: (patch: Partial<EditImageStepData>) => void;
  clientSlug: string;
  assetHouse: ClientAssetHouse | null;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  onAdvance?: () => void | Promise<void>;
}
