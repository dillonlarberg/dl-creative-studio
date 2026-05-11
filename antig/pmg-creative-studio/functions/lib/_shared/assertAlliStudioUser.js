"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertAlliStudioUser = assertAlliStudioUser;
const https_1 = require("firebase-functions/v2/https");
const allowlist_1 = require("./allowlist");
/**
 * Caller-identity guard for callable Cloud Functions.
 *
 * Throws permission-denied unless the caller's auth token has:
 *   - email_verified === true
 *   - email === one of the entries in ALLI_STUDIO_USERS
 *
 * Always throws permission-denied (never unauthenticated) so a probe cannot
 * distinguish "no auth" from "auth but not allowlisted".
 *
 * Pair with assertResourceClient when the function takes a URL or path
 * argument: this guard checks WHO is calling; that one checks WHAT they
 * are operating on.
 */
function assertAlliStudioUser(req) {
    const token = req.auth?.token;
    const email = token?.email;
    const verified = token?.email_verified === true;
    if (!verified || !(0, allowlist_1.isAlliStudioUserEmail)(email)) {
        throw new https_1.HttpsError('permission-denied', 'Not an Alli Studio user');
    }
}
//# sourceMappingURL=assertAlliStudioUser.js.map