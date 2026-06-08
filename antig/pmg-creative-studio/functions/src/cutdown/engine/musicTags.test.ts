import { describe, it, expect } from "vitest";
import { MoodSchema, GenreSchema, VocalsSchema, UseCaseTagSchema, EnergySchema } from "./musicTags";
describe("music tag vocabularies", () => {
  it("accepts known values", () => {
    expect(MoodSchema.parse("energetic")).toBe("energetic");
    expect(GenreSchema.parse("electronic")).toBe("electronic");
    expect(VocalsSchema.parse("instrumental")).toBe("instrumental");
    expect(UseCaseTagSchema.parse("product")).toBe("product");
    expect(EnergySchema.parse(3)).toBe(3);
  });
  it("rejects unknown values", () => {
    expect(() => MoodSchema.parse("spicy")).toThrow();
    expect(() => EnergySchema.parse(6)).toThrow();
  });
});
