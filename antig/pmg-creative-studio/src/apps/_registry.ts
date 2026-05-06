import type { AppManifest } from './types';
import templateBuilderManifest from './template-builder/manifest';
import batchVariantsManifest from './batch-variants/manifest';
import videoCutdownManifest from './video-cutdown/manifest';
import resizeImageManifest from './resize-image/manifest';

// Per-app manifests are registered here as they land. Task 6 of PR 3 adds
// template-builder (redirect from edit-image). PRs 4-9 add the rest.
// Keep this list alphabetized by basePath.

/**
 * Boot-time-validated list of every app module mounted in this build.
 *
 * Adding a new app:
 *   1. Implement `src/apps/<id>/manifest.ts` exporting the AppManifest as default.
 *   2. Add one import + one entry to `MANIFESTS` below.
 *   3. App becomes routable at `/:clientSlug/${manifest.basePath}/*` via the
 *      route mount in `src/App.tsx`.
 *
 * Validation runs once at module load — any collision or malformed basePath
 * throws synchronously and Vite refuses to boot. That's intentional: better
 * to fail at startup than to silently route the wrong app.
 */

const BASE_PATH_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

export function assertValidBasePath(id: string, basePath: string): void {
  if (!basePath || !BASE_PATH_PATTERN.test(basePath)) {
    throw new Error(
      `App registry: manifest "${id}" has invalid basePath ${JSON.stringify(
        basePath
      )} — must be a non-empty kebab-case slug (no slashes, no whitespace).`
    );
  }
}

export function assertNoBasePathCollisions(manifests: AppManifest[]): void {
  const seen = new Map<string, string>();
  for (const manifest of manifests) {
    const prior = seen.get(manifest.basePath);
    if (prior) {
      throw new Error(
        `App registry: basePath collision — manifests "${prior}" and "${manifest.id}" both declare basePath "${manifest.basePath}".`
      );
    }
    seen.set(manifest.basePath, manifest.id);
  }
}

export function buildRegistry(manifests: AppManifest[]): readonly AppManifest[] {
  for (const manifest of manifests) {
    assertValidBasePath(manifest.id, manifest.basePath);
  }
  assertNoBasePathCollisions(manifests);
  return Object.freeze([...manifests]);
}

/**
 * Registry-level feature flags. Manifests gated by env flags are included
 * conditionally so that pages reading `getRegistry()` never have to know about
 * the flag — they just see fewer cards. Step 1 of the AdLabs v1 plan uses
 * this to hide Video Cutdown's card on the dashboard until Step 2 ships.
 */
const FEATURE_VIDEO_CUTDOWN_LIFT =
  import.meta.env.VITE_FEATURE_VIDEO_CUTDOWN_LIFT === 'true';

const MANIFESTS: AppManifest[] = [
  resizeImageManifest as AppManifest,
  templateBuilderManifest as AppManifest,
  batchVariantsManifest as AppManifest,
];

if (FEATURE_VIDEO_CUTDOWN_LIFT) {
  // Step 2 stub: video-cutdown is a preview-status placeholder until the
  // full lift from UseCaseWizardPage ships. Registry stays clean of
  // half-built apps when the flag is off (default).
  MANIFESTS.push(videoCutdownManifest as AppManifest);
}

const REGISTRY = buildRegistry(MANIFESTS);

export function getRegistry(): readonly AppManifest[] {
  return REGISTRY;
}

export function getManifestByBasePath(basePath: string): AppManifest | undefined {
  return REGISTRY.find((m) => m.basePath === basePath);
}

export function getManifestById(id: AppManifest['id']): AppManifest | undefined {
  return REGISTRY.find((m) => m.id === id);
}
