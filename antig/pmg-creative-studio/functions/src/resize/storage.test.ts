import { describe, it, expect, vi, beforeEach } from "vitest";
import sharp from "sharp";

// ── Mocks must be hoisted above the SUT import ──────────────────────

const mockBucket = {
  getFiles: vi.fn(),
  file: vi.fn(),
};
const mockFile = {
  save: vi.fn(),
  download: vi.fn(),
  name: "",
};

vi.mock("firebase-admin/storage", () => ({
  getStorage: () => ({ bucket: () => mockBucket }),
}));

vi.mock("firebase-functions", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

vi.mock("./ssrf", () => ({
  assertSafeSourceUrl: vi.fn(),
}));

vi.mock("undici", () => ({
  Agent: class FakeAgent {
    constructor(public opts: unknown) {}
  },
}));

import { assertSafeSourceUrl } from "./ssrf";
import {
  stageSourceIfMissing,
  uploadOutput,
  uploadIntermediate,
  deriveSourceKey,
} from "./storage";

const mockedAssertSafe = assertSafeSourceUrl as unknown as ReturnType<typeof vi.fn>;

async function makePng(w = 64, h = 64): Promise<Buffer> {
  return sharp({ create: { width: w, height: h, channels: 3, background: { r: 1, g: 1, b: 1 } } })
    .png()
    .toBuffer();
}

function mockFetchOnce(body: Buffer, headers: Record<string, string> = {}, status = 200) {
  const response = {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
    arrayBuffer: async () =>
      body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis.fetch as any) = vi.fn().mockResolvedValueOnce(response);
}

function configureBucketCacheMiss() {
  mockBucket.getFiles.mockResolvedValueOnce([[]]);
  mockBucket.file.mockReturnValueOnce({ ...mockFile, save: vi.fn().mockResolvedValueOnce(undefined) });
}

function configureBucketCacheHit(name: string, body: Buffer) {
  mockBucket.getFiles.mockResolvedValueOnce([
    [
      {
        name,
        download: vi.fn().mockResolvedValueOnce([body]),
      },
    ],
  ]);
}

beforeEach(() => {
  mockBucket.getFiles.mockReset();
  mockBucket.file.mockReset();
  mockFile.save.mockReset();
  mockFile.download.mockReset();
  mockedAssertSafe.mockReset();
});

describe("deriveSourceKey", () => {
  it("is deterministic for the same URL", () => {
    const a = deriveSourceKey("https://cdn.example.com/img.jpg");
    const b = deriveSourceKey("https://cdn.example.com/img.jpg");
    expect(a).toBe(b);
    expect(a).toHaveLength(16);
  });

  it("is URL-stable (different URLs → different keys)", () => {
    const a = deriveSourceKey("https://cdn.example.com/img.jpg");
    const b = deriveSourceKey("https://cdn.example.com/img2.jpg");
    expect(a).not.toBe(b);
  });
});

describe("stageSourceIfMissing — cache hit", () => {
  it("reads existing source from Storage and returns buffer + metadata", async () => {
    const png = await makePng(123, 456);
    const expectedKey = deriveSourceKey("https://cdn.example.com/cached.png");
    configureBucketCacheHit(
      `clients/acme/apps/ad-resizing/sources/${expectedKey}.png`,
      png,
    );

    const result = await stageSourceIfMissing({
      clientSlug: "acme",
      originalUrl: "https://cdn.example.com/cached.png",
    });

    expect(result.sourceKey).toBe(expectedKey);
    expect(result.width).toBe(123);
    expect(result.height).toBe(456);
    expect(result.mime).toBe("image/png");
    expect(result.buffer.length).toBe(png.length);
    expect(result.storageRef).toBe(`clients/acme/apps/ad-resizing/sources/${expectedKey}.png`);
    // SSRF + fetch must NOT be touched on cache hit
    expect(mockedAssertSafe).not.toHaveBeenCalled();
  });
});

describe("stageSourceIfMissing — cache miss", () => {
  it("runs SSRF guard, pin-fetches, writes to Storage, returns buffer + meta", async () => {
    const png = await makePng(200, 100);
    mockedAssertSafe.mockResolvedValueOnce({
      url: new URL("https://cdn.example.com/new.png"),
      resolvedIp: "151.101.1.140",
      family: 4,
    });
    mockFetchOnce(png, { "content-length": String(png.length) });

    const saveSpy = vi.fn().mockResolvedValueOnce(undefined);
    mockBucket.getFiles.mockResolvedValueOnce([[]]);
    mockBucket.file.mockReturnValueOnce({ save: saveSpy });

    const result = await stageSourceIfMissing({
      clientSlug: "acme",
      originalUrl: "https://cdn.example.com/new.png",
    });

    expect(mockedAssertSafe).toHaveBeenCalledWith("https://cdn.example.com/new.png");
    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(result.width).toBe(200);
    expect(result.height).toBe(100);
    expect(result.mime).toBe("image/png");
    expect(result.buffer.length).toBe(png.length);
    expect(result.storageRef).toMatch(/^clients\/acme\/apps\/ad-resizing\/sources\/[0-9a-f]{16}\.png$/);

    // The Storage path the bucket.file() was called with should match storageRef.
    const fileArg = mockBucket.file.mock.calls[0]?.[0];
    expect(fileArg).toBe(result.storageRef);
  });

  it("propagates SSRF rejection without fetching", async () => {
    mockBucket.getFiles.mockResolvedValueOnce([[]]);
    mockedAssertSafe.mockRejectedValueOnce(new Error("SSRF: private address 10.0.0.1 for host x"));
    // Spy on fetch to confirm it isn't called
    const fetchSpy = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis.fetch as any) = fetchSpy;

    await expect(
      stageSourceIfMissing({
        clientSlug: "acme",
        originalUrl: "https://evil.example.com/x.jpg",
      }),
    ).rejects.toThrow(/SSRF: private address/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("propagates 404 from source URL with status attached for the classifier", async () => {
    mockBucket.getFiles.mockResolvedValueOnce([[]]);
    mockedAssertSafe.mockResolvedValueOnce({
      url: new URL("https://cdn.example.com/missing.jpg"),
      resolvedIp: "1.2.3.4",
      family: 4,
    });
    const response = {
      ok: false,
      status: 404,
      headers: { get: () => null },
      arrayBuffer: async () => new ArrayBuffer(0),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis.fetch as any) = vi.fn().mockResolvedValueOnce(response);

    await expect(
      stageSourceIfMissing({
        clientSlug: "acme",
        originalUrl: "https://cdn.example.com/missing.jpg",
      }),
    ).rejects.toMatchObject({ status: 404, message: expect.stringContaining("404") });
  });

  it("rejects oversized sources via Content-Length", async () => {
    mockBucket.getFiles.mockResolvedValueOnce([[]]);
    mockedAssertSafe.mockResolvedValueOnce({
      url: new URL("https://cdn.example.com/huge.jpg"),
      resolvedIp: "1.2.3.4",
      family: 4,
    });
    const response = {
      ok: true,
      status: 200,
      headers: { get: (k: string) => (k.toLowerCase() === "content-length" ? "104857600" : null) },
      arrayBuffer: async () => new ArrayBuffer(0),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis.fetch as any) = vi.fn().mockResolvedValueOnce(response);

    await expect(
      stageSourceIfMissing({
        clientSlug: "acme",
        originalUrl: "https://cdn.example.com/huge.jpg",
      }),
    ).rejects.toThrow(/source too large/);
  });

  it("rejects when the actual body exceeds the cap (no Content-Length header)", async () => {
    const oversized = Buffer.alloc(51 * 1024 * 1024); // 51MB
    mockBucket.getFiles.mockResolvedValueOnce([[]]);
    mockedAssertSafe.mockResolvedValueOnce({
      url: new URL("https://cdn.example.com/streamy.jpg"),
      resolvedIp: "1.2.3.4",
      family: 4,
    });
    mockFetchOnce(oversized);

    await expect(
      stageSourceIfMissing({
        clientSlug: "acme",
        originalUrl: "https://cdn.example.com/streamy.jpg",
      }),
    ).rejects.toThrow(/source too large/);
  });
});

describe("uploadOutput", () => {
  it("writes to clients/{slug}/apps/ad-resizing/outputs/{outputId}.png and returns the path", async () => {
    const saveSpy = vi.fn().mockResolvedValueOnce(undefined);
    mockBucket.file.mockReturnValueOnce({ save: saveSpy });
    const png = await makePng();

    const ref = await uploadOutput({
      clientSlug: "acme",
      outputId: "out-xyz",
      buffer: png,
    });

    expect(ref).toBe("clients/acme/apps/ad-resizing/outputs/out-xyz.png");
    expect(mockBucket.file).toHaveBeenCalledWith("clients/acme/apps/ad-resizing/outputs/out-xyz.png");
    expect(saveSpy).toHaveBeenCalledWith(png, expect.objectContaining({ contentType: "image/png" }));
    const saveOpts = saveSpy.mock.calls[0]![1] as { metadata: { metadata: { firebaseStorageDownloadTokens: string } } };
    expect(saveOpts.metadata.metadata.firebaseStorageDownloadTokens).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it("mints a fresh download token on every save (re-crop cache-bust)", async () => {
    const saveSpy = vi.fn().mockResolvedValue(undefined);
    mockBucket.file.mockReturnValue({ save: saveSpy });
    const png = await makePng();
    await uploadOutput({ clientSlug: "acme", outputId: "out-xyz", buffer: png });
    await uploadOutput({ clientSlug: "acme", outputId: "out-xyz", buffer: png });
    const t1 = (saveSpy.mock.calls[0]![1] as { metadata: { metadata: { firebaseStorageDownloadTokens: string } } }).metadata.metadata.firebaseStorageDownloadTokens;
    const t2 = (saveSpy.mock.calls[1]![1] as { metadata: { metadata: { firebaseStorageDownloadTokens: string } } }).metadata.metadata.firebaseStorageDownloadTokens;
    expect(t1).not.toBe(t2);
  });
});

describe("uploadIntermediate", () => {
  it("writes intermediates under intermediates/{batchId}/{outputId}/{kind}.png", async () => {
    const saveSpy = vi.fn().mockResolvedValueOnce(undefined);
    mockBucket.file.mockReturnValueOnce({ save: saveSpy });
    const png = await makePng();

    await uploadIntermediate({
      clientSlug: "acme",
      batchId: "b1",
      outputId: "o1",
      kind: "canvas",
      buffer: png,
    });

    expect(mockBucket.file).toHaveBeenCalledWith(
      "clients/acme/apps/ad-resizing/intermediates/b1/o1/canvas.png",
    );
    expect(saveSpy).toHaveBeenCalled();
  });

  it("swallows errors (non-fatal per plan)", async () => {
    mockBucket.file.mockReturnValueOnce({
      save: vi.fn().mockRejectedValueOnce(new Error("write quota exhausted")),
    });

    await expect(
      uploadIntermediate({
        clientSlug: "acme",
        batchId: "b1",
        outputId: "o1",
        kind: "mask",
        buffer: Buffer.from("x"),
      }),
    ).resolves.toBeUndefined();
  });
});
