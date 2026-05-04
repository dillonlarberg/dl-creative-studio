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

export type ValidationResult =
  | { ok: true }
  | { ok: false; reason: string };

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
  render: (props: StepRenderProps<S>) => ReactNode;
  validate: (data: S) => ValidationResult;
  onEnter?: (ctx: StepContext<S>) => void | Promise<void>;
  onLeave?: (ctx: StepContext<S>) => void | Promise<void>;
  next?: (ctx: StepContext<S>) => string | undefined;
}

export interface AppManifest<S extends StepData = StepData> {
  id: AppId;
  basePath: string;
  title: string;
  steps: WizardStep<S>[];
  onMount?: (ctx: AppContext) => void | Promise<void>;
  initialStepData: () => S;
}
