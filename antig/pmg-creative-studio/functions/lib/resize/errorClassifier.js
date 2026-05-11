"use strict";
/**
 * Two-bucket error classifier for the resize pipeline.
 *
 * Decision Q12 (plan §Q12): every callable failure resolves to one of:
 *   - 'transient'  → UI shows Retry button
 *   - 'permanent'  → UI shows dead tile, no Retry
 *
 * The function never throws. Unknown errors default to 'transient' (favor
 * letting the user retry) unless the message matches a known permanent
 * pattern.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.classifyError = classifyError;
function extract(err) {
    if (err && typeof err === "object") {
        const e = err;
        return {
            status: typeof e.status === "number" ? e.status : undefined,
            code: typeof e.code === "string" ? e.code : undefined,
            name: typeof e.name === "string" ? e.name : undefined,
            message: typeof e.message === "string" ? e.message : String(err),
        };
    }
    return { message: String(err) };
}
// Order matters: first match wins.
const RULES = [
    // ── Permanent ───────────────────────────────────────────────────
    {
        reason: "p2_content_policy",
        category: "permanent",
        match: (e) => e.status === 400 && /content_policy|safety/i.test(e.message),
    },
    {
        reason: "p2_org_verification",
        category: "permanent",
        match: (e) => e.status === 403 && /organization_must_be_verified|verified/i.test(e.message),
    },
    {
        reason: "p1_safety_block",
        category: "permanent",
        match: (e) => /safety|blocked|prohibited_content/i.test(e.message) && /gemini|p1/i.test(e.message),
    },
    {
        reason: "ssrf_rejected",
        category: "permanent",
        match: (e) => /ssrf|disallowed host|private address|not https/i.test(e.message),
    },
    {
        reason: "source_url_not_found",
        category: "permanent",
        match: (e) => e.status === 404 || /source url 404|originalUrl.*404/i.test(e.message),
    },
    {
        reason: "dimension_out_of_bounds",
        category: "permanent",
        match: (e) => /dimension .* out of bounds|legalGenDims:.*invalid/i.test(e.message),
    },
    {
        reason: "sharp_decode_failed",
        category: "permanent",
        match: (e) => /unsupported image format|Input buffer contains unsupported|Input file is missing/i.test(e.message),
    },
    {
        reason: "p1_validation_after_retry",
        category: "permanent",
        match: (e) => e.name === "ZodError" || (/P1 returned no text|JSON|schema/i.test(e.message) && /attempt 2|retry/i.test(e.message)),
    },
    {
        // Gemini / OpenAI return 400 INVALID_ARGUMENT with an API_KEY_INVALID
        // detail when the bound secret value is rejected. Won't self-heal until
        // the secret is rotated, so route to permanent — a Retry button on this
        // would burn cycles against a broken credential.
        reason: "api_key_invalid",
        category: "permanent",
        match: (e) => /API[_ ]key not valid|API_KEY_INVALID|invalid[_ ]api[_ ]key|authentication[_ ]error/i.test(e.message),
    },
    // ── Quota exhaustion (must precede generic 429) ─────────────────
    // Gemini / OpenAI return 429 with a quota-specific body when the hard
    // billing/RPM ceiling is hit. Retry storms here are wasteful and won't
    // self-heal until billing/quota is fixed, so route to permanent.
    {
        reason: "quota_exhausted",
        category: "permanent",
        match: (e) => e.status === 429 &&
            /quota|RESOURCE_EXHAUSTED|billing|insufficient_quota/i.test(e.message),
    },
    // ── Transient ───────────────────────────────────────────────────
    {
        reason: "rate_limited",
        category: "transient",
        match: (e) => e.status === 429,
    },
    {
        reason: "upstream_5xx",
        category: "transient",
        match: (e) => typeof e.status === "number" && e.status >= 500 && e.status < 600,
    },
    {
        reason: "network_error",
        category: "transient",
        match: (e) => /ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up|network/i.test(e.code ?? "") || /ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up|fetch failed/i.test(e.message),
    },
    {
        reason: "timeout",
        category: "transient",
        match: (e) => /timeout|timed out/i.test(e.message),
    },
];
function classifyError(err) {
    const e = extract(err);
    for (const rule of RULES) {
        if (rule.match(e)) {
            return { category: rule.category, message: e.message, reason: rule.reason };
        }
    }
    return { category: "transient", message: e.message, reason: "unknown" };
}
//# sourceMappingURL=errorClassifier.js.map