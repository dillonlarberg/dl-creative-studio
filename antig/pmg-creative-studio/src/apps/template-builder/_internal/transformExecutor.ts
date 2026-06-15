/**
 * Client-side transform executor for template field previews.
 *
 * Text transforms run locally so the design/publish preview reflects them instantly.
 * Image transforms (remove_bg, enhance, reframe) require server-side AI processing
 * and are marked server-only — they are skipped in the preview.
 */

type TransformScope = 'text' | 'image' | 'both';

interface TransformDef {
  label: string;
  scope: TransformScope;
  /** If undefined, this transform is server-only and cannot run client-side. */
  fn?: (value: string) => string;
}

export const TRANSFORM_REGISTRY: Record<string, TransformDef> = {
  title_case: {
    label: 'Title Case',
    scope: 'text',
    fn: (v) =>
      v.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()),
  },
  uppercase: {
    label: 'ALL CAPS',
    scope: 'text',
    fn: (v) => v.toUpperCase(),
  },
  truncate_50: {
    label: 'Truncate 50',
    scope: 'text',
    fn: (v) => (v.length > 50 ? `${v.slice(0, 50)}…` : v),
  },
  remove_bg: {
    label: 'Remove BG',
    scope: 'image',
    // server-only — no fn
  },
  enhance: {
    label: 'Enhance',
    scope: 'image',
    // server-only — no fn
  },
  reframe: {
    label: 'Smart Crop',
    scope: 'image',
    // server-only — no fn
  },
};

/**
 * Returns true if any of the given transform IDs are server-only (image AI transforms).
 * Used to show a "transform runs on generation" badge in the UI.
 */
export function hasServerOnlyTransforms(transformIds: string[]): boolean {
  return transformIds.some((id) => {
    const def = TRANSFORM_REGISTRY[id];
    return def && !def.fn;
  });
}

/**
 * Applies all client-runnable transforms in order to the given value.
 * Server-only transforms are silently skipped.
 */
export function applyClientTransforms(
  value: string,
  transformIds: string[],
  fieldType: 'text' | 'image' | 'currency' | 'button' | 'asset'
): string {
  if (!transformIds.length) return value;
  let result = value;
  for (const id of transformIds) {
    const def = TRANSFORM_REGISTRY[id];
    if (!def?.fn) continue;
    if (def.scope !== 'both' && def.scope !== fieldType && !(fieldType === 'currency' && def.scope === 'text')) continue;
    result = def.fn(result);
  }
  return result;
}
