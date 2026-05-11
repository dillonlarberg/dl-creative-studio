import { describe, it, expect } from "vitest";
import { classifyError } from "./errorClassifier";

describe("classifyError — permanent bucket", () => {
  it("classifies 400 content_policy as permanent", () => {
    const e = Object.assign(new Error("content_policy violation: prompt rejected"), { status: 400 });
    const r = classifyError(e);
    expect(r.category).toBe("permanent");
    expect(r.reason).toBe("p2_content_policy");
  });

  it("classifies 400 safety as permanent", () => {
    const e = Object.assign(new Error("safety filter triggered"), { status: 400 });
    expect(classifyError(e).category).toBe("permanent");
  });

  it("classifies 403 org-verification as permanent", () => {
    const e = Object.assign(new Error("organization_must_be_verified to use this model"), { status: 403 });
    const r = classifyError(e);
    expect(r.category).toBe("permanent");
    expect(r.reason).toBe("p2_org_verification");
  });

  it("classifies SSRF rejection as permanent", () => {
    const r = classifyError(new Error("SSRF: private address 10.0.0.1 for host foo.bar"));
    expect(r.category).toBe("permanent");
    expect(r.reason).toBe("ssrf_rejected");
  });

  it("classifies 404 source URL as permanent", () => {
    const e = Object.assign(new Error("not found"), { status: 404 });
    expect(classifyError(e).category).toBe("permanent");
  });

  it("classifies invalid legalGenDims as permanent", () => {
    expect(classifyError(new Error("legalGenDims: invalid target 0×100")).category).toBe("permanent");
  });

  it("classifies sharp decode failure as permanent", () => {
    expect(
      classifyError(new Error("Input buffer contains unsupported image format")).category,
    ).toBe("permanent");
  });

  it("classifies ZodError as permanent", () => {
    const e = new Error("schema validation failed");
    e.name = "ZodError";
    expect(classifyError(e).category).toBe("permanent");
  });

  it("classifies Gemini API_KEY_INVALID as permanent", () => {
    const e = new Error(
      '{"error":{"code":400,"message":"API key not valid. Please pass a valid API key.","status":"INVALID_ARGUMENT","details":[{"reason":"API_KEY_INVALID"}]}}',
    );
    const r = classifyError(e);
    expect(r.category).toBe("permanent");
    expect(r.reason).toBe("api_key_invalid");
  });

  it("classifies OpenAI authentication_error as permanent", () => {
    const e = Object.assign(new Error("Incorrect API key provided — authentication_error"), {
      status: 401,
    });
    expect(classifyError(e).reason).toBe("api_key_invalid");
  });
});

describe("classifyError — quota (permanent, precedes 429 rate-limit)", () => {
  it("classifies 429 + RESOURCE_EXHAUSTED as permanent quota", () => {
    const e = Object.assign(new Error("RESOURCE_EXHAUSTED: quota exceeded for model"), {
      status: 429,
    });
    const r = classifyError(e);
    expect(r.category).toBe("permanent");
    expect(r.reason).toBe("quota_exhausted");
  });

  it("classifies 429 + insufficient_quota (OpenAI) as permanent quota", () => {
    const e = Object.assign(new Error("You exceeded your current quota, please check insufficient_quota"), {
      status: 429,
    });
    expect(classifyError(e).reason).toBe("quota_exhausted");
  });
});

describe("classifyError — transient bucket", () => {
  it("classifies plain 429 rate-limit (no quota signal) as transient", () => {
    const e = Object.assign(new Error("rate limit hit"), { status: 429 });
    expect(classifyError(e).category).toBe("transient");
  });

  it("classifies 500/502/503 as transient", () => {
    for (const status of [500, 502, 503]) {
      const e = Object.assign(new Error("upstream broken"), { status });
      expect(classifyError(e).category).toBe("transient");
    }
  });

  it("classifies ECONNRESET as transient", () => {
    const e = Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" });
    expect(classifyError(e).category).toBe("transient");
  });

  it("classifies fetch failed / network as transient", () => {
    expect(classifyError(new Error("fetch failed")).category).toBe("transient");
  });

  it("classifies timeout as transient", () => {
    expect(classifyError(new Error("operation timed out")).category).toBe("transient");
  });

  it("defaults unknown errors to transient", () => {
    const r = classifyError(new Error("something weird happened"));
    expect(r.category).toBe("transient");
    expect(r.reason).toBe("unknown");
  });
});
