/**
 * Callable: `cutdownListTracks` (Phase D).
 *
 * Returns the sample-music catalog (each track already carries a long-TTL
 * signed `.url`) so the client can render the track picker. Auth-gated by
 * assertAlliStudioUser (verified email + PMG allowlist), matching the resize
 * callables.
 *
 * Returns: `{ tracks: SampleMusicTrack[] }`.
 */
import { onCall, type CallableRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";

import { assertAlliStudioUser } from "../_shared/assertAlliStudioUser";
import { makeCutdownDeps } from "./deps";

// GEMINI_API_KEY already exists (functions/src/ai.ts uses it). SHASTACK key is
// new — set before deploy in a later phase; not needed to build.
const GEMINI_KEY = defineSecret("GEMINI_API_KEY");
const SHOTSTACK_KEY = defineSecret("SHOTSTACK_API_KEY");

export const cutdownListTracks = onCall(
  {
    enforceAppCheck: true,
    secrets: [GEMINI_KEY, SHOTSTACK_KEY],
    region: "us-central1",
    memory: "512MiB",
    timeoutSeconds: 60,
  },
  async (request: CallableRequest<unknown>) => {
    assertAlliStudioUser(request);
    const deps = makeCutdownDeps(GEMINI_KEY.value(), SHOTSTACK_KEY.value());
    return { tracks: await deps.catalog.list() };
  },
);
