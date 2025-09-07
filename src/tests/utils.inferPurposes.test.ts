/**
 * Function under test: inferPurposes(v: Cip57Validator) => Cip57Purpose[]
 * Purpose: Infer purposes from (a) title suffixes and (b) explicit purpose fields,
 *          including { oneOf: [...] } forms. Tolerates "publish" internally.
 * This suite verifies suffix detection, explicit strings, 'oneOf' lists, and fallback [].
 */

import { describe, it, expect } from "vitest";
import { inferPurposes } from "~/lib/cip57/utils";
import type { Cip57Validator } from "~/lib/cip57/types";

const v = (title: string, purpose?: any): Cip57Validator => ({
  title,
  redeemer: { schema: {}, ...(purpose ? { purpose } : {}) },
});

describe("inferPurposes", () => {
  it("detects purposes from title suffix (.spend/.mint/.withdraw)", () => {
    expect(inferPurposes(v("mod.spend"))).toEqual(["spend"]);
    expect(inferPurposes(v("mod.mint"))).toEqual(["mint"]);
    expect(inferPurposes(v("mod.withdraw"))).toEqual(["withdraw"]);
  });

  it("reads explicit string purpose when provided", () => {
    expect(inferPurposes(v("mod", "spend"))).toEqual(["spend"]);
  });

  it("reads explicit { oneOf: [...] } purposes", () => {
    expect(inferPurposes(v("mod", { oneOf: ["mint", "withdraw"] } as any)).sort()).toEqual([
      "mint",
      "withdraw",
    ]);
  });

  it("tolerates 'publish' purpose via suffix", () => {
    expect(inferPurposes(v("mod.publish"))).toEqual(["publish"]);
  });

  it("returns empty array if nothing is implied or declared", () => {
    expect(inferPurposes(v("mod.else"))).toEqual([]);
  });
});