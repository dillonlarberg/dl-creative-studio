// src/platform/datasources/types.ts

/**
 * An Alli (Cube.js) model the user can pick as a datasource. Canonical home
 * for this type — `template-builder/types.ts` re-exports it for back-compat.
 */
export interface SelectedFeed {
  name: string;
  dimensions?: Array<string | { name: string }>;
  measures?: Array<string | { name: string }>;
  [k: string]: unknown;
}
