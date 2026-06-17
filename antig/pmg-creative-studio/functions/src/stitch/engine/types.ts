/**
 * Video-stitch v1 types. The reel OUTPUT contract (1080×1920, 15s default) is
 * shared with cutdown so normalized clips concat-copy across both apps.
 */
import { z } from "zod";

export { OUTPUT } from "../../cutdown/engine/types";

export const DEFAULT_BPM = 120;
export const DEFAULT_TARGET_SEC = 15;

/**
 * A reference to one curated source creative. The picker resolves these from a
 * datasource (or upload) and passes a directly-fetchable `srcUrl`. `kind` decides
 * the normalize path (image → looped/held or motion; video → trimmed).
 */
export const AssetRefSchema = z.object({
  datasourceId: z.string().min(1),
  assetId: z.string().min(1),
  kind: z.enum(["image", "video"]),
  srcUrl: z.string().url(),
});
export type AssetRef = z.infer<typeof AssetRefSchema>;
