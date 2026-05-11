"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertSafeSourceUrl = assertSafeSourceUrl;
/**
 * SSRF guard for source-image fetching (plan Q4).
 *
 * Rules:
 *  - HTTPS only.
 *  - Resolve hostname; reject if ANY resolved address is:
 *      - private (RFC1918 / RFC4193 ULA)
 *      - link-local (169.254.0.0/16, fe80::/10)
 *      - loopback (127.0.0.0/8, ::1)
 *      - unspecified (0.0.0.0, ::)
 *      - CGNAT (100.64.0.0/10)
 *      - GCP/AWS/Azure metadata
 *  - Numeric/hex IP literals are normalized via dns.lookup before checking.
 *  - No domain allowlist (we don't have a stable list of Alli feed CDN hosts).
 *
 * Returns the resolved IP alongside the URL so the caller can pin its
 * subsequent fetch to that exact address (DNS rebinding mitigation —
 * see plan Q4 / review finding C1). Callers MUST use `result.resolvedIp`
 * rather than re-resolving the hostname.
 *
 * Throws an Error whose message starts with `SSRF:` so `errorClassifier` can
 * route it to the `permanent` bucket.
 */
const promises_1 = __importDefault(require("node:dns/promises"));
const METADATA_HOSTNAMES = new Set([
    "metadata.google.internal",
    "metadata",
    "instance-data",
    "instance-data.ec2.internal",
]);
function isPrivateIPv4(ip) {
    const parts = ip.split(".").map(Number);
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255))
        return false;
    const [a, b] = parts;
    if (a === 10)
        return true; // 10.0.0.0/8
    if (a === 127)
        return true; // loopback
    if (a === 0)
        return true; // 0.0.0.0/8
    if (a === 169 && b === 254)
        return true; // link-local 169.254/16
    if (a === 172 && b >= 16 && b <= 31)
        return true; // 172.16/12
    if (a === 192 && b === 168)
        return true; // 192.168/16
    if (a === 100 && b >= 64 && b <= 127)
        return true; // CGNAT 100.64/10
    if (a === 192 && b === 0 && parts[2] === 0)
        return true; // 192.0.0.0/24
    if (a === 198 && (b === 18 || b === 19))
        return true; // 198.18/15 benchmarking
    if (a >= 224)
        return true; // multicast / reserved
    return false;
}
function ipv4MappedFromIPv6(lower) {
    // Dotted-decimal form anywhere after the ffff: marker, e.g. ::ffff:1.2.3.4
    // or 0:0:0:0:0:ffff:1.2.3.4
    const dot = lower.match(/(?:^|:)ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (dot && dot[1])
        return dot[1];
    // Hex form: ::ffff:HHHH:HHHH where HHHH:HHHH is the 4-byte v4 in hex.
    // Anchored to the end so any leading zero-group expansion still matches.
    const hex = lower.match(/(?:^|:)ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (hex && hex[1] && hex[2]) {
        const hi = parseInt(hex[1], 16);
        const lo = parseInt(hex[2], 16);
        return `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
    }
    return null;
}
function isPrivateIPv6(ip) {
    const lower = ip.toLowerCase();
    if (lower === "::" || lower === "::1")
        return true;
    if (lower.startsWith("fe80:") || lower.startsWith("fe80::"))
        return true; // link-local
    if (/^f[cd]/.test(lower))
        return true; // ULA fc00::/7
    const mapped = ipv4MappedFromIPv6(lower);
    if (mapped && isPrivateIPv4(mapped))
        return true;
    return false;
}
function isPrivateAddress(addr, family) {
    return family === 4 ? isPrivateIPv4(addr) : isPrivateIPv6(addr);
}
/**
 * Throws if the URL is unsafe. Resolves to `{ url, resolvedIp, family }` on
 * success. Callers MUST use `resolvedIp` for the actual fetch (set `Host:`
 * to the original hostname, replace the URL host with the IP) to close the
 * DNS-rebinding TOCTOU between the guard call and the fetch call.
 */
async function assertSafeSourceUrl(rawUrl) {
    let url;
    try {
        url = new URL(rawUrl);
    }
    catch {
        throw new Error(`SSRF: invalid URL`);
    }
    if (url.protocol !== "https:") {
        throw new Error(`SSRF: protocol not https (got ${url.protocol})`);
    }
    // userinfo (e.g. `https://attacker.com@10.0.0.1/`) is suspicious for our
    // use case; reject outright. `new URL` parses 10.0.0.1 as the host here.
    if (url.username || url.password) {
        throw new Error(`SSRF: URL credentials not allowed`);
    }
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
    if (METADATA_HOSTNAMES.has(host)) {
        throw new Error(`SSRF: disallowed host (cloud metadata)`);
    }
    if (host === "localhost") {
        throw new Error(`SSRF: disallowed host (localhost)`);
    }
    // WHATWG URL parser already normalizes hex (`0x7f000001`) and decimal
    // (`2130706433`) IPv4 literals to dotted-decimal in `url.hostname`, so
    // by this point `host` is either a real hostname or a dotted-decimal IP.
    // The address-level check below catches loopback/private after lookup.
    let addrs;
    try {
        addrs = await promises_1.default.lookup(host, { all: true, verbatim: true });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`SSRF: DNS resolution failed (${msg})`);
    }
    if (addrs.length === 0) {
        throw new Error(`SSRF: no DNS records for host`);
    }
    for (const a of addrs) {
        if (isPrivateAddress(a.address, a.family)) {
            throw new Error(`SSRF: private address ${a.address} for host ${host}`);
        }
    }
    // Pin the first safe address for the caller's fetch.
    const first = addrs[0];
    return { url, resolvedIp: first.address, family: first.family };
}
//# sourceMappingURL=ssrf.js.map