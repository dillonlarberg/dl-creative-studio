import { httpsCallable } from 'firebase/functions';
import { functions } from '../../../firebase';

/**
 * Wraps the two long-running cutdown callables. Both get the 10-min client
 * timeout: generation fans out into AI planning + thumbnailing, and render
 * stitches the chosen plan into an mp4 — either can exceed the SDK default 70s.
 */
export function useCutdown() {
  const generate = httpsCallable(functions, 'cutdownGenerate', { timeout: 600000 });
  const render = httpsCallable(functions, 'cutdownRender', { timeout: 600000 });
  return { generate, render };
}
