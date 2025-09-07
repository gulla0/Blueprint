/**
 * Function under test: buildParamDescriptors(validator, definitions) => ParamDescriptor[]
 * Purpose: Resolve each validator parameter's schema into a UI-friendly descriptor:
 *          - type: bytes/integer/string/boolean/unknown
 *          - semantics: PolicyId/AssetName for common Cardano refs
 *          - minBytes/maxBytes (for bytes validation)
 *          - validate(raw) and coerce(raw) helpers for forms
 * This suite verifies $ref resolution, constraints, validation/coercion, and direct dataType support.
 */

import { describe, it, expect } from "vitest";
import { buildParamDescriptors } from "~/lib/cip57/params"; 
import type { Cip57Arg } from "~/lib/cip57/types";

// Minimal definition table resembling a CIP-57 'definitions' block
const defs = {
  "cardano/assets/PolicyId": { title: "PolicyId", dataType: "bytes" },
  "cardano/assets/AssetName": { title: "AssetName", dataType: "bytes" },
};

// Helper to create a parameter arg that uses a $ref into definitions
const param = (title: string, ref: string): Cip57Arg => ({
  title,
  schema: { $ref: `#/definitions/${ref}` },
});

describe("buildParamDescriptors", () => {
  it("produces descriptors with semantic hints and byte-size constraints", () => {
    const validator = {
      parameters: [
        param("policy", "cardano/assets/PolicyId"),
        param("asset", "cardano/assets/AssetName"),
      ],
    };

    const out = buildParamDescriptors(validator, defs);

    expect(out[0]).toMatchObject({
      name: "policy",
      type: "bytes",
      semantics: "PolicyId",
      minBytes: 28,
      maxBytes: 28,
    });

    expect(out[1]).toMatchObject({
      name: "asset",
      type: "bytes",
      semantics: "AssetName",
      maxBytes: 32,
    });
  });

  it("validates and coerces 'bytes' values", () => {
    const validator = { parameters: [param("policy", "cardano/assets/PolicyId")] };
    const [d] = buildParamDescriptors(validator, defs);

    // Validation catches non-hex and odd-length
    expect(d?.validate("zz")).toMatch(/hex/i);
    expect(d?.validate("ff")).toMatch(/even/i);

    // Correct length for PolicyId (28 bytes -> 56 hex chars)
    expect(d?.validate("a1".repeat(28))).toBeNull();

    // Coercion: if not hex, treat as UTF-8 string and encode to hex
    expect(d?.coerce("DOG")).toBe("444f47");
  });

  it("supports direct dataType without $ref (e.g., integer)", () => {
    const validator = { parameters: [{ title: "n", schema: { dataType: "integer" } }] };
    const [d] = buildParamDescriptors(validator, {});
    expect(d?.validate("12")).toBeNull();         // valid integer
    expect(d?.validate("12.3")).toMatch(/integer/i); // block floats
    expect(d?.coerce("12")).toBe(12);             // coerces to number
  });
});