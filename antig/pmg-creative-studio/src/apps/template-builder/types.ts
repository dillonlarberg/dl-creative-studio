/**
 * Step-data shape for the template-builder app.
 *
 * Field set is reverse-engineered from UseCaseWizardPage.tsx — every field
 * the monolith reads or writes via setStepData / stepData.X inside a
 * `useCaseId === 'template-builder'` branch ends up here.
 *
 * The shape is intentionally permissive (mostly optionals). New creative
 * runs start with `{}` from manifest.initialStepData(); each step fills
 * in only the fields it owns.
 */

export type Channel = 'Social' | 'Programmatic' | 'Print' | 'Digital Signage';
export type LogoVariant = 'primary' | 'inverse';
export type StressTest = 'normal' | 'shortest' | 'longest';

export interface RequirementField {
  id: string;
  label: string;
  category: 'Brand' | 'Dynamic' | 'System';
  source: string;
  type: 'text' | 'image' | 'currency' | 'button' | 'asset' | string;
  value?: string;
}

export interface SelectedFeed {
  name: string;
  dimensions?: Array<string | { name: string }>;
  measures?: Array<string | { name: string }>;
  [k: string]: unknown;
}

export interface TemplateBuilderStepData {
  // --- context step ---
  jobTitle?: string;
  channel?: Channel;
  ratios?: string[];
  selectedWireframe?: string;
  wireframeFile?: string;

  // BASELINE_ASSETS spread (pre-fills when a wireframe is picked)
  headline1?: string;
  cta?: string;
  promo?: string;
  logo?: string;
  image1?: string;
  image2?: string;
  backgroundimage?: string;
  font?: string;
  background_color?: string;
  cta_button_color?: string;
  headline_color?: string;
  headline?: string;
  image_url?: string;

  // --- intent step ---
  prompt?: string;
  requirements?: RequirementField[];
  areRequirementsApproved?: boolean;

  // --- source step ---
  selectedFeed?: SelectedFeed | null;
  feedSampleData?: Array<Record<string, unknown>>;
  feedMetadata?: unknown;
  stressMap?: { shortest: Record<string, unknown>; longest: Record<string, unknown> };

  // --- mapping step ---
  feedMappings?: Record<string, string>;

  // --- generate step ---
  candidates?: unknown[];
  selectedCandidateIndex?: number | null;

  // --- refine step ---
  textStressTest?: StressTest;
  logoScale?: number;
  logoVariant?: LogoVariant;
  headlineSize?: number;
  priceSize?: number;
  accentColor?: string;
  activeFont?: string;
  backgroundColor?: string;
  overrideHeadline?: string;
  showLogo?: boolean;
  showPrice?: boolean;
  showCTA?: boolean;

  // --- export step ---
  selectedRatios?: string[];

  // Index signature so TemplateBuilderStepData satisfies the
  // `StepData = Record<string, unknown>` constraint on WizardStep<S>
  // and StepRenderProps<S>.
  [k: string]: unknown;
}
