import type { ReactNode } from 'react';
import type { ValidationResult, ValidationRequirement, StepContext } from '../types';
import type { SelectedFeed } from '../../platform/datasources/types';

// Re-export platform types so step files can import from a single local path
// after the migration. No duplication — these are re-exports, not copies.
export type { ValidationResult, ValidationRequirement, StepContext };
export type { SelectedFeed };

// Local alias for WizardStep — structurally identical to src/apps/types.ts#WizardStep.
// Severs the template-builder's import of the platform wizard type without
// requiring any changes to step definition objects (name, description, etc.).
export interface TemplateBuilderStep<
  S extends Record<string, unknown> = TemplateBuilderStepData
> {
  id: string;
  name: string;
  description?: string;
  render: (props: StepContext<S>) => ReactNode;
  validate: (data: S) => ValidationResult;
  onEnter?: (ctx: StepContext<S>) => void | Promise<void>;
  onLeave?: (ctx: StepContext<S>) => void | Promise<void>;
  next?: (ctx: StepContext<S>) => string | undefined;
  submit?: (ctx: StepContext<S>) => Promise<{ nextStepId?: string }>;
}

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

export type AlliAction =
  | { type: 'add_transform'; fieldId: string; transform: string }
  | { type: 'remove_transform'; fieldId: string; transform: string }
  | { type: 'suggest_mapping'; fieldId: string; column: string }
  | { type: 'suggest_slot'; fieldId: string; slotId: string };

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
  fieldTransforms?: Record<string, string[]>;    // fieldId → transform IDs
  askAlliMessages?: Array<{                   // persistent chat history
    role: 'user' | 'assistant';
    content: string;
    actions?: AlliAction[];
  }>;
  logoVariant?: LogoVariant;
  backgroundColor?: string;
  accentColor?: string;
  textColor?: string;
  fontFamily?: string;

  zoneStyles?: Record<string, ZoneStyle>;       // slotId → per-zone style overrides
  staticValues?: Record<string, string>;           // fieldId → static text value (when source mode is 'static')
  fieldSourceMode?: Record<string, 'feed' | 'static' | 'ai'>;  // fieldId → active source tab per field
  aiSuggestedMappings?: Record<string, true>;      // fieldId → true when AI auto-suggested; cleared on Accept

  // ── wireframe (Social channel only) ───────────────────────────────
  selectedWireframeId?: string;
  wireframeFile?: string;

  // ── publish step ──────────────────────────────────────────────────
  /** Firestore ID of the templateLibrary document created on first save.
   *  Stored here so subsequent saves call upsertDraft instead of saveDraft,
   *  preventing duplicate records from repeated "Save as Draft" / "Publish" clicks. */
  templateLibraryId?: string;

  // index signature — required by WizardStep<S> constraint
  [k: string]: unknown;
}

export interface ZoneStyle {
  fontSize?: number;        // applied as font-size: Npx
  color?: string;           // applied as color
  backgroundColor?: string; // applied as background-color
  fontWeight?: 'bold' | 'normal';
  fontStyle?: 'italic' | 'normal';
  textDecoration?: 'underline' | 'none';
}
