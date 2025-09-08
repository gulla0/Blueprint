/**
 * Method under test: Blueprint57#requiresParameters(v) => boolean
 * Purpose: Returns true if validator has a non-empty parameters definition.
 */

import { describe, it, expect, vi } from "vitest";
vi.mock("@meshsdk/core", () => ({
  serializePlutusScript: vi.fn((_ps, _stake, _netId, _isScriptStake) => ({
    address: "addr_test1qqqqqqqqqqqqqqqqqq",
  })),
}));
vi.mock("@meshsdk/core-csl", () => ({
  applyParamsToScript: vi.fn((code: string) => code),
}));

import { Blueprint57 } from "~/lib/cip57/blueprint";
import dedog from "../../fixtures/dedog.blueprint.json";

function makeBp(validators: any) {
  // Minimal blueprint-like object accepted by Blueprint57
  return new Blueprint57({ validators } as any);
}

describe("Blueprint57.requiresParameters", () => {
  it("returns true when parameters are present (fixture happy-path)", () => {
    const bp = new Blueprint57(dedog as any);
    const v = bp.listValidators().find((x) => x.title.includes("noob_v2"));
    expect(v).toBeTruthy();
    expect(bp.requiresParameters(v!)).toBe(true);
  });

  it("returns false when parameters key is missing", () => {
    const bp = makeBp({
      A: { title: "NoParams", script: { type: "Plutus", version: "V2" } },
    });
    const v = bp.listValidators()[0];
    expect(bp.requiresParameters(v!)).toBe(false);
  });

  it("returns false when parameters is an empty array", () => {
    const bp = makeBp({
      B: { title: "EmptyParams", parameters: [] },
    });
    const v = bp.listValidators()[0];
    expect(bp.requiresParameters(v!)).toBe(false);
  });

  it("returns false when parameters has oneOf but it is empty", () => {
    const bp = makeBp({
      C: {
        title: "OneOfEmpty",
        parameters: [{ oneOf: [] }],
      },
    });
    const v = bp.listValidators()[0];
    expect(bp.requiresParameters(v!)).toBe(false);
  });

  it("returns true when parameters has arg-level oneOf with at least one option", () => {
    const bp = makeBp({
      D: {
        title: "OneOfSome",
        parameters: [
          {
            oneOf: [
              {
                title: "Policy",
                schema: { dataType: "bytes" },
              },
            ],
          },
        ],
      },
    });
    const v = bp.listValidators()[0];
    expect(bp.requiresParameters(v!)).toBe(true);
  });

  it("returns true when argument exists but schema itself uses oneOf (schema-level)", () => {
    const bp = makeBp({
      E: {
        title: "SchemaOneOf",
        parameters: [
          {
            title: "Param",
            schema: {
              oneOf: [
                { dataType: "integer" },
                { dataType: "bytes" },
              ],
            },
          },
        ],
      },
    });
    const v = bp.listValidators()[0];
    // Still a parameter: user must choose which schema branch → true
    expect(bp.requiresParameters(v!)).toBe(true);
  });

  it("returns false defensively for non-array / null parameters", () => {
    const bp = makeBp({
      F: { title: "WeirdParams", parameters: null as any },
      G: { title: "WeirderParams", parameters: {} as any },
    });
    const [v1, v2] = bp.listValidators();
    expect(bp.requiresParameters(v1!)).toBe(false);
    expect(bp.requiresParameters(v2!)).toBe(false);
  });

  it("handles multiple validators and only flags the ones with parameters", () => {
    const bp = makeBp({
      H: { title: "Plain" },
      I: { title: "WithParam", parameters: [{ title: "P", schema: { dataType: "bytes" } }] },
      J: { title: "Empty", parameters: [] },
    });
    const [h, i, j] = bp.listValidators();
    expect(bp.requiresParameters(h!)).toBe(false);
    expect(bp.requiresParameters(i!)).toBe(true);
    expect(bp.requiresParameters(j!)).toBe(false);
  });
});