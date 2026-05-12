import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:dns/promises", () => ({
  default: {
    lookup: vi.fn(),
  },
  lookup: vi.fn(),
}));

import dns from "node:dns/promises";
import { assertSafeSourceUrl } from "./ssrf";

const lookup = dns.lookup as unknown as ReturnType<typeof vi.fn>;

function mockLookup(addrs: Array<{ address: string; family: 4 | 6 }>) {
  lookup.mockResolvedValueOnce(addrs);
}

describe("assertSafeSourceUrl — protocol/host shape", () => {
  beforeEach(() => lookup.mockReset());

  it("rejects http:// (non-https)", async () => {
    await expect(assertSafeSourceUrl("http://example.com/a.jpg")).rejects.toThrow(/SSRF: protocol/);
  });

  it("rejects URLs with credentials in userinfo", async () => {
    await expect(assertSafeSourceUrl("https://user:pw@example.com/a.jpg")).rejects.toThrow(
      /SSRF: URL credentials/,
    );
  });

  it("rejects localhost without resolving", async () => {
    await expect(assertSafeSourceUrl("https://localhost/a.jpg")).rejects.toThrow(/SSRF: disallowed host/);
  });

  it("rejects GCP metadata host without resolving", async () => {
    await expect(assertSafeSourceUrl("https://metadata.google.internal/x")).rejects.toThrow(
      /SSRF: disallowed host/,
    );
  });
});

describe("assertSafeSourceUrl — DNS-resolved IP checks", () => {
  beforeEach(() => lookup.mockReset());

  it("rejects RFC1918 (10.0.0.1)", async () => {
    mockLookup([{ address: "10.0.0.1", family: 4 }]);
    await expect(assertSafeSourceUrl("https://evil.example.com/a.jpg")).rejects.toThrow(
      /SSRF: private address/,
    );
  });

  it("rejects link-local 169.254.169.254 (AWS/GCP metadata IP)", async () => {
    mockLookup([{ address: "169.254.169.254", family: 4 }]);
    await expect(assertSafeSourceUrl("https://aws-metadata.example.com/")).rejects.toThrow(
      /SSRF: private address 169\.254/,
    );
  });

  it("rejects when ANY one resolved address is private (defense-in-depth)", async () => {
    mockLookup([
      { address: "8.8.8.8", family: 4 },
      { address: "127.0.0.1", family: 4 },
    ]);
    await expect(assertSafeSourceUrl("https://dual.example.com/")).rejects.toThrow(/SSRF: private address/);
  });

  it("rejects IPv4-mapped IPv6 in dotted form (::ffff:10.0.0.5)", async () => {
    mockLookup([{ address: "::ffff:10.0.0.5", family: 6 }]);
    await expect(assertSafeSourceUrl("https://stealth.example.com/")).rejects.toThrow(
      /SSRF: private address/,
    );
  });

  it("rejects IPv4-mapped IPv6 in hex form (::ffff:7f00:1 = 127.0.0.1)", async () => {
    mockLookup([{ address: "::ffff:7f00:1", family: 6 }]);
    await expect(assertSafeSourceUrl("https://stealth.example.com/")).rejects.toThrow(
      /SSRF: private address/,
    );
  });

  it("rejects IPv6 ULA (fd00::1)", async () => {
    mockLookup([{ address: "fd00::1", family: 6 }]);
    await expect(assertSafeSourceUrl("https://ula.example.com/")).rejects.toThrow(/SSRF: private address/);
  });

  it("rejects IPv6 link-local (fe80::1)", async () => {
    mockLookup([{ address: "fe80::1", family: 6 }]);
    await expect(assertSafeSourceUrl("https://ll.example.com/")).rejects.toThrow(/SSRF: private address/);
  });
});

describe("assertSafeSourceUrl — numeric IP literals get normalized + caught", () => {
  beforeEach(() => lookup.mockReset());

  it("rejects decimal IPv4 literal (WHATWG URL → 127.0.0.1 → private-IP guard)", async () => {
    // The WHATWG URL parser normalizes 2130706433 → 127.0.0.1 in
    // `url.hostname`, so by the time we call dns.lookup the host is
    // already dotted-decimal and Node returns it verbatim.
    mockLookup([{ address: "127.0.0.1", family: 4 }]);
    await expect(assertSafeSourceUrl("https://2130706433/")).rejects.toThrow(
      /SSRF: private address 127\.0\.0\.1/,
    );
  });

  it("rejects hex IPv4 literal", async () => {
    mockLookup([{ address: "127.0.0.1", family: 4 }]);
    await expect(assertSafeSourceUrl("https://0x7f000001/")).rejects.toThrow(
      /SSRF: private address 127\.0\.0\.1/,
    );
  });
});

describe("assertSafeSourceUrl — happy path returns pinned address", () => {
  beforeEach(() => lookup.mockReset());

  it("returns { url, resolvedIp, family } for a public IPv4", async () => {
    mockLookup([{ address: "151.101.1.140", family: 4 }]);
    const result = await assertSafeSourceUrl("https://cdn.example.com/source.jpg");
    expect(result.url.hostname).toBe("cdn.example.com");
    expect(result.resolvedIp).toBe("151.101.1.140");
    expect(result.family).toBe(4);
  });

  it("returns the first safe address when multiple resolve", async () => {
    mockLookup([
      { address: "151.101.1.140", family: 4 },
      { address: "151.101.65.140", family: 4 },
    ]);
    const result = await assertSafeSourceUrl("https://cdn.example.com/source.jpg");
    expect(result.resolvedIp).toBe("151.101.1.140");
  });
});
