import type { ReactNode } from 'react';
import type { AppId, ClientSlug, CreativeId } from '../platform/firebase/paths';

/**
 * The shared contract that every app module in src/apps/<id>/ implements.
 *
 * The generic WizardShell at src/platform/wizard/WizardShell.tsx is the only
 * code that knows about these types at runtime. Per-app step components
 * narrow `StepData` to their own typed shape via the `WizardStep<S>` generic.
 */

export type StepData = Record<string, unknown>;

/**
 * A named requirement surfaced in the wizard's footer checklist
 * (e.g. "Project Title", "Channel", "Size Selected"). When a step's
 * validate() returns one or more requirements with `met: false`,
 * the chrome renders the green/gray checklist and disables Continue.
 */
export interface ValidationRequirement {
  label: string;
  met: boolean;
}

export type ValidationResult =
  | { ok: true }
  | {
      ok: false;
      /** Optional free-text reason — used as a fallback when no requirements are supplied. */
      reason?: string;
      /** Structured per-field requirements rendered as the footer checklist. */
      requirements?: ValidationRequirement[];
    };

export interface AppContext {
  client: { slug: ClientSlug };
  creativeId: CreativeId | null;
}

export interface StepContext<S extends StepData = StepData> extends AppContext {
  stepData: S;
  mergeStepData: (patch: Partial<S>) => void;
  navigate: (target: { stepId?: string; replace?: boolean }) => void;
}

export interface StepRenderProps<S extends StepData = StepData> extends StepContext<S> {}

export interface WizardStep<S extends StepData = StepData> {
  id: string;
  name: string;
  /** One-sentence description shown below the step title in the wizard card. */
  description?: string;
  render: (props: StepRenderProps<S>) => ReactNode;
  validate: (data: S) => ValidationResult;
  onEnter?: (ctx: StepContext<S>) => void | Promise<void>;
  onLeave?: (ctx: StepContext<S>) => void | Promise<void>;
  next?: (ctx: StepContext<S>) => string | undefined;
  /**
   * Async navigation hook. Used by lifted apps (e.g. video-cutdown) whose
   * Continue button must kick off long-running server work (Gemini analysis,
   * FFmpeg stitching) before deciding the next step. The shell awaits
   * `submit` while showing pending state, then routes to `nextStepId` (or
   * falls through to advance-by-index if undefined).
   *
   * Contract: if `submit` rejects, the user stays on the current step and
   * the error surfaces via step-local state. The shell does NOT navigate
   * and does NOT mutate any persisted state on rejection. Step components
   * are responsible for deferring writes until `submit` resolves.
   *
   * If both `submit` and `next` are defined, `submit` wins.
   */
  submit?: (ctx: StepContext<S>) => Promise<{ nextStepId?: string }>;
}

/** Content for the dashboard "More Info" Glance popover. */
export interface AppOverview {
  /** Tighter than `description`, ~8–12 words; the popover headline line. */
  blurb: string;
  /** "Before"/source image path, e.g. /app-overviews/ad-resizing/before.webp */
  before: string;
  /** 1–6 "after"/output image paths. */
  after: string[];
}

export interface AppManifest<S extends StepData = StepData> {
  id: AppId;
  basePath: string;
  title: string;
  /** One-sentence description shown under the title in the wizard header. */
  description?: string;
  /** Optional Glance-popover overview shown by the dashboard "More Info" button. */
  overview?: AppOverview;
  steps: WizardStep<S>[];
  onMount?: (ctx: AppContext) => void | Promise<void>;
  initialStepData: () => S;
  /**
   * Lifecycle status. 'live' apps render the full wizard chrome (default).
   * 'preview' apps render a "Coming soon" stub view via WizardShell — no
   * Continue button, no checklist, no step persistence. Used by Step 1 of
   * the AdLabs v1 plan to register Video Stitch as a clickable card on
   * the dashboard before the lift work ships.
   */
  status?: 'live' | 'preview';
  /**
   * When true, the dashboard tile renders disabled until the client's
   * brand-standards (Asset House) gate is satisfied. Replaces the legacy
   * `UseCase.requiresBrandStandards` field for registry-driven apps.
   */
  requiresBrandStandards?: boolean;
}
