import type { SelectedFeed } from '../../platform/datasources/types';
export type { SelectedFeed };

export type Channel = 'Social' | 'Programmatic' | 'Print' | 'Digital Signage';
export type LogoVariant = 'primary' | 'inverse';

export interface RequirementField {
  id: string;
  label: string;
  category: 'Brand' | 'Dynamic' | 'System';
  source: string;
  type: 'text' | 'image' | 'currency' | 'button' | 'asset';
  value?: string;
}

export interface TemplateBuilderStepData {
  // ── setup step ────────────────────────────────────────────────────
  templateName?: string;
  channel?: Channel;
  ratios?: string[];
  selectedFeedId?: string;
  selectedFeedName?: string;
  brief?: string;

  // ── design step ───────────────────────────────────────────────────
  selectedCandidateIndex?: number | null;
  feedMappings?: Record<string, string>;    // fieldId → columnName
  uploadValues?: Record<string, string>;    // fieldId → dataURL or URL
  slotMappings?: Record<string, string>;    // fieldId → explicit slotId override
  customFields?: Array<{                    // user-added fields beyond Gemini
    id: string;
    label: string;
    type: 'text' | 'image' | 'currency' | 'button' | 'asset';
  }>;
  logoVariant?: LogoVariant;
  backgroundColor?: string;
  accentColor?: string;
  textColor?: string;
  fontFamily?: string;

  // ── wireframe (Social channel only) ───────────────────────────────
  selectedWireframeId?: string;
  wireframeFile?: string;

  // index signature — required by WizardStep<S> constraint
  [k: string]: unknown;
}
