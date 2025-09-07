/**
 * Function under test: normalizePlutusVersion(x?: string) => "V1" | "V2" | "V3" | undefined
 * Purpose: Accept many wire forms ("v1", "PlutusV1", "V1") and normalize to "V1"/"V2"/"V3".
 * This suite verifies all common variants and protects against unknown inputs.
 */

import { describe, it, expect } from "vitest";
import { normalizePlutusVersion } from "~/lib/cip57/utils";

describe("normalizePlutusVersion", () => {
  it.each([
    // V1 forms
    ["v1", "V1"],
    ["V1", "V1"],
    ["PlutusV1", "V1"],
    // V2 forms
    ["v2", "V2"],
    ["plutusv2", "V2"],
    // V3 forms
    ["v3", "V3"],
    ["PlutusV3", "V3"],
  ])("maps %s -> %s", (input, out) => {
    expect(normalizePlutusVersion(input)).toBe(out);
  });

  it("returns undefined on an unknown string", () => {
    expect(normalizePlutusVersion("foo")).toBeUndefined();
  });
});